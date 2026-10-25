"""Check the format of the model and vendor catalogs; list what is still pending.

A submitted model with no release date or price does not fail this check:
those are resolved after merge by ``scripts/resolve_model_metadata.py``.
Missing vendor icons are reported per pull request by ``check_vendor_icons.py``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_catalog import find_key, submitted_models, validate_catalog  # noqa: E402
from vendors import validate_vendors  # noqa: E402


def validate_models(repo_root: Path) -> list[str]:
    models = json.loads((repo_root / "catalog/models.json").read_text())
    pricing = json.loads((repo_root / "catalog/pricing.json").read_text())
    return validate_catalog(models, pricing) + validate_vendors(repo_root)


def pending_models(repo_root: Path) -> dict[str, list[str]]:
    """Submitted model -> what the catalog still lacks for it."""
    models = json.loads((repo_root / "catalog/models.json").read_text())
    pricing = json.loads((repo_root / "catalog/pricing.json").read_text())
    out = {}
    for model in submitted_models(repo_root):
        missing = [
            label
            for label, table in (("release date", models), ("price", pricing["models"]))
            if find_key(table, model) is None
        ]
        if missing:
            out[model] = missing
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    args = parser.parse_args()
    errors = validate_models(args.repo_root)
    for error in errors:
        print(f"error: {error}")
    if errors:
        return 1
    print("catalog/models.json, pricing.json, vendors.json, hf_orgs.json, and lobehub.json are well formed.")
    for model, missing in sorted(pending_models(args.repo_root).items()):
        print(f"pending: {model} has no {' or '.join(missing)} yet (resolved after merge)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
