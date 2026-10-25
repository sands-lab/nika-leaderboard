"""Who made each submitted model, and the names and icons the site shows.

A vendor is identified by its Hugging Face organization, lowercased
(``qwen``, ``ornith-ai``). An entry's vendor is, in order:

1. a ``catalog/vendors.json`` entry that lists the model under ``models``;
2. the owner of the model's Hugging Face repository, or the vendor that lists
   that owner under ``hf_accounts`` (a repo published from a personal account);
3. the run's hosted ``llm_provider`` (``anthropic``), or the vendor that lists
   it under ``llm_providers`` (``deepseek`` -> ``deepseek-ai``).

``custom`` names a self-hosted endpoint, not a maker, so it never names a vendor.

The model column shows the model's own icon when there is one (Claude, Gemma,
Qwen) and the vendor's otherwise. An icon set by hand always wins over a
downloaded one, so the column shows the first of:

1. the model's icon in ``catalog/vendors.json`` (``model_icons``; ``null``
   turns the model icon off);
2. the vendor's ``icon`` in ``catalog/vendors.json``;
3. the model's `LobeHub <https://lobehub.com/icons>`_ icon;
4. the vendor's LobeHub icon, then its Hugging Face avatar.

The resolver workflow records LobeHub matches in ``catalog/lobehub.json`` and
Hugging Face organizations in ``catalog/hf_orgs.json``, with the images under
``web/public/providers/{lobehub,hf}/``. Labels follow the same order, except
that a Hugging Face organization's own name comes before LobeHub's title.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_catalog import find_key, model_slug  # noqa: E402

VENDORS_FILE = "catalog/vendors.json"
HF_ORGS_FILE = "catalog/hf_orgs.json"
LOBEHUB_FILE = "catalog/lobehub.json"
# Icon paths in all three files are relative to this directory, which the site serves.
ICON_ROOT = "web/public/providers"
HF_ICON_DIR = "hf"
LOBEHUB_ICON_DIR = "lobehub"

VENDOR_FIELDS = {"label", "icon", "model_icons", "models", "hf_accounts", "llm_providers", "note"}
HF_ORG_FIELDS = {"org", "label", "icon", "avatar_url", "retrieved"}
HF_ORG_REQUIRED = {"org", "label", "retrieved"}
LOBEHUB_ICON_FIELDS = {"title", "icon", "variant", "version"}
HF_REPO_RE = re.compile(r"^[\w.-]+/[\w.-]+$")
SERVING_ONLY = {"", "custom"}


def _load(repo_root: Path, rel: str) -> dict[str, Any]:
    path = repo_root / rel
    return json.loads(path.read_text()) if path.is_file() else {}


def load_vendors(repo_root: Path) -> dict[str, Any]:
    return _load(repo_root, VENDORS_FILE)


def load_hf_orgs(repo_root: Path) -> dict[str, Any]:
    return _load(repo_root, HF_ORGS_FILE)


def load_lobehub(repo_root: Path) -> dict[str, Any]:
    return _load(repo_root, LOBEHUB_FILE)


def model_key(model: str | None) -> str | None:
    """``ornith-ai/Ornith-1.5-122B`` and ``Ornith 1.5 122B`` -> ``ornith-1-5-122b``."""
    if not model:
        return None
    return model_slug(model.split("/")[-1]) or None


def _claimed(vendors: dict[str, Any], field: str, value: str) -> str | None:
    """The vendor whose ``field`` list contains ``value``, ignoring case."""
    for vendor, entry in vendors.items():
        if value.lower() in (str(v).lower() for v in entry.get(field) or []):
            return vendor
    return None


def model_hf_repo(
    models: dict[str, Any],
    model: str | None,
    extra: dict[str, Any] | None,
    run_model: str | None,
    llm_provider: str | None,
) -> str | None:
    """The Hugging Face repo a submission ran, from the best record available.

    The model catalog's ``hf_repo`` is reviewed, so it comes first. A package
    may also pin it in ``agent.extra.hf_repo``; a self-hosted run often records
    the repo itself as its model ID (``ornith-ai/Ornith-1.5-122B``).
    """
    key = find_key(models, model) or find_key(models, run_model)
    repo = (models.get(key) or {}).get("hf_repo") if key else None
    repo = repo or (extra or {}).get("hf_repo")
    if not repo and (llm_provider or "").strip().lower() == "custom":
        repo = run_model
    return repo if isinstance(repo, str) and HF_REPO_RE.match(repo) else None


def vendor_id(
    vendors: dict[str, Any],
    *,
    model: str | None,
    hf_repo: str | None,
    llm_provider: str | None,
) -> str | None:
    """The vendor that made the model; see the module docstring for the order."""
    if model:
        slug = model_slug(model)
        for vendor, entry in vendors.items():
            if slug in (model_slug(str(m)) for m in entry.get("models") or []):
                return vendor
    if hf_repo:
        owner = hf_repo.split("/", 1)[0]
        return _claimed(vendors, "hf_accounts", owner) or owner.lower()
    provider = (llm_provider or "").strip().lower()
    if provider not in SERVING_ONLY:
        return _claimed(vendors, "llm_providers", provider) or provider
    return None


def manual_model_icon(vendors: dict[str, Any], model: str | None) -> tuple[bool, str | None]:
    """(listed, icon) from any vendor's ``model_icons``; a listed ``None`` means no icon."""
    key = model_key(model)
    for entry in vendors.values():
        for name, icon in (entry.get("model_icons") or {}).items():
            if model_key(name) == key:
                return True, icon
    return False, None


