"""Shared rules for the model catalog: key matching, quote selection, format checks.

Catalog keys are lowercase runtime model IDs (``claude-haiku-5-5``,
``qwen3.6-35b-a3b-fp8``); each ``models.json`` entry carries the plain display
``name``. Submissions record ``agent.model`` however the submitter wrote it
(``Claude Haiku 5.5``, ``Qwen3.6-35B-A3B-FP8``), so both sides are compared by
:func:`model_slug`, which drops case and punctuation.
"""

from __future__ import annotations

import math
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

BASES = {"api", "hosted_open_weight"}
UNAVAILABLE = "unavailable"
MODEL_FIELDS = {"name", "released", "release_source", "model_page", "hf_repo", "retrieved_via"}
PRICE_FIELDS = {"basis", "provider", "note", "status", "quotes"}
QUOTE_FIELDS = {"input", "output", "source", "retrieved", "retrieved_via", "cache_read", "tiers", "note"}
TIER_FIELDS = {"min_prompt_tokens", "input", "output", "cache_read"}
KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
HF_REPO_RE = re.compile(r"^[\w.-]+/[\w.-]+$")
PACKAGE_DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})_")


def model_slug(name: str) -> str:
    """``Claude Haiku 5.5`` and ``claude-haiku-5-5`` both become ``claude-haiku-5-5``."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def find_key(table: dict[str, Any], model: str | None) -> str | None:
    """The catalog key a submitted model name refers to, if any."""
    if not model:
        return None
    slug = model_slug(model)
    return next((key for key in table if model_slug(key) == slug), None)


def package_date(dirname: str) -> str | None:
    """ISO date from a package directory's ``YYYYMMDD_`` prefix."""
    match = PACKAGE_DATE_RE.match(dirname)
    return "-".join(match.groups()) if match else None


def select_quote(quotes: list[dict[str, Any]], on: str | None) -> dict[str, Any] | None:
    """Latest quote retrieved on or before ``on``; the earliest if none is.

    A submission keeps the price it was first shown with: quotes added later
    only apply to packages dated after them.
    """
    if not quotes:
        return None
    ordered = sorted(quotes, key=lambda q: q["retrieved"])
    if on is None:
        return ordered[-1]
    eligible = [q for q in ordered if q["retrieved"] <= on]
    return eligible[-1] if eligible else ordered[0]


def submitted_models(repo_root: Path) -> dict[str, list[str]]:
    """``agent.model`` -> package directories (``<release>/<dirname>``) using it."""
    out: dict[str, list[str]] = {}
    for path in sorted((repo_root / "submissions").glob("*/*/metadata.yaml")):
        model = (yaml.safe_load(path.read_text()) or {}).get("agent", {}).get("model")
        if model:
            out.setdefault(str(model), []).append(
                f"{path.parent.parent.name}/{path.parent.name}"
            )
    return out


def _past_date(value: Any) -> bool:
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        return False
    return parsed.isoformat() == value and parsed <= date.today()


def _https(value: Any) -> bool:
    parsed = urlparse(value if isinstance(value, str) else "")
    return parsed.scheme == "https" and bool(parsed.netloc)


def _rate(value: Any, *, allow_zero: bool = False) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
        and (value >= 0 if allow_zero else value > 0)
    )


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _check_keys(table: dict[str, Any], label: str) -> list[str]:
    errors = []
    seen: dict[str, str] = {}
    for key in table:
        if not KEY_RE.match(key):
            errors.append(f"{label}: key {key!r} must be a lowercase runtime model ID")
        slug = model_slug(key)
        if slug in seen:
            errors.append(f"{label}: keys {seen[slug]!r} and {key!r} name the same model")
        seen[slug] = key
    return errors


