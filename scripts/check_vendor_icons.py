"""Report score packages the site would show without a model or vendor icon.

The ``vendor-icons`` job runs this on pull requests. It is not a required
check: a missing icon is a display gap, not bad data, so a maintainer may merge
anyway. Each package's vendor and icons are resolved as the site build does it
(``vendors.py``). A saved model or vendor icon passes. Otherwise LobeHub and
Hugging Face are asked directly: a LobeHub match or an organization avatar
passes, because the resolver workflow downloads it after merge. A package
without a vendor, a repo owned by a personal account, or a vendor with no icon
anywhere is reported, with the ``catalog/vendors.json`` entry that would fix it.

Exits 1 when anything is reported.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import quote as urlquote

sys.path.insert(0, str(Path(__file__).resolve().parent))

from resolve_model_metadata import HF_ORG, HF_USER, LOBEHUB_TOC, Sources  # noqa: E402
from vendors import (  # noqa: E402
    VENDORS_FILE,
    load_hf_orgs,
    load_lobehub,
    load_vendors,
    lobehub_model_match,
    lobehub_vendor_match,
    model_display,
    model_key,
    submission_vendor,
    vendor_display,
)


def check_package(
    package_dir: Path,
    package: str,
    models: dict,
    vendors: dict,
    hf_orgs: dict,
    lobehub: dict,
    sources: Sources,
) -> tuple[bool, str]:
    """(passes, one Markdown line) for a score package."""
    vendor, repo, model = submission_vendor(package_dir, models, vendors)
    if not vendor:
        return False, (
            f"`{package}`: no vendor. The run records neither a Hugging Face repo "
            "(`agent.extra.hf_repo`, or a self-hosted model ID such as `org/name`) nor a "
            f"hosted `llm_provider`. List the model under `models` in `{VENDORS_FILE}`."
        )
    display = vendor_display(vendor, vendors, hf_orgs, lobehub)
    shown = model_display(model, vendors, lobehub, vendor)
    if (shown or {}).get("icon") or display["icon"]:
        mark = f"{shown['label']} model icon" if shown else "vendor icon"
        return True, f"`{package}`: {display['label']} (`{vendor}`), {mark} saved"

    url = HF_ORG.format(name=urlquote(vendor))
    org = sources.get(url, missing_ok=True)
    toc = sources.get(LOBEHUB_TOC)
    if isinstance(toc, list):
        names = [vendor, (vendors.get(vendor) or {}).get("label"), (org or {}).get("fullname")]
        match = lobehub_model_match(toc, model_key(model)) or lobehub_vendor_match(toc, names)
        if match:
            return True, (
                f"`{package}`: {display['label']} (`{vendor}`). LobeHub icon "
                f"`{match['title']}`; the resolver workflow adds it after merge"
            )
    if org:
        if org.get("avatarUrl"):
            return True, (
                f"`{package}`: {display['label']} (`{vendor}`). Hugging Face organization "
                f"[{org.get('fullname') or vendor}](https://huggingface.co/{org.get('name') or vendor}); "
                "the resolver workflow adds its avatar after merge"
            )
        return False, (
            f"`{package}`: neither LobeHub nor the Hugging Face organization `{vendor}` has an icon. "
            f"Add an `icon` for `{vendor}` in `{VENDORS_FILE}`."
        )
    if url not in sources.absent:
        return False, f"`{package}`: could not reach Hugging Face to look up `{vendor}`"
    owner = repo.split("/", 1)[0] if repo else None
    if owner and sources.get(HF_USER.format(name=urlquote(owner)), missing_ok=True):
        return False, (
            f"`{package}`: the model repo `{repo}` belongs to the personal account `{owner}`, "
            "so the site would show no vendor icon. Credit it to the maker with "
            f'`"hf_accounts": ["{owner}"]` under their entry in `{VENDORS_FILE}`.'
        )
    return False, (
        f"`{package}`: `{vendor}` has no LobeHub icon and is not a Hugging Face organization. "
        f"Add a `label` and `icon` for it in `{VENDORS_FILE}`."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packages", nargs="*", type=Path, help="submissions/<release>/<package> directories")
    parser.add_argument("--all", action="store_true", help="check every package under submissions/")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--summary", type=Path, help="append the Markdown report here")
    args = parser.parse_args(argv)

    root = args.repo_root
    dirs = (
        sorted(p.parent for p in (root / "submissions").glob("*/*/metadata.yaml"))
        if args.all
        else [p if p.is_absolute() else root / p for p in args.packages]
    )
    dirs = [d for d in dirs if (d / "metadata.yaml").is_file() and (d / "results/identity.yaml").is_file()]
    if not dirs:
        print("No submission packages to check.")
        return 0

    models = json.loads((root / "catalog/models.json").read_text())
    vendors, hf_orgs, lobehub = load_vendors(root), load_hf_orgs(root), load_lobehub(root)
    sources = Sources()
    results = [
        check_package(d, f"{d.parent.name}/{d.name}", models, vendors, hf_orgs, lobehub, sources)
        for d in dirs
    ]
    lines = ["## Model and vendor icons", ""]
    for passes, line in results:
        lines.append(f"- {'✅' if passes else '⚠️'} {line}")
        if not passes:
            # Shown as an annotation on the PR's checks page.
            print(f"::warning title=Vendor icon::{line}")
    if any(not passes for passes, _ in results):
        lines += [
            "",
            "Not a required check: merging anyway leaves these entries without a vendor icon.",
        ]
    report = "\n".join(lines) + "\n"
    print(report)
    if args.summary:
        with args.summary.open("a") as f:
            f.write(report)
    return 0 if all(passes for passes, _ in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
