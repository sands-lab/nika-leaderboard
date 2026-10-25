"""Propose release dates and reference prices for submitted models.

For every submitted ``agent.model`` without a catalog entry, query public,
machine-readable sources and add an entry to ``catalog/models.json`` and
``catalog/pricing.json``. For models already priced, append a new dated quote
when a source's rate has changed; earlier quotes are never rewritten, so a
published submission's cost does not move.

Source order:

* Proprietary models: release date and rates from models.dev, cross-checked
  against OpenRouter and LiteLLM. models.dev wins when they disagree.
* Open weights: rates from OpenRouter, joined on ``hugging_face_id``; release
  date from the first commit that adds weights to the Hugging Face repo.

Icons for the model column (see ``vendors.py``) come from LobeHub first: each
submitted model and its vendor are matched against LobeHub's icon index, and
the matches go to ``catalog/lobehub.json`` with the SVGs under
``web/public/providers/lobehub/``. The vendor's Hugging Face organization
supplies its display name, and its avatar when LobeHub has no icon
(``catalog/hf_orgs.json``, ``web/public/providers/hf/``). The weekly run
re-matches everything and re-reads every source, so a changed icon, avatar, or
name shows up in the proposal. Anything set by hand in ``catalog/vendors.json``
is left alone.

The script only edits those files and writes a Markdown report. A scheduled
workflow opens a pull request with them for a curator to review.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote as urlquote

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_catalog import (  # noqa: E402
    UNAVAILABLE,
    find_key,
    model_slug,
    submitted_models,
    validate_catalog,
)
from vendors import (  # noqa: E402
    HF_ICON_DIR,
    HF_ORGS_FILE,
    ICON_ROOT,
    LOBEHUB_FILE,
    LOBEHUB_ICON_DIR,
    load_hf_orgs,
    load_lobehub,
    load_vendors,
    lobehub_model_match,
    lobehub_vendor_match,
    manual_model_icon,
    model_key,
    submitted_vendors,
)

MODELS_DEV = "https://models.dev/api.json"
OPENROUTER = "https://openrouter.ai/api/v1/models"
OPENROUTER_ENDPOINTS = "https://openrouter.ai/api/v1/models/{id}/endpoints"
LITELLM = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
HF_MODEL = "https://huggingface.co/api/models/{repo}"
HF_COMMITS = "https://huggingface.co/api/models/{repo}/commits/main?p={page}"
HF_TREE = "https://huggingface.co/api/models/{repo}/tree/{rev}"
HF_ORG = "https://huggingface.co/api/organizations/{name}/overview"
HF_USER = "https://huggingface.co/api/users/{name}/overview"
# LobeHub's icon index lives in its repository; the icons ship as an npm package.
LOBEHUB_TOC = "https://raw.githubusercontent.com/lobehub/lobe-icons/master/src/toc.json"
LOBEHUB_NPM = "https://registry.npmjs.org/@lobehub/icons-static-svg/latest"
LOBEHUB_SVG = "https://unpkg.com/@lobehub/icons-static-svg@{version}/icons/{file}"
# The site's --ink: single-colour icons are drawn light, for the dark page.
LIGHT_INK = b"#e8edf5"
# The disc behind vector icons (--panel-raised). A colour icon none of whose
# colours reaches WCAG's 3:1 for graphics against it is drawn in ink instead.
BADGE_BG = "#121722"
MIN_CONTRAST = 3.0

# Vendors whose own list price is the reference for their proprietary models,
# keyed by models.dev provider ID. Citations point at the vendor's pages, not
# at the aggregator the numbers were read from; ``{id}`` is the model ID.
PROVIDERS: dict[str, dict[str, str]] = {
    "anthropic": {
        "name": "Anthropic",
        "pricing": "https://www.anthropic.com/{id}",
        "announcement": "https://www.anthropic.com/{id}",
        "model_page": "https://www.anthropic.com/{id}",
    },
    "openai": {
        "name": "OpenAI",
        "pricing": "https://developers.openai.com/api/docs/pricing",
        "announcement": "https://developers.openai.com/api/docs/models/{id}",
        "model_page": "https://developers.openai.com/api/docs/models/{id}",
    },
    "google": {
        "name": "Google",
        "pricing": "https://ai.google.dev/gemini-api/docs/pricing",
        "announcement": "https://ai.google.dev/gemini-api/docs/models/{id}",
        "model_page": "https://ai.google.dev/gemini-api/docs/models/{id}",
    },
    "mistral": {
        "name": "Mistral AI",
        "pricing": "https://mistral.ai/pricing#api-pricing",
        "announcement": "https://docs.mistral.ai/getting-started/models/",
        "model_page": "https://docs.mistral.ai/getting-started/models/",
    },
    "xai": {
        "name": "xAI",
        "pricing": "https://docs.x.ai/docs/models",
        "announcement": "https://docs.x.ai/docs/models/{id}",
        "model_page": "https://docs.x.ai/docs/models/{id}",
    },
    "deepseek": {
        "name": "DeepSeek",
        "pricing": "https://api-docs.deepseek.com/quick_start/pricing",
        "announcement": "https://api-docs.deepseek.com/news/news",
        "model_page": "https://api-docs.deepseek.com/quick_start/pricing",
    },
}

# Checkpoint suffixes that change precision, not weights. A quote for the base
# weights stands in for these, with a note saying so.
QUANT_SUFFIX = re.compile(
    r"[-_.](fp8|fp16|bf16|int4|int8|awq|gptq|gguf|mlx|w4a16|w8a8|nvfp4|mxfp4)$",
    re.IGNORECASE,
)
WEIGHT_FILE = re.compile(r"\.(safetensors|bin|gguf|pt|pth)$")
REL_TOL = 1e-9

Fetch = Callable[[str], Any]


def http_json(url: str) -> Any:
    request = urllib.request.Request(
        url, headers={"User-Agent": "nika-leaderboard-resolver", "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def http_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "nika-leaderboard-resolver"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


class Sources:
    """Cached access to the public catalogs; a failed fetch reads as missing."""

    def __init__(self, fetch: Fetch = http_json, fetch_bytes: Callable[[str], bytes] = http_bytes):
        self._fetch = fetch
        self._fetch_bytes = fetch_bytes
        self._cache: dict[str, Any] = {}
        self.failures: list[str] = []
        # URLs that answered 404 when asked with ``missing_ok``: an answer, not a failure.
        self.absent: set[str] = set()

    def get(self, url: str, *, missing_ok: bool = False, binary: bool = False) -> Any:
        if url not in self._cache:
            try:
                self._cache[url] = (self._fetch_bytes if binary else self._fetch)(url)
            except urllib.error.HTTPError as exc:
                if not (missing_ok and exc.code == 404):
                    self.failures.append(f"{url}: {exc}")
                else:
                    self.absent.add(url)
                self._cache[url] = None
            except (urllib.error.URLError, OSError, ValueError) as exc:
                self.failures.append(f"{url}: {exc}")
                self._cache[url] = None
        return self._cache[url]

    def models_dev(self) -> dict[str, Any]:
        return self.get(MODELS_DEV) or {}

    def openrouter(self) -> list[dict[str, Any]]:
        return (self.get(OPENROUTER) or {}).get("data") or []

    def litellm(self) -> dict[str, Any]:
        return self.get(LITELLM) or {}


def per_million(value: Any) -> float | None:
    try:
        rate = float(value) * 1_000_000
    except (TypeError, ValueError):
        return None
    return round(rate, 6) if math.isfinite(rate) else None


def close(a: float | None, b: float | None) -> bool:
    return a is not None and b is not None and math.isclose(a, b, rel_tol=REL_TOL, abs_tol=1e-12)


def _clean(quote: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in quote.items() if v not in (None, [], "")}


@dataclass
class Resolution:
    """What the sources say about one model."""

    key: str
    model: dict[str, Any] | None = None
    price: dict[str, Any] | None = None  # basis, provider, optional note
    quote: dict[str, Any] | None = None
    review: list[str] = field(default_factory=list)


# --- proprietary models ------------------------------------------------------


def models_dev_match(sources: Sources, model: str) -> tuple[str, str, dict[str, Any]] | None:
    """(provider, model ID, entry) for a vendor's own listing of ``model``."""
    slug = model_slug(model)
    data = sources.models_dev()
    for provider in PROVIDERS:
        for mid, entry in ((data.get(provider) or {}).get("models") or {}).items():
            if model_slug(mid) == slug and not entry.get("open_weights"):
                return provider, mid, entry
    return None