def _check_quote(model: str, i: int, quote: Any) -> list[str]:
    where = f"{model}: quotes[{i}]"
    if not isinstance(quote, dict):
        return [f"{where} must be an object"]
    errors = [f"{where}: unknown field {f!r}" for f in sorted(set(quote) - QUOTE_FIELDS)]
    for field in ("input", "output"):
        if not _rate(quote.get(field)):
            errors.append(f"{where}.{field} must be a positive finite rate")
    if not _https(quote.get("source")):
        errors.append(f"{where}.source must be an HTTPS source URL")
    if not _past_date(quote.get("retrieved")):
        errors.append(f"{where}.retrieved must be a past/present ISO date")
    if "retrieved_via" in quote and not _text(quote["retrieved_via"]):
        errors.append(f"{where}.retrieved_via must be a non-empty string")
    if "note" in quote and not _text(quote["note"]):
        errors.append(f"{where}.note must be a non-empty string")
    if "cache_read" in quote and not _rate(quote["cache_read"], allow_zero=True):
        errors.append(f"{where}.cache_read must be a non-negative finite rate")
    tiers = quote.get("tiers")
    if tiers is not None:
        if not isinstance(tiers, list) or not tiers:
            errors.append(f"{where}.tiers must be a non-empty list")
        else:
            for j, tier in enumerate(tiers):
                at = f"{where}.tiers[{j}]"
                if not isinstance(tier, dict):
                    errors.append(f"{at} must be an object")
                    continue
                errors += [f"{at}: unknown field {f!r}" for f in sorted(set(tier) - TIER_FIELDS)]
                bound = tier.get("min_prompt_tokens")
                if isinstance(bound, bool) or not isinstance(bound, int) or bound <= 0:
                    errors.append(f"{at}.min_prompt_tokens must be a positive integer")
                for field in ("input", "output"):
                    if not _rate(tier.get(field)):
                        errors.append(f"{at}.{field} must be a positive finite rate")
                if "cache_read" in tier and not _rate(tier["cache_read"], allow_zero=True):
                    errors.append(f"{at}.cache_read must be a non-negative finite rate")
    return errors


def validate_catalog(models: Any, pricing: Any) -> list[str]:
    """Format errors in ``catalog/models.json`` and ``catalog/pricing.json``.

    Only the files' shape is checked here. A submitted model without an entry
    is *pending*, not invalid: the resolver workflow proposes one after merge.
    """
    if not isinstance(models, dict):
        return ["catalog/models.json must be an object keyed by model ID"]
    if not isinstance(pricing, dict) or not isinstance(pricing.get("models"), dict):
        return ["catalog/pricing.json must have a models object keyed by model ID"]
    errors = []
    if pricing.get("currency") != "USD" or pricing.get("unit") != "per_million_tokens":
        errors.append("catalog/pricing.json must use USD per_million_tokens")
    if not _past_date(pricing.get("as_of")):
        errors.append("catalog/pricing.json: as_of must be a past/present ISO date")
    errors += _check_keys(models, "models.json")
    errors += _check_keys(pricing["models"], "pricing.json")

    for model, entry in models.items():
        if not isinstance(entry, dict):
            errors.append(f"{model}: models.json entry must be an object")
            continue
        errors += [f"{model}: unknown field {f!r}" for f in sorted(set(entry) - MODEL_FIELDS)]
        if not _text(entry.get("name")):
            errors.append(f"{model}: name is required")
        if not _past_date(entry.get("released")):
            errors.append(f"{model}: released must be a past/present ISO date")
        for field in ("release_source", "model_page"):
            if not _https(entry.get(field)):
                errors.append(f"{model}: {field} must be an HTTPS source URL")
        if "hf_repo" in entry and not (
            isinstance(entry["hf_repo"], str) and HF_REPO_RE.match(entry["hf_repo"])
        ):
            errors.append(f"{model}: hf_repo must look like owner/name")
        if "retrieved_via" in entry and not _text(entry["retrieved_via"]):
            errors.append(f"{model}: retrieved_via must be a non-empty string")

    for model, entry in pricing["models"].items():
        if not isinstance(entry, dict):
            errors.append(f"{model}: pricing entry must be an object")
            continue
        errors += [f"{model}: unknown field {f!r}" for f in sorted(set(entry) - PRICE_FIELDS)]
        if entry.get("basis") not in BASES:
            errors.append(f"{model}: basis must be api or hosted_open_weight")
        if not _text(entry.get("provider")):
            errors.append(f"{model}: provider is required")
        if "note" in entry and not _text(entry["note"]):
            errors.append(f"{model}: note must be a non-empty string")
        quotes = entry.get("quotes")
        if "status" in entry:
            if entry["status"] != UNAVAILABLE:
                errors.append(f"{model}: status must be {UNAVAILABLE!r} when present")
            elif not _text(entry.get("note")):
                errors.append(f"{model}: an unavailable price needs a note explaining why")
            elif quotes:
                errors.append(f"{model}: an unavailable price must not carry quotes")
            continue
        if not isinstance(quotes, list) or not quotes:
            errors.append(f"{model}: quotes must be a non-empty list")
            continue
        for i, quote in enumerate(quotes):
            errors += _check_quote(model, i, quote)
        dates = [q.get("retrieved") for q in quotes if isinstance(q, dict)]
        if all(isinstance(d, str) for d in dates) and dates != sorted(set(dates)):
            errors.append(f"{model}: quotes must be in strictly increasing retrieved order")
    return errors