def vendor_display(
    vendor: str,
    vendors: dict[str, Any],
    hf_orgs: dict[str, Any],
    lobehub: dict[str, Any] | None = None,
) -> dict[str, str | None]:
    """Label and icon (relative to ``ICON_ROOT``) for a vendor."""
    lobehub = lobehub or {}
    manual, hf = vendors.get(vendor) or {}, hf_orgs.get(vendor) or {}
    lobe = (lobehub.get("icons") or {}).get((lobehub.get("vendors") or {}).get(vendor)) or {}
    return {
        "id": vendor,
        "label": manual.get("label") or hf.get("label") or lobe.get("title") or vendor,
        "icon": manual.get("icon") or lobe.get("icon") or hf.get("icon"),
    }


def model_display(
    model: str | None,
    vendors: dict[str, Any],
    lobehub: dict[str, Any],
    vendor: str | None = None,
) -> dict[str, str] | None:
    """The model's own icon and its title (``Claude``), when it has one.

    A hand-made vendor icon outranks a downloaded model icon, so a model of
    such a vendor only has its own icon when one is set by hand too.
    """
    listed, icon = manual_model_icon(vendors, model)
    if listed:
        return {"label": model or "", "icon": icon} if icon else None
    if vendor and (vendors.get(vendor) or {}).get("icon"):
        return None
    lobe_id = (lobehub.get("models") or {}).get(model_key(model) or "")
    lobe = (lobehub.get("icons") or {}).get(lobe_id) if lobe_id else None
    return {"label": lobe["title"], "icon": lobe["icon"]} if lobe else None


# ---------------------------------------------------------------------------
# Matching against LobeHub's table of contents (``src/toc.json``). Each entry
# has an ``id`` (file name ``<id lowercased>.svg``), a ``title``, a ``group``
# (``model``, ``provider``, or ``application``), and ``param.hasColor``.