def models_dev_quote(provider: str, mid: str, entry: dict[str, Any], today: str) -> dict[str, Any] | None:
    cost = entry.get("cost") or {}
    if not (cost.get("input") and cost.get("output")):
        return None
    tiers = [
        _clean(
            {
                "min_prompt_tokens": int(t["tier"]["size"]),
                "input": t.get("input"),
                "output": t.get("output"),
                "cache_read": t.get("cache_read"),
            }
        )
        for t in cost.get("tiers") or []
        if (t.get("tier") or {}).get("type") == "context" and t.get("input") and t.get("output")
    ]
    return _clean(
        {
            "input": float(cost["input"]),
            "output": float(cost["output"]),
            "cache_read": cost.get("cache_read"),
            "tiers": tiers,
            "source": PROVIDERS[provider]["pricing"].format(id=mid),
            "retrieved": today,
            "retrieved_via": "models.dev",
        }
    )


def cross_check(sources: Sources, provider: str, mid: str, quote: dict[str, Any]) -> list[str]:
    """Disagreements between models.dev and OpenRouter / LiteLLM list prices."""
    found = []
    slug = model_slug(mid)
    for item in sources.openrouter():
        vendor, _, name = item.get("id", "").partition("/")
        if vendor == provider and model_slug(name) == slug:
            pricing = item.get("pricing") or {}
            found.append(("OpenRouter", per_million(pricing.get("prompt")), per_million(pricing.get("completion"))))
            break
    litellm = sources.litellm().get(mid)
    if litellm:
        found.append(
            (
                "LiteLLM",
                per_million(litellm.get("input_cost_per_token")),
                per_million(litellm.get("output_cost_per_token")),
            )
        )
    notes = []
    for name, rate_in, rate_out in found:
        if not (close(rate_in, quote["input"]) and close(rate_out, quote["output"])):
            notes.append(
                f"{name} lists ${rate_in} / ${rate_out}; kept models.dev "
                f"${quote['input']} / ${quote['output']}"
            )
    if not found:
        notes.append("no OpenRouter or LiteLLM listing to cross-check against")
    return notes


