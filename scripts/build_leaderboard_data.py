#!/usr/bin/env python3
"""Build catalog + leaderboard JSON from submissions and NIKA release data."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NIKA_ROOT = REPO_ROOT.parent / "nika"
NAME_RE = re.compile(r'root_cause_name(?::\s*\w+)?\s*=\s*"(?P<name>[^"]+)"')
CAT_RE = re.compile(
    r"root_cause_category(?::\s*[\w.]+)?\s*=\s*RootCauseCategory\.(?P<cat>[A-Z_]+)"
)
ENUM_MAP = {
    "LINK_FAILURE": "link_failure",
    "END_HOST_FAILURE": "end_host_failure",
    "NETWORK_NODE_ERROR": "network_node_error",
    "RESOURCE_CONTENTION": "resource_contention",
    "MISCONFIGURATION": "misconfiguration",
    "NETWORK_UNDER_ATTACK": "network_under_attack",
    "MULTIPLE_FAULTS": "multiple_faults",
}
# Fallbacks for problems whose category is hard to scrape from source.
CATEGORY_FALLBACKS: dict[str, str] = {
    "arp_acl_block": "misconfiguration",
    "bgp_acl_block": "misconfiguration",
    "http_acl_block": "misconfiguration",
    "icmp_acl_block": "misconfiguration",
    "ospf_acl_block": "misconfiguration",
    "bmv2_switch_down": "link_failure",
    "mpls_label_limit_exceeded": "network_node_error",
    "p4_compilation_error_parser_state": "network_node_error",
    "p4_header_definition_error": "network_node_error",
    "p4_table_entry_misconfig": "network_node_error",
    "p4_table_entry_missing": "network_node_error",
    "p4_aggressive_detection_thresholds": "misconfiguration",
}


def infer_llm_provider(model: str | None, explicit: str | None) -> str | None:
    """Prefer explicit run.llm_provider; otherwise infer from model id."""
    if explicit and str(explicit).strip():
        return str(explicit).strip().lower().replace(" ", "-").replace("_", "-")
    if not model:
        return None
    key = str(model).strip().lower().replace("_", "-")
    if (
        key.startswith("gpt-")
        or key.startswith("gpt")
        or key.startswith("o1")
        or key.startswith("o3")
        or key.startswith("o4")
        or "gpt-oss" in key
    ):
        return "openai"
    if "claude" in key:
        return "anthropic"
    if "gemini" in key or "gemma" in key:
        return "google"
    if "deepseek" in key:
        return "deepseek"
    if "qwen" in key:
        return "qwen"
    if "llama" in key or key.startswith("meta-"):
        return "meta"
    if "mistral" in key or "mixtral" in key:
        return "mistral"
    return None


def load_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def case_key(scenario: str, problem: str, inject: dict[str, Any] | None) -> str:
    """Match NIKA packing: scenario__problem__<8hex of inject fingerprint>."""
    payload = json.dumps(inject or {}, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(payload.encode()).hexdigest()[:8]
    return f"{scenario}__{problem}__{digest}"


def discover_problem_categories(nika_root: Path) -> dict[str, str]:
    """Map problem name -> root_cause_category.

    Parses class bodies in the NIKA problems package. Class attributes may appear
    in either order and with or without type annotations.
    """
    problems_dir = nika_root / "src" / "nika" / "problems"
    mapping: dict[str, str] = dict(CATEGORY_FALLBACKS)
    if not problems_dir.is_dir():
        return mapping

    class_re = re.compile(r"^class\s+\w+.*?:", re.MULTILINE)
    for py in problems_dir.rglob("*.py"):
        text = py.read_text(encoding="utf-8", errors="ignore")
        spans = [m.start() for m in class_re.finditer(text)] + [len(text)]
        for i in range(len(spans) - 1):
            body = text[spans[i] : spans[i + 1]]
            names = NAME_RE.findall(body)
            cats = CAT_RE.findall(body)
            if not names or not cats:
                continue
            cat = ENUM_MAP.get(cats[0], cats[0].lower())
            for name in names:
                mapping[name] = cat
    return mapping


def build_release_catalog(
    nika_root: Path, version: str, out_dir: Path
) -> dict[str, Any]:
    release_dir = nika_root / "benchmark" / "releases" / version
    if not release_dir.is_dir():
        raise FileNotFoundError(f"Release directory not found: {release_dir}")

    categories = discover_problem_categories(nika_root)
    cases: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}

    for split in ("dev", "test"):
        path = release_dir / f"{split}.yaml"
        if not path.exists():
            continue
        doc = load_yaml(path)
        for case in doc.get("cases") or []:
            scenario = case["scenario"]
            problem = case["problem"]
            topo_size = case.get("topo_size")
            inject = case.get("inject") or {}
            # Prefer matching by scenario+problem; hash may differ if inject
            # serialization differs from packer. Store both lookup keys.
            entry = {
                "scenario": scenario,
                "problem": problem,
                "topo_size": topo_size,
                "root_cause_category": categories.get(problem),
                "split": split,
                "inject": inject,
                "case_key_guess": case_key(scenario, problem, inject),
            }
            cases.append(entry)
            by_key[f"{scenario}__{problem}"] = entry

    catalog = {
        "version": version,
        "cases": cases,
        "by_scenario_problem": {
            k: {
                "topo_size": v["topo_size"],
                "root_cause_category": v["root_cause_category"],
                "split": v["split"],
            }
            for k, v in by_key.items()
        },
        "categories": sorted(set(categories.values())),
        "problems": sorted(categories.keys()),
    }
    write_json(out_dir / version / "cases.json", catalog)
    return catalog


def score_or_zero(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if v < 0:
        return 0.0
    return v


def problem_to_category(
    catalog_lookup: dict[str, dict[str, Any]],
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for key, meta in catalog_lookup.items():
        if "__" not in key:
            continue
        problem = key.split("__", 1)[1]
        cat = meta.get("root_cause_category")
        if problem and cat:
            mapping[str(problem)] = str(cat)
    return mapping


def normalize_name_list(value: Any) -> list[str] | None:
    """Normalize packed root-cause name field. None stays None (missing pred)."""
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if item is None:
                continue
            text = str(item).strip()
            if text:
                out.append(text)
        return out
    return None


def aggregate_trials(
    trials: list[dict[str, Any]], catalog_lookup: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    name_to_cat = problem_to_category(catalog_lookup)
    out: list[dict[str, Any]] = []
    for t in trials:
        scenario = t.get("scenario") or ""
        problem = t.get("problem") or ""
        meta = catalog_lookup.get(f"{scenario}__{problem}", {})
        metrics = t.get("metrics") or {}

        # Packed TrialResult.predicted_root_cause_name (from submission.root_cause_name).
        if "predicted_root_cause_name" in t:
            predicted = normalize_name_list(t.get("predicted_root_cause_name"))
        elif "predicted_root_cause_names" in t:
            predicted = normalize_name_list(t.get("predicted_root_cause_names"))
        else:
            predicted = None

        gt_names = normalize_name_list(t.get("gt_root_cause_name"))
        if not gt_names:
            gt_names = [problem] if problem else []

        pred_cats = (
            sorted({name_to_cat[n] for n in predicted if n in name_to_cat})
            if predicted
            else []
        )

        out.append(
            {
                "trial_id": t.get("trial_id"),
                "case_key": t.get("case_key"),
                "trial_index": t.get("trial_index"),
                "scenario": scenario,
                "problem": problem,
                "outcome": t.get("outcome"),
                "topo_size": meta.get("topo_size"),
                "root_cause_category": meta.get("root_cause_category"),
                "gt_root_cause_name": gt_names,
                "predicted_root_cause_name": predicted,
                "predicted_root_cause_categories": pred_cats,
                "detection_score": score_or_zero(metrics.get("detection_score")),
                "localization_f1": score_or_zero(metrics.get("localization_f1")),
                "rca_f1": score_or_zero(metrics.get("rca_f1")),
                "in_tokens": metrics.get("in_tokens"),
                "out_tokens": metrics.get("out_tokens"),
                "steps": metrics.get("steps"),
                "tool_calls": metrics.get("tool_calls"),
                "tool_errors": metrics.get("tool_errors"),
            }
        )
    return out


def package_id(version: str, dirname: str) -> str:
    return f"{version}/{dirname}"


def load_submission(
    package_dir: Path,
    version: str,
    catalog_lookup: dict[str, dict[str, Any]],
    *,
    repo_root: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    del repo_root  # reserved for future catalog/sidecar hooks
    metadata = load_yaml(package_dir / "metadata.yaml")
    identity = load_yaml(package_dir / "results" / "identity.yaml")
    metrics = load_json(package_dir / "results" / "metrics.json")

    trials_raw: list[dict[str, Any]] = []
    trials_dir = package_dir / "results" / "trials"
    if trials_dir.is_dir():
        for result_path in sorted(trials_dir.glob("*/result.json")):
            trials_raw.append(load_json(result_path))

    trials = aggregate_trials(trials_raw, catalog_lookup)
    dirname = package_dir.name
    pid = package_id(version, dirname)

    rca_confusion = None
    confusion_path = package_dir / "results" / "rca_confusion.json"
    if confusion_path.is_file():
        try:
            rca_confusion = load_json(confusion_path)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Warning: could not load {confusion_path}: {exc}", file=sys.stderr)

    info = metadata.get("info") or {}
    agent = metadata.get("agent") or {}
    bench = identity.get("benchmark") or {}
    run = identity.get("run") or {}

    n_expected = int(metrics.get("n_trials_expected") or 0) or len(trials)
    n_success = int(metrics.get("n_success") or 0)
    success_rate = (n_success / n_expected) if n_expected else 0.0
    token_totals = metrics.get("token_totals") or {}
    steps_totals = metrics.get("steps_totals") or {}
    in_tokens = float(token_totals.get("in_tokens") or 0)
    out_tokens = float(token_totals.get("out_tokens") or 0)
    steps = float(steps_totals.get("steps") or 0)
    denom = float(n_expected) if n_expected else 0.0
    mean_tokens = ((in_tokens + out_tokens) / denom) if denom else None
    mean_steps = (steps / denom) if denom else None

    summary = {
        "id": pid,
        "dirname": dirname,
        "name": info.get("name"),
        "authors": info.get("authors"),
        "org": info.get("org"),
        "site": info.get("site"),
        "report": info.get("report"),
        "logo": info.get("logo"),
        "github": info.get("github"),
        "email": info.get("email"),
        "model": agent.get("model") or run.get("model"),
        "framework": agent.get("framework") or run.get("agent_type"),
        "agent_type": run.get("agent_type"),
        "llm_provider": infer_llm_provider(
            agent.get("model") or run.get("model"),
            run.get("llm_provider"),
        ),
        "tools": agent.get("tools") or [],
        "skills": agent.get("skills") or [],
        "optimization_methods": agent.get("optimization_methods") or [],
        "tags": agent.get("tags") or [],
        "os_model": bool(agent.get("os_model")),
        "os_system": bool(agent.get("os_system")),
        "benchmark_version": bench.get("version") or version,
        "split": bench.get("split"),
        "case_count": bench.get("case_count"),
        "n_trials": bench.get("n_trials"),
        "primary_metric": metrics.get("primary_metric") or "rca_f1",
        "mean_rca_f1": metrics.get("mean_rca_f1"),
        "mean_localization_f1": metrics.get("mean_localization_f1"),
        "mean_detection_score": metrics.get("mean_detection_score"),
        "n_trials_expected": n_expected,
        "n_trials_present": metrics.get("n_trials_present"),
        "n_success": n_success,
        "n_agent_failed": metrics.get("n_agent_failed"),
        "success_rate": round(success_rate, 6),
        "token_totals": token_totals,
        "steps_totals": steps_totals,
        "mean_tokens": round(mean_tokens, 3) if mean_tokens is not None else None,
        "mean_steps": round(mean_steps, 3) if mean_steps is not None else None,
        "total_tokens": int(in_tokens + out_tokens),
        "max_steps": run.get("max_steps"),
        "case_timeout_sec": run.get("case_timeout_sec"),
        "created_at": identity.get("created_at"),
        "run_id": run.get("run_id"),
        "official": run.get("official"),
    }

    detail = {
        **summary,
        "trials": trials,
        "rca_confusion": rca_confusion,
        "name_to_category": problem_to_category(catalog_lookup),
    }
    return summary, detail


def unique_sorted(values: set[Any]) -> list[Any]:
    return sorted(v for v in values if v is not None and v != "")


def build_leaderboard(
    repo_root: Path,
    catalogs: dict[str, dict[str, Any]],
    out_dir: Path,
) -> None:
    submissions_root = repo_root / "submissions"
    summaries: list[dict[str, Any]] = []
    versions: set[str] = set()

    frameworks: set[str] = set()
    providers: set[str] = set()
    models: set[str] = set()
    methods: set[str] = set()
    tags: set[str] = set()
    orgs: set[str] = set()
    splits: set[str] = set()

    for version_dir in sorted(submissions_root.iterdir()):
        if not version_dir.is_dir() or version_dir.name.startswith("."):
            continue
        version = version_dir.name
        versions.add(version)
        catalog = catalogs.get(version) or {}
        lookup = catalog.get("by_scenario_problem") or {}

        for package_dir in sorted(version_dir.iterdir()):
            if not package_dir.is_dir():
                continue
            if not (package_dir / "metadata.yaml").exists():
                continue
            summary, detail = load_submission(
                package_dir, version, lookup, repo_root=repo_root
            )
            summaries.append(summary)
            safe_id = summary["id"].replace("/", "__")
            write_json(out_dir / "submissions" / f"{safe_id}.json", detail)

            frameworks.add(summary.get("framework"))
            providers.add(summary.get("llm_provider"))
            models.add(summary.get("model"))
            methods.update(summary.get("optimization_methods") or [])
            tags.update(summary.get("tags") or [])
            orgs.add(summary.get("org"))
            splits.add(summary.get("split"))

    summaries.sort(
        key=lambda s: (
            -(s.get("mean_rca_f1") or 0.0),
            s.get("name") or "",
            s.get("id") or "",
        )
    )
    for i, s in enumerate(summaries, start=1):
        s["rank"] = i

    # Copy catalogs into public data
    for version, catalog in catalogs.items():
        write_json(
            out_dir / "catalog" / f"{version}.json",
            {
                "version": version,
                "by_scenario_problem": catalog.get("by_scenario_problem") or {},
                "categories": catalog.get("categories") or [],
                "problems": catalog.get("problems") or [],
                "cases": [
                    {
                        "scenario": c["scenario"],
                        "problem": c["problem"],
                        "topo_size": c["topo_size"],
                        "root_cause_category": c["root_cause_category"],
                        "split": c["split"],
                    }
                    for c in catalog.get("cases") or []
                ],
            },
        )

    write_json(out_dir / "index.json", {"submissions": summaries})
    write_json(
        out_dir / "meta.json",
        {
            "versions": sorted(versions),
            "filters": {
                "framework": unique_sorted(frameworks),
                "llm_provider": unique_sorted(providers),
                "model": unique_sorted(models),
                "optimization_methods": unique_sorted(methods),
                "tags": unique_sorted(tags),
                "org": unique_sorted(orgs),
                "split": unique_sorted(splits),
            },
            "primary_metric": "mean_rca_f1",
        },
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=REPO_ROOT,
        help="nika-leaderboard repository root",
    )
    parser.add_argument(
        "--nika-root",
        type=Path,
        default=DEFAULT_NIKA_ROOT,
        help="Local NIKA checkout used to build / refresh catalog",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: web/public/data)",
    )
    parser.add_argument(
        "--skip-catalog-refresh",
        action="store_true",
        help="Use existing catalog/*.json only; do not read NIKA release YAML",
    )
    args = parser.parse_args(argv)

    repo_root: Path = args.repo_root.resolve()
    out_dir = (args.out or (repo_root / "web" / "public" / "data")).resolve()
    catalog_dir = repo_root / "catalog"

    catalogs: dict[str, dict[str, Any]] = {}

    # Discover versions from submissions and existing catalog
    versions: set[str] = set()
    submissions_root = repo_root / "submissions"
    if submissions_root.is_dir():
        for p in submissions_root.iterdir():
            if p.is_dir() and not p.name.startswith("."):
                versions.add(p.name)
    if catalog_dir.is_dir():
        for p in catalog_dir.iterdir():
            if p.is_dir() and (p / "cases.json").exists():
                versions.add(p.name)

    if not versions:
        versions.add("0.1.0")

    for version in sorted(versions):
        catalog_path = catalog_dir / version / "cases.json"
        if not args.skip_catalog_refresh and args.nika_root.is_dir():
            try:
                catalogs[version] = build_release_catalog(
                    args.nika_root.resolve(), version, catalog_dir
                )
                print(f"Refreshed catalog/{version}/cases.json", file=sys.stderr)
                continue
            except FileNotFoundError as exc:
                print(f"Warning: {exc}", file=sys.stderr)
        if catalog_path.exists():
            catalogs[version] = load_json(catalog_path)
            print(f"Loaded existing catalog/{version}/cases.json", file=sys.stderr)
        else:
            print(
                f"Warning: no catalog for {version}; size/category enrich skipped",
                file=sys.stderr,
            )
            catalogs[version] = {"by_scenario_problem": {}, "cases": []}

    build_leaderboard(repo_root, catalogs, out_dir)
    print(f"Wrote leaderboard data to {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
