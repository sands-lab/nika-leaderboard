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

The script only edits the two catalog files and writes a Markdown report. A
scheduled workflow opens a pull request with both for a curator to review.
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

MODELS_DEV = "https://models.dev/api.json"
OPENROUTER = "https://openrouter.ai/api/v1/models"
OPENROUTER_ENDPOINTS = "https://openrouter.ai/api/v1/models/{id}/endpoints"
LITELLM = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
HF_MODEL = "https://huggingface.co/api/models/{repo}"
HF_COMMITS = "https://huggingface.co/api/models/{repo}/commits/main?p={page}"
HF_TREE = "https://huggingface.co/api/models/{repo}/tree/{rev}"

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


class Sources:
    """Cached access to the public catalogs; a failed fetch reads as missing."""

    def __init__(self, fetch: Fetch = http_json):
        self._fetch = fetch
        self._cache: dict[str, Any] = {}
        self.failures: list[str] = []

    def get(self, url: str) -> Any:
        if url not in self._cache:
            try:
                self._cache[url] = self._fetch(url)
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

    @property
    def changed(self) -> bool:
        return bool(self.added_models or self.added_prices or self.changed_prices)

    def markdown(self, failures: list[str]) -> str:
        sections = [
            ("New release dates", self.added_models),
            ("New reference prices", self.added_prices),
            ("Price changes (new quote appended)", self.changed_prices),
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
    sources = Sources()
    report = resolve(
        models,
        pricing,
        list(submitted_models(args.repo_root)),
        sources,
        date.today().isoformat(),
        refresh=not args.no_refresh,
    )
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