def resolve_proprietary(sources: Sources, model: str, today: str) -> Resolution | None:
    match = models_dev_match(sources, model)
    if not match:
        return None
    provider, mid, entry = match
    pages = PROVIDERS[provider]
    res = Resolution(key=mid.lower())
    if entry.get("release_date"):
        res.model = {
            "name": entry.get("name") or mid,
            "released": entry["release_date"],
            "release_source": pages["announcement"].format(id=mid),
            "model_page": pages["model_page"].format(id=mid),
            "retrieved_via": "models.dev",
        }
    else:
        res.review.append("models.dev has no release date")
    res.quote = models_dev_quote(provider, mid, entry, today)
    if res.quote:
        res.price = {"basis": "api", "provider": pages["name"]}
        res.review += cross_check(sources, provider, mid, res.quote)
    else:
        res.review.append("models.dev lists no input/output price")
    return res


# --- open weights ----------------------------------------------------------------


def strip_quant(name: str) -> str:
    while QUANT_SUFFIX.search(name):
        name = QUANT_SUFFIX.sub("", name)
    return name


def find_hf_repo(sources: Sources, model: str) -> str | None:
    """Hugging Face repo for ``model`` via OpenRouter's ``hugging_face_id``."""
    slug, base = model_slug(model), model_slug(strip_quant(model))
    repos = [item.get("hugging_face_id") for item in sources.openrouter() if item.get("hugging_face_id")]
    for repo in repos:
        if model_slug(repo.split("/")[-1]) == slug:
            return repo
    for repo in repos:
        if model_slug(repo.split("/")[-1]) == base:
            # The run used a quantized sibling; the vendor usually publishes
            # it under the same owner.
            info = sources.get(HF_MODEL.format(repo=f"{repo.split('/')[0]}/{model}"))
            return (info or {}).get("id") or repo
    return None


def openrouter_for_repo(sources: Sources, repo: str) -> dict[str, Any] | None:
    for item in sources.openrouter():
        if (item.get("hugging_face_id") or "").lower() == repo.lower():
            return item
    return None


