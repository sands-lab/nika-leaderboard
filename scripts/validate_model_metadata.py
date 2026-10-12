"""Require sourced release dates and reference prices for submitted models."""

from __future__ import annotations

import argparse
import json
import math
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import yaml


def validate_models(repo_root: Path) -> list[str]:
    models = json.loads((repo_root / "catalog/models.json").read_text())
    pricing = json.loads((repo_root / "catalog/pricing.json").read_text())
    errors = []
    if pricing.get("currency") != "USD" or pricing.get("unit") != "per_million_tokens":
        errors.append("catalog/pricing.json must use USD per_million_tokens")
    submitted = {
        yaml.safe_load(path.read_text())["agent"]["model"]
        for path in (repo_root / "submissions").glob("*/*/metadata.yaml")
    }
    for model in sorted(submitted):
        metadata = models.get(model) or {}
        quote = pricing.get("models", {}).get(model) or {}
        for field, value in (
            ("released", metadata.get("released")),
            ("price.retrieved", quote.get("retrieved")),
        ):
            try:
                parsed = date.fromisoformat(value)
                if parsed.isoformat() != value or parsed > date.today():
                    raise ValueError("invalid or future date")
            except (TypeError, ValueError):
                errors.append(f"{model}: {field} must be a past/present ISO date")
        for field, value in (
            ("release_source", metadata.get("release_source")),
            ("model_page", metadata.get("model_page")),
            ("price.source", quote.get("source")),
        ):
            parsed = urlparse(value if isinstance(value, str) else "")
            if parsed.scheme != "https" or not parsed.netloc:
                errors.append(f"{model}: {field} must be an HTTPS source URL")
        for field in ("input", "output"):
            value = quote.get(field)
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value <= 0
            ):
                errors.append(f"{model}: price.{field} must be a positive finite rate")
        if quote.get("basis") not in {"api", "hosted_open_weight"}:
            errors.append(f"{model}: price.basis must be api or hosted_open_weight")
        if not isinstance(quote.get("provider"), str) or not quote["provider"].strip():
            errors.append(f"{model}: price.provider is required")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    args = parser.parse_args()
    errors = validate_models(args.repo_root)
    for error in errors:
        print(error)
    if not errors:
        print("All submitted models have sourced release dates and reference prices.")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