def _alnum(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def lobehub_model_match(toc: list[dict[str, Any]], key: str | None) -> dict[str, Any] | None:
    """The LobeHub model icon whose name begins ``key`` (a :func:`model_key`).

    ``qwen3-6-27b`` and ``claude-opus-5-5`` match Qwen and Claude; the name must
    end at a non-letter, so Yi does not match ``yield-7b``. The longest wins.
    """
    if not key:
        return None
    best: tuple[int, dict[str, Any]] | None = None
    for entry in toc:
        if entry.get("group") != "model":
            continue
        for name in {entry["id"].lower(), model_slug(entry.get("title") or "")}:
            if name and key.startswith(name) and not key[len(name):len(name) + 1].isalpha():
                if best is None or len(name) > best[0]:
                    best = (len(name), entry)
    return best[1] if best else None


def lobehub_vendor_match(toc: list[dict[str, Any]], names: list[str]) -> dict[str, Any] | None:
    """The LobeHub icon whose name equals one of a vendor's names, ignoring punctuation."""
    wanted = {_alnum(n) for n in names if n} - {""}
    for entry in toc:
        full = re.sub(r"\s*\(.*\)$", "", entry.get("fullTitle") or "")
        if wanted & {_alnum(entry["id"]), _alnum(entry.get("title") or ""), _alnum(full)}:
            return entry
    return None


# ---------------------------------------------------------------------------


def submission_vendor(
    package_dir: Path,
    models: dict[str, Any],
    vendors: dict[str, Any],
) -> tuple[str | None, str | None, str | None]:
    """(vendor, Hugging Face repo, submitted model) for a score package."""
    metadata = yaml.safe_load((package_dir / "metadata.yaml").read_text()) or {}
    identity = yaml.safe_load((package_dir / "results" / "identity.yaml").read_text()) or {}
    agent, run = metadata.get("agent") or {}, identity.get("run") or {}
    model = agent.get("model") or run.get("model")
    repo = model_hf_repo(
        models, model, agent.get("extra"), run.get("model"), run.get("llm_provider")
    )
    vendor = vendor_id(
        vendors, model=model, hf_repo=repo, llm_provider=run.get("llm_provider")
    )
    return vendor, repo, model


def submitted_vendors(
    repo_root: Path, models: dict[str, Any] | None = None
) -> dict[str, tuple[str | None, str | None]]:
    """``<release>/<package>`` -> (vendor, submitted model), for every score package."""
    if models is None:
        models = json.loads((repo_root / "catalog/models.json").read_text())
    vendors = load_vendors(repo_root)
    out = {}
    for path in sorted((repo_root / "submissions").glob("*/*/metadata.yaml")):
        vendor, _, model = submission_vendor(path.parent, models, vendors)
        out[f"{path.parent.parent.name}/{path.parent.name}"] = (vendor, model)
    return out


def _icon_error(repo_root: Path, where: str, icon: Any) -> list[str]:
    if not isinstance(icon, str) or not icon.strip():
        return [f"{where}: icon must be a file path under {ICON_ROOT}/"]
    path = (repo_root / ICON_ROOT / icon).resolve()
    if not path.is_relative_to((repo_root / ICON_ROOT).resolve()):
        return [f"{where}: icon must stay under {ICON_ROOT}/"]
    if not path.is_file():
        return [f"{where}: icon {ICON_ROOT}/{icon} does not exist"]
    return []


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_vendors(repo_root: Path) -> list[str]:
    """Format errors in the vendor files: hand-made, Hugging Face, and LobeHub."""
    vendors, hf_orgs = load_vendors(repo_root), load_hf_orgs(repo_root)
    lobehub = load_lobehub(repo_root)
    for rel, data in ((VENDORS_FILE, vendors), (HF_ORGS_FILE, hf_orgs), (LOBEHUB_FILE, lobehub)):
        if not isinstance(data, dict):
            return [f"{rel} must be a JSON object"]
    errors = []
    claims: dict[tuple[str, str], str] = {}
    for vendor, entry in vendors.items():
        where = f"{VENDORS_FILE}: {vendor}"
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", vendor):
            errors.append(f"{where}: key must be a lowercase Hugging Face organization name")
        if not isinstance(entry, dict):
            errors.append(f"{where} must be an object")
            continue
        errors += [f"{where}: unknown field {f!r}" for f in sorted(set(entry) - VENDOR_FIELDS)]
        for field in ("label", "note"):
            if field in entry and not _text(entry[field]):
                errors.append(f"{where}: {field} must be a non-empty string")
        if "icon" in entry:
            errors += _icon_error(repo_root, where, entry["icon"])
        model_icons = entry.get("model_icons", {})
        if not isinstance(model_icons, dict):
            errors.append(f"{where}: model_icons must map model names to icons or null")
        else:
            for name, icon in model_icons.items():
                if icon is not None:
                    errors += _icon_error(repo_root, f"{where}: model_icons[{name!r}]", icon)
                other = claims.setdefault(("model_icons", model_key(name) or ""), vendor)
                if other != vendor:
                    errors.append(f"model_icons {name!r} is set by both {other} and {vendor}")
        for field in ("models", "hf_accounts", "llm_providers"):
            values = entry.get(field, [])
            if not isinstance(values, list) or not all(isinstance(v, str) and v for v in values):
                errors.append(f"{where}: {field} must be a list of names")
                continue
            for value in values:
                slug = model_slug(value) if field == "models" else value.lower()
                other = claims.setdefault((field, slug), vendor)
                if other != vendor:
                    errors.append(f"{field} {value!r} is claimed by both {other} and {vendor}")
    for vendor, entry in hf_orgs.items():
        where = f"{HF_ORGS_FILE}: {vendor}"
        if not isinstance(entry, dict):
            errors.append(f"{where} must be an object")
            continue
        errors += [f"{where}: unknown field {f!r}" for f in sorted(set(entry) - HF_ORG_FIELDS)]
        errors += [f"{where}: {f} is required" for f in sorted(HF_ORG_REQUIRED) if not _text(entry.get(f))]
        if ("icon" in entry) != ("avatar_url" in entry):
            errors.append(f"{where}: icon and avatar_url go together")
        if "icon" in entry:
            errors += _icon_error(repo_root, where, entry["icon"])
    if lobehub:
        icons = lobehub.get("icons") or {}
        for icon_id, entry in icons.items():
            where = f"{LOBEHUB_FILE}: icons.{icon_id}"
            if not isinstance(entry, dict) or set(entry) != LOBEHUB_ICON_FIELDS:
                errors.append(f"{where} must have exactly {sorted(LOBEHUB_ICON_FIELDS)}")
                continue
            errors += _icon_error(repo_root, where, entry["icon"])
        for table in ("models", "vendors"):
            for key, icon_id in (lobehub.get(table) or {}).items():
                if icon_id not in icons:
                    errors.append(f"{LOBEHUB_FILE}: {table}.{key} names unknown icon {icon_id!r}")
    return errors