def openrouter_quote(sources: Sources, item: dict[str, Any], today: str) -> dict[str, Any] | None:
    pricing = item.get("pricing") or {}
    rate_in, rate_out = per_million(pricing.get("prompt")), per_million(pricing.get("completion"))
    if not (rate_in and rate_out and rate_in > 0 and rate_out > 0):
        return None
    tiers: list[dict[str, Any]] = []
    endpoints = ((sources.get(OPENROUTER_ENDPOINTS.format(id=item["id"])) or {}).get("data") or {}).get(
        "endpoints"
    ) or []
    for endpoint in endpoints:
        ep = endpoint.get("pricing") or {}
        if close(per_million(ep.get("prompt")), rate_in) and close(per_million(ep.get("completion")), rate_out):
            tiers = [
                _clean(
                    {
                        "min_prompt_tokens": int(o["min_prompt_tokens"]),
                        "input": per_million(o.get("prompt")),
                        "output": per_million(o.get("completion")),
                        "cache_read": per_million(o.get("input_cache_read")),
                    }
                )
                for o in ep.get("overrides") or []
                if o.get("min_prompt_tokens") and o.get("prompt") and o.get("completion")
            ]
            if tiers:
                break
    return _clean(
        {
            "input": rate_in,
            "output": rate_out,
            "cache_read": per_million(pricing.get("input_cache_read")),
            "tiers": tiers,
            "source": f"https://openrouter.ai/{item['id']}",
            "retrieved": today,
            "retrieved_via": "openrouter-api",
        }
    )


def first_weight_commit(sources: Sources, repo: str) -> dict[str, Any] | None:
    """Oldest commit on ``main`` whose tree holds model weights."""
    commits: list[dict[str, Any]] = []
    for page in range(40):
        batch = sources.get(HF_COMMITS.format(repo=repo, page=page))
        if not batch:
            break
        commits += batch
    for commit in reversed(commits):
        tree = sources.get(HF_TREE.format(repo=repo, rev=commit["id"])) or []
        if any(WEIGHT_FILE.search(f.get("path", "")) for f in tree):
            return commit
    return None


def models_dev_name(sources: Sources, repo: str) -> str | None:
    """Display name models.dev gives these weights.

    The weights' own vendor listing wins; otherwise the name most hosting
    providers on models.dev use for the same model ID.
    """
    owner, slug = repo.split("/")[0].lower(), model_slug(repo.split("/")[-1])
    names: Counter[str] = Counter()
    for provider, data in sources.models_dev().items():
        for mid, item in (data.get("models") or {}).items():
            if model_slug(mid.split("/")[-1]) == slug and item.get("name"):
                if provider == owner:
                    return item["name"]
                names[item["name"]] += 1
    return names.most_common(1)[0][0] if names else None


def resolve_open_weight(
    sources: Sources, model: str, today: str, repo: str | None = None
) -> Resolution:
    key = re.sub(r"[^a-z0-9._-]+", "-", model.strip().lower()).strip("-")
    res = Resolution(key=key)
    repo = repo or find_hf_repo(sources, model)
    if not repo:
        res.review.append(
            "no Hugging Face repo found; add `hf_repo` to its models.json entry "
            "or price it by hand"
        )
        return res

    commit = first_weight_commit(sources, repo)
    if commit:
        res.model = {
            "name": models_dev_name(sources, repo) or repo.split("/")[-1],
            "released": commit["date"][:10],
            "release_source": f"https://huggingface.co/{repo}/commit/{commit['id']}",
            "model_page": f"https://huggingface.co/{repo}",
            "hf_repo": repo,
            "retrieved_via": "huggingface-api",
        }
        res.review.append(
            f"release date is the first weight commit on {repo}; a repo can be "
            "populated before the public announcement, so confirm it"
        )
    else:
        res.review.append(f"no weight commit found on {repo}")

    item = openrouter_for_repo(sources, repo)
    base = strip_quant(repo)
    if not item and base != repo:
        item = openrouter_for_repo(sources, base)
    if not item:
        res.review.append(f"OpenRouter does not list {repo}; price it by hand or mark it unavailable")
        return res
    res.quote = openrouter_quote(sources, item, today)
    if not res.quote:
        res.review.append(f"OpenRouter lists {item['id']} without a positive price")
        return res
    res.price = {"basis": "hosted_open_weight", "provider": "OpenRouter"}
    notes = []
    if (item.get("hugging_face_id") or "").lower() != repo.lower():
        notes.append(
            f"Quote for {item['hugging_face_id']}; the run used the {repo.split('/')[-1]} "
            "checkpoint of the same weights."
        )
    notes.append(
        "Hosted reference estimate, not the self-hosted GPU bill; provider serving "
        "precision is not specified by this quote."
    )
    res.price["note"] = " ".join(notes)
    return res


# --- catalog updates -------------------------------------------------------------


def rates_changed(latest: dict[str, Any], fresh: dict[str, Any]) -> bool:
    """True when any rate the catalog already records has moved."""
    if not (close(latest["input"], fresh["input"]) and close(latest["output"], fresh["output"])):
        return True
    if "cache_read" in latest and not close(latest["cache_read"], fresh.get("cache_read")):
        return True
    if "tiers" in latest:
        old = [(t["min_prompt_tokens"], t["input"], t["output"]) for t in latest["tiers"]]
        new = [(t["min_prompt_tokens"], t["input"], t["output"]) for t in fresh.get("tiers") or []]
        if len(old) != len(new) or any(
            a[0] != b[0] or not close(a[1], b[1]) or not close(a[2], b[2]) for a, b in zip(old, new)
        ):
            return True
    return False


def refresh_quote(sources: Sources, key: str, entry: dict[str, Any], today: str) -> dict[str, Any] | None | str:
    """Fresh quote for an already-priced model, or a reason it is not automated."""
    latest = entry["quotes"][-1]
    if entry["basis"] == "api":
        match = models_dev_match(sources, key)
        if not match:
            return "not listed by a known vendor on models.dev"
        return models_dev_quote(*match, today) or "models.dev lists no price"
    source = latest.get("source", "")
    if entry.get("provider") == "OpenRouter" and source.startswith("https://openrouter.ai/"):
        or_id = source.removeprefix("https://openrouter.ai/")
        item = next((m for m in sources.openrouter() if m.get("id") == or_id), None)
        if not item:
            return f"OpenRouter no longer lists {or_id}"
        return openrouter_quote(sources, item, today) or f"OpenRouter lists {or_id} without a price"
    return f"quotes from {entry.get('provider')} are maintained by hand"


@dataclass
class Report:
    added_models: list[str] = field(default_factory=list)
    added_prices: list[str] = field(default_factory=list)
    changed_prices: list[str] = field(default_factory=list)
    review: list[str] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    added_vendors: list[str] = field(default_factory=list)
    changed_vendors: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(
            self.added_models
            or self.added_prices
            or self.changed_prices
            or self.added_vendors
            or self.changed_vendors
        )

    def markdown(self, failures: list[str]) -> str:
        sections = [
            ("New release dates", self.added_models),
            ("New reference prices", self.added_prices),
            ("Price changes (new quote appended)", self.changed_prices),
            ("New icons", self.added_vendors),
            ("Icon or name changes", self.changed_vendors),
            ("Check before merging", self.review),
            ("Still pending (needs a curator)", self.unresolved),
            ("Not refreshed automatically", self.skipped),
            ("Sources that could not be read", failures),
        ]
        lines = [
            "Automated proposal from `scripts/resolve_model_metadata.py`. "
            "Rates and dates come from public catalogs; citations point at vendor "
            "or provider pages. Review each line before merging.",
        ]
        for title, items in sections:
            if items:
                lines += ["", f"### {title}", "", *[f"- {item}" for item in items]]
        return "\n".join(lines) + "\n"


def _rate_text(quote: dict[str, Any]) -> str:
    text = f"${quote['input']} in / ${quote['output']} out"
    for tier in quote.get("tiers") or []:
        text += f"; ${tier['input']} / ${tier['output']} above {tier['min_prompt_tokens']:,} prompt tokens"
    return text


def resolve(
    models: dict[str, Any],
    pricing: dict[str, Any],
    submitted: list[str],
    sources: Sources,
    today: str,
    refresh: bool = True,
) -> Report:
    """Update ``models`` and ``pricing`` in place; describe the changes."""
    report = Report()
    prices = pricing["models"]

    for model in sorted(set(submitted)):
        model_key, price_key = find_key(models, model), find_key(prices, model)
        if model_key and price_key:
            continue
        repo = (models.get(model_key) or {}).get("hf_repo") if model_key else None
        res = None if repo else resolve_proprietary(sources, model, today)
        if res is None:
            res = resolve_open_weight(sources, model, today, repo)
        key = model_key or price_key or res.key
        if not model_key and res.model:
            models[key] = res.model
            report.added_models.append(
                f"`{key}` ({res.model['name']}): released {res.model['released']} "
                f"([source]({res.model['release_source']}), via {res.model['retrieved_via']})"
            )
        if not price_key and res.quote and res.price:
            prices[key] = {**res.price, "quotes": [res.quote]}
            report.added_prices.append(
                f"`{key}`: {_rate_text(res.quote)} per 1M tokens, {res.price['provider']} "
                f"([source]({res.quote['source']}), via {res.quote['retrieved_via']})"
            )
        report.review += [f"`{key}`: {note}" for note in res.review]
        missing = [
            label
            for label, done in (("release date", model_key or res.model), ("price", price_key or res.quote))
            if not done
        ]
        if missing:
            report.unresolved.append(f"`{model}`: no {' or '.join(missing)}")

    if refresh:
        for key, entry in prices.items():
            if entry.get("status") == UNAVAILABLE or not entry.get("quotes"):
                continue
            latest = entry["quotes"][-1]
            if latest["retrieved"] >= today:
                continue
            fresh = refresh_quote(sources, key, entry, today)
            if isinstance(fresh, str):
                report.skipped.append(f"`{key}`: {fresh}")
            elif fresh and rates_changed(latest, fresh):
                entry["quotes"].append(fresh)
                report.changed_prices.append(
                    f"`{key}`: {_rate_text(latest)} (retrieved {latest['retrieved']}) → "
                    f"{_rate_text(fresh)} ([source]({fresh['source']}), via {fresh['retrieved_via']})"
                )

    if report.changed:
        pricing["as_of"] = today
    return report


def image_ext(data: bytes) -> str | None:
    """File extension for a raster avatar. SVG is refused: it can carry scripts."""
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    for magic, ext in ((b"\x89PNG\r\n\x1a\n", "png"), (b"\xff\xd8\xff", "jpg"), (b"GIF8", "gif")):
        if data.startswith(magic):
            return ext
    return None


def lobehub_svg(data: bytes, variant: str) -> bytes | None:
    """A LobeHub SVG ready for the dark page; ``None`` if it is not a plain SVG."""
    if not data.lstrip().startswith(b"<svg") or b"<script" in data.lower():
        return None
    return data.replace(b"currentColor", LIGHT_INK) if variant == "mono" else data


def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    h = "".join(c * 2 for c in h) if len(h) in (3, 4) else h
    channels = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    r, g, b = (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def best_contrast(svg: bytes, background: str = BADGE_BG) -> float | None:
    """Highest WCAG contrast of the SVG's colours against ``background``."""
    colors = re.findall(rb'(?:fill|stop-color)="(#[0-9a-fA-F]{3,8})"', svg)
    if not colors:
        return None
    bg = _luminance(background)
    ratios = []
    for color in colors:
        lum = _luminance(color.decode())
        ratios.append((max(lum, bg) + 0.05) / (min(lum, bg) + 0.05))
    return max(ratios)


def _remap(table: dict[str, str], key: str, entry: dict[str, Any] | None, what: str, report: Report) -> None:
    new, old = (entry["id"].lower() if entry else None), table.get(key)
    if new == old:
        return
    if new:
        table[key] = new
        line = f"{what}: LobeHub `{entry['title']}`" + (f" (was `{old}`)" if old else "")
        (report.changed_vendors if old else report.added_vendors).append(line)
    else:
        del table[key]
        report.changed_vendors.append(f"{what}: no longer matches LobeHub `{old}`")


def resolve_lobehub(
    lobehub: dict[str, Any],
    vendors: dict[str, Any],
    hf_orgs: dict[str, Any],
    in_use: set[tuple[str | None, str | None]],
    sources: Sources,
    report: Report,
    icon_root: Path,
    refresh: bool = True,
) -> dict[str, bytes | None]:
    """Map submitted models and their vendors to LobeHub icons, and fetch those.

    ``in_use`` holds (vendor, submitted model) pairs. Updates ``lobehub`` in
    place and returns the icon files to write, relative to ``icon_root``;
    ``None`` deletes an icon nothing uses any more. Without ``refresh`` only
    unmapped models and vendors are matched, and saved icons are kept.
    """
    toc = sources.get(LOBEHUB_TOC)
    latest = (sources.get(LOBEHUB_NPM) or {}).get("version")
    if not isinstance(toc, list) or not latest:
        return {}
    by_id = {entry["id"].lower(): entry for entry in toc}
    models_map = lobehub.setdefault("models", {})
    vendors_map = lobehub.setdefault("vendors", {})
    icons = lobehub.setdefault("icons", {})

    for vendor, model in sorted(in_use, key=str):
        key = model_key(model)
        manual = vendors.get(vendor) or {}
        # Anything set by hand outranks LobeHub, so it is not matched at all.
        hand_made = manual_model_icon(vendors, model)[0] or manual.get("icon")
        if key and not hand_made and (refresh or key not in models_map):
            _remap(models_map, key, lobehub_model_match(toc, key), f"model `{model}`", report)
        if vendor and not manual.get("icon") and (refresh or vendor not in vendors_map):
            # The organization's own name often matches where its ID does not
            # (``zai-org`` is "Z.ai"); the Hugging Face step reuses this lookup.
            org = sources.get(HF_ORG.format(name=urlquote(vendor)), missing_ok=True) or {}
            names = [vendor, manual.get("label"), (hf_orgs.get(vendor) or {}).get("label"), org.get("fullname")]
            _remap(vendors_map, vendor, lobehub_vendor_match(toc, names), f"vendor `{vendor}`", report)

    if refresh:
        # Drop mappings for models and vendors no package uses any more.
        for table, keys in (
            (models_map, {model_key(m) for _, m in in_use}),
            (vendors_map, {v for v, _ in in_use}),
        ):
            for key in set(table) - keys:
                del table[key]

    files: dict[str, bytes | None] = {}
    used = set(models_map.values()) | set(vendors_map.values())
    for icon_id in sorted(used):
        known, entry = icons.get(icon_id), by_id.get(icon_id)
        if not entry or (known and not (refresh and known.get("version") != latest)):
            continue
        variant = "color" if (entry.get("param") or {}).get("hasColor") else "mono"
        name = f"{icon_id}-color.svg" if variant == "color" else f"{icon_id}.svg"
        data = sources.get(LOBEHUB_SVG.format(version=latest, file=name), binary=True)
        if variant == "color" and data and (best_contrast(data) or MIN_CONTRAST) < MIN_CONTRAST:
            variant, name = "mono", f"{icon_id}.svg"
            data = sources.get(LOBEHUB_SVG.format(version=latest, file=name), binary=True)
        svg = lobehub_svg(data, variant) if data else None
        if not svg:
            if data:
                report.unresolved.append(f"LobeHub `{name}` is not a plain SVG; not used")
            continue
        rel = f"{LOBEHUB_ICON_DIR}/{icon_id}.svg"
        path = icon_root / rel
        icons[icon_id] = {"title": entry["title"], "icon": rel, "variant": variant, "version": latest}
        if not path.is_file() or path.read_bytes() != svg:
            files[rel] = svg
            if known:
                report.changed_vendors.append(f"LobeHub `{entry['title']}`: icon changed in {latest}")
    for icon_id in sorted(set(icons) - used):
        files[icons.pop(icon_id)["icon"]] = None
    return files


def resolve_hf_orgs(
    hf_orgs: dict[str, Any],
    vendors: dict[str, Any],
    lobehub: dict[str, Any],
    in_use: set[str],
    sources: Sources,
    today: str,
    report: Report,
    refresh: bool = True,
) -> dict[str, bytes | None]:
    """Update ``hf_orgs`` in place from each vendor's Hugging Face organization.

    Records the organization's name for every vendor, and downloads its avatar
    only for a vendor with no hand-made or LobeHub icon. Returns the icon files
    to write, relative to ``ICON_ROOT``; ``None`` deletes one. Only vendors
    not yet recorded are looked up unless ``refresh`` is set.
    """
    files: dict[str, bytes | None] = {}
    for vendor in sorted(in_use):
        manual = vendors.get(vendor) or {}
        has_icon = bool(manual.get("icon") or vendor in (lobehub.get("vendors") or {}))
        if manual.get("label") and has_icon:
            continue
        known = hf_orgs.get(vendor)
        if known and not refresh and (has_icon or known.get("icon")):
            continue
        url = HF_ORG.format(name=urlquote(vendor))
        org = sources.get(url, missing_ok=True)
        if not org:
            if url not in sources.absent or has_icon:
                continue  # an unreadable source is listed with the failures
            if known:
                report.skipped.append(
                    f"`{vendor}`: Hugging Face no longer lists the organization; kept the saved icon"
                )
            elif sources.get(HF_USER.format(name=urlquote(vendor)), missing_ok=True):
                report.unresolved.append(
                    f"`{vendor}`: a personal Hugging Face account, so its avatar is not used; "
                    "credit its repos to the maker with `hf_accounts` in `catalog/vendors.json`"
                )
            else:
                report.unresolved.append(
                    f"`{vendor}`: no Hugging Face organization or LobeHub icon; "
                    "add a label and icon in `catalog/vendors.json`"
                )
            continue
        name = org.get("name") or vendor
        fresh: dict[str, Any] = {"org": name, "label": org.get("fullname") or name}
        avatar = None if has_icon else org.get("avatarUrl")
        if not has_icon and not avatar:
            report.unresolved.append(f"`{vendor}`: the Hugging Face organization has no avatar")
        if avatar and known and known.get("avatar_url") == avatar:
            fresh.update(icon=known["icon"], avatar_url=avatar)
        elif avatar:
            data = sources.get(avatar, binary=True)
            ext = image_ext(data) if data else None
            if ext:
                fresh.update(icon=f"{HF_ICON_DIR}/{vendor}.{ext}", avatar_url=avatar)
                files[fresh["icon"]] = data
            elif data:
                report.unresolved.append(f"`{vendor}`: avatar {avatar} is not a PNG, JPEG, GIF, or WEBP image")
        old = {k: v for k, v in (known or {}).items() if k != "retrieved"}
        if old == fresh:
            continue
        if old.get("icon") and old["icon"] != fresh.get("icon"):
            files[old["icon"]] = None
        hf_orgs[vendor] = {**fresh, "retrieved": today}
        page = f"https://huggingface.co/{name}"
        what = "avatar" if fresh.get("icon") else "name"
        if not known:
            report.added_vendors.append(f"vendor `{vendor}`: {fresh['label']}, Hugging Face {what} ([organization]({page}))")
        elif old.get("avatar_url") != fresh.get("avatar_url"):
            change = "new avatar" if fresh.get("icon") else "avatar no longer used"
            report.changed_vendors.append(f"vendor `{vendor}` ({fresh['label']}): {change} ([organization]({page}))")
        else:
            report.changed_vendors.append(f"vendor `{vendor}`: name was {old.get('label')}, now {fresh['label']}")
    return files


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--report", type=Path, help="write the Markdown summary here")
    parser.add_argument("--no-refresh", action="store_true", help="only add missing models; skip price-change checks")
    parser.add_argument("--dry-run", action="store_true", help="print the report without editing the catalog")
    args = parser.parse_args()

    models_path = args.repo_root / "catalog/models.json"
    pricing_path = args.repo_root / "catalog/pricing.json"
    models = json.loads(models_path.read_text())
    pricing = json.loads(pricing_path.read_text())
    hf_orgs = load_hf_orgs(args.repo_root)
    lobehub = load_lobehub(args.repo_root)
    vendors = load_vendors(args.repo_root)
    sources = Sources()
    today = date.today().isoformat()
    report = resolve(
        models,
        pricing,
        list(submitted_models(args.repo_root)),
        sources,
        today,
        refresh=not args.no_refresh,
    )
    # After the models: a newly catalogued hf_repo names the vendor. LobeHub
    # before Hugging Face, which only supplies avatars LobeHub lacks.
    in_use = set(submitted_vendors(args.repo_root, models).values())
    refresh = not args.no_refresh
    icon_root = args.repo_root / ICON_ROOT
    files = resolve_lobehub(lobehub, vendors, hf_orgs, in_use, sources, report, icon_root, refresh)
    files.update(resolve_hf_orgs(
        hf_orgs, vendors, lobehub, {v for v, _ in in_use if v}, sources, today, report, refresh
    ))
    errors = validate_catalog(models, pricing)
    if errors:
        print("Resolved catalog failed validation; nothing written:", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 1
    text = report.markdown(sources.failures)
    print(text)
    if args.report:
        args.report.write_text(text)
    if report.changed and not args.dry_run:
        write_json(models_path, models)
        write_json(pricing_path, pricing)
        write_json(args.repo_root / HF_ORGS_FILE, dict(sorted(hf_orgs.items())))
        write_json(
            args.repo_root / LOBEHUB_FILE,
            {k: dict(sorted(lobehub.get(k, {}).items())) for k in ("icons", "models", "vendors")},
        )
        for rel, data in files.items():
            path = args.repo_root / ICON_ROOT / rel
            if data is None:
                path.unlink(missing_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
