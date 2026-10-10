#!/usr/bin/env python3
"""Build catalog + leaderboard JSON from submissions and NIKA release data."""

from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timezone
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NIKA_ROOT = REPO_ROOT.parent / "nika"
NAME_RE = re.compile(r'root_cause_name(?::\s*\w+)?\s*=\s*"(?P<name>[^"]+)"')
# NIKA's failure taxonomy: each registered failure class declares one
# ``failure_domain = FailureDomain.<NAME>`` (see docs/operations/failures.md).
DOMAIN_RE = re.compile(
    r"failure_domain(?::\s*[\w.]+)?\s*=\s*FailureDomain\.(?P<dom>[A-Z_]+)"
)


KNOWN_VENDORS = {"openai", "anthropic", "google", "deepseek", "qwen", "meta", "mistral"}


def harness_name(value: str | None) -> str | None:
    aliases = {
        "cli.claude": "Claude Code",
        "claudecode": "Claude Code",
        "claude code": "Claude Code",
        "cli.codex": "Codex",
        "byo.langgraph": "LangGraph",
    }
    return aliases.get(value.strip().lower(), value.strip()) if value else None


def entry_name(summary: dict[str, Any]) -> str:
    """Compose chart labels from recorded model, harness and adaptations."""
    parts = [summary.get("model"), summary.get("framework")]
    extra = summary.get("extra") or {}
    for method in summary.get("optimization_methods") or []:
        variant = extra.get(f"{str(method).lower()}_variant")
        parts.append(f"{method} ({variant})" if variant else method)
    parts.extend(summary.get("skills") or [])
    return " · ".join(
        dict.fromkeys(str(p).strip() for p in parts if p and str(p).strip())
    ) or "Unknown model · Unknown harness"


def infer_llm_provider(model: str | None, explicit: str | None) -> str | None:
    """Prefer explicit run.llm_provider; otherwise infer from model id."""
    if explicit and str(explicit).strip():
        return str(explicit).strip().lower().replace(" ", "-").replace("_", "-")
    return vendor_from_model(model)


def model_vendor(model: str | None, llm_provider: str | None) -> str | None:
    """Who made the model, as the UI's Provider column and filter show it.

    ``custom`` (an OpenAI-compatible base_url) names the serving route rather
    than a vendor, so any value outside the known vendors defers to the model id.
    """
    if llm_provider in KNOWN_VENDORS:
        return llm_provider
    return vendor_from_model(model) or llm_provider


def vendor_from_model(model: str | None) -> str | None:
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


def case_key(
    scenario: str,
    problem: str,
    inject: dict[str, Any] | None,
    *,
    topo_size: str | None = None,
) -> str:
    """Match NIKA packing: scenario__problem__[topo]__[inject fields]."""
    parts = [scenario, problem]
    if topo_size:
        parts.append(str(topo_size))
    for key, value in sorted((inject or {}).items()):
        if isinstance(value, dict):
            for nested_key, nested_value in sorted(value.items()):
                parts.append(f"{key}-{nested_key}-{nested_value}")
        else:
            parts.append(f"{key}-{value}")
    return "__".join(parts)


def discover_problem_categories(nika_root: Path) -> dict[str, str]:
    """Map problem name -> NIKA ``failure_domain``.

    Parses class bodies in the NIKA problems package. Class attributes may appear
    in either order and with or without type annotations.
    """
    problems_dir = nika_root / "src" / "nika" / "problems"
    mapping: dict[str, str] = {}
    if not problems_dir.is_dir():
        return mapping

    class_re = re.compile(r"^class\s+\w+.*?:", re.MULTILINE)
    for py in problems_dir.rglob("*.py"):
        text = py.read_text(encoding="utf-8", errors="ignore")
        spans = [m.start() for m in class_re.finditer(text)] + [len(text)]
        for i in range(len(spans) - 1):
            body = text[spans[i] : spans[i + 1]]
            names = NAME_RE.findall(body)
            domains = DOMAIN_RE.findall(body)
            if not names or not domains:
                continue
            for name in names:
                mapping[name] = domains[0].lower()
    # Legacy ids NIKA rewrites at load time take their target's domain.
    registry = problems_dir / "registry.py"
    if registry.is_file():
        block = re.search(
            r"_PROBLEM_ALIASES[^{]*\{(?P<body>.*?)\}", registry.read_text(), re.DOTALL
        )
        for old, new in re.findall(
            r'"(\w+)":\s*"(\w+)"', block["body"] if block else ""
        ):
            if new in mapping:
                mapping.setdefault(old, mapping[new])
    # No-fault control cases carry no failure_domain; label them explicitly.
    mapping["healthy"] = "healthy"
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
                "case_key_guess": case_key(
                    scenario, problem, inject, topo_size=topo_size
                ),
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
        # Every NIKA failure, so predictions outside this release still resolve.
        "problem_domains": dict(sorted(categories.items())),
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
    problem_domains: dict[str, str] | None = None,
) -> dict[str, str]:
    mapping: dict[str, str] = dict(problem_domains or {})
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
    trials: list[dict[str, Any]],
    catalog_lookup: dict[str, dict[str, Any]],
    problem_domains: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    name_to_cat = problem_to_category(catalog_lookup, problem_domains)
    out: list[dict[str, Any]] = []
    for t in trials:
        scenario = t.get("scenario") or ""
        problem = t.get("problem") or ""
        meta = catalog_lookup.get(f"{scenario}__{problem}", {})
        metrics = t.get("metrics") or {}

        if "predicted_fault_types" in t:
            predicted = normalize_name_list(t.get("predicted_fault_types"))
        elif "predicted_root_cause_name" in t:
            predicted = normalize_name_list(t.get("predicted_root_cause_name"))
        elif "predicted_root_cause_names" in t:
            predicted = normalize_name_list(t.get("predicted_root_cause_names"))
        else:
            predicted = None

        gt_names = normalize_name_list(t.get("gt_fault_types"))
        if not gt_names:
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
    problem_domains: dict[str, str] | None = None,
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

    trials = aggregate_trials(trials_raw, catalog_lookup, problem_domains)
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
    raw_n_success = metrics.get("n_success")
    if raw_n_success is None:
        n_success = None
        success_rate = None
    else:
        n_success = int(raw_n_success)
        success_rate = (n_success / n_expected) if n_expected else 0.0
    token_totals = metrics.get("token_totals") or {}
    steps_totals = metrics.get("steps_totals") or {}
    in_tokens = float(token_totals.get("in_tokens") or 0)
    out_tokens = float(token_totals.get("out_tokens") or 0)
    steps = float(steps_totals.get("steps") or 0)
    denom = float(n_expected) if n_expected else 0.0
    mean_tokens = ((in_tokens + out_tokens) / denom) if denom else None
    mean_steps = (steps / denom) if denom else None

    traj_rel = identity.get("trajectories_relpath")
    trajectories_url = None
    if isinstance(traj_rel, str) and traj_rel.strip():
        trajectories_url = (
            "https://huggingface.co/datasets/Zhihao98/nika-trajectories/"
            f"tree/main/{traj_rel.strip().strip('/')}"
        )

    summary = {
        "id": pid,
        "dirname": dirname,
        "submission_name": info.get("name"),
        "authors": info.get("authors"),
        "org": info.get("org"),
        "site": info.get("site"),
        "report": info.get("report"),
        "logo": info.get("logo"),
        "github": info.get("github"),
        "email": info.get("email"),
        "trajectories_url": trajectories_url,
        "trajectories_relpath": traj_rel if isinstance(traj_rel, str) else None,
        "model": agent.get("model") or run.get("model"),
        "framework": harness_name(agent.get("framework") or run.get("agent_type")),
        "agent_type": run.get("agent_type"),
        "llm_provider": infer_llm_provider(
            agent.get("model") or run.get("model"),
            run.get("llm_provider"),
        ),
        "tools": agent.get("tools") or [],
        "skills": agent.get("skills") or [],
        "optimization_methods": agent.get("optimization_methods") or [],
        "tags": agent.get("tags") or [],
        "extra": agent.get("extra") or {},
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
        "success_rate": (
            round(success_rate, 6) if success_rate is not None else None
        ),
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
        "nika_git_commit": run.get("nika_git_commit"),
    }

    summary["name"] = entry_name(summary)
    readme_path = package_dir / "README.md"
    detail = {
        **summary,
        "readme": (
            readme_path.read_text(encoding="utf-8").strip()
            if readme_path.is_file()
            else None
        ),
        "trials": trials,
        "rca_confusion": rca_confusion,
        "name_to_category": problem_to_category(catalog_lookup, problem_domains),
    }
    return summary, detail


# Paired cluster bootstrap over cases (Miller 2024, "Adding Error Bars to
# Evals"): every entry is scored on the same resampled cases, and a case's
# trials move together, so trial-to-trial noise stays inside the case.
BOOTSTRAP_RESAMPLES = 10_000
BOOTSTRAP_SEED = 0
CONFIDENCE = 0.95


def case_scores(detail: dict[str, Any]) -> dict[str, float] | None:
    """Per-case mean RCA F1 (missing trials count 0); None without full trials."""
    n_trials = detail.get("n_trials")
    case_count = detail.get("case_count")
    trials = detail.get("trials") or []
    if not n_trials or not case_count or not trials:
        return None
    totals: dict[str, float] = defaultdict(float)
    for t in trials:
        totals[str(t.get("case_key"))] += float(t.get("rca_f1") or 0.0)
    if len(totals) != int(case_count):
        return None
    return {key: total / int(n_trials) for key, total in totals.items()}


def _percentile(sorted_values: list[float], q: float) -> float:
    idx = q * (len(sorted_values) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (idx - lo)


def rank_statistics(
    summaries: list[dict[str, Any]],
    scores: dict[str, dict[str, float] | None],
) -> None:
    """Annotate summaries with bootstrap CIs, ``beaten_by`` and ex-aequo ranks.

    ``rank = 1 + |beaten_by|``: an entry only drops below those that are
    significantly better on the paired difference, so neighbours that are
    statistically indistinguishable share a rank. Entries without per-trial
    data fall back to point-estimate comparison.
    """
    alpha = (1.0 - CONFIDENCE) / 2.0
    groups: dict[tuple[Any, Any], list[dict[str, Any]]] = defaultdict(list)
    for s in summaries:
        s["rca_f1_ci"] = None
        s["beaten_by"] = []
        groups[(s.get("benchmark_version"), s.get("split"))].append(s)

    for members in groups.values():
        tested = [s for s in members if scores.get(s["id"]) is not None]
        case_keys = sorted(scores[tested[0]["id"]]) if tested else []
        tested = [s for s in tested if sorted(scores[s["id"]]) == case_keys]
        tested_ids = {s["id"] for s in tested}
        diffs: dict[tuple[str, str], list[float]] = {}
        if tested:
            vectors = {s["id"]: [scores[s["id"]][k] for k in case_keys] for s in tested}
            n = len(case_keys)
            rng = random.Random(BOOTSTRAP_SEED)
            means: dict[str, list[float]] = {sid: [] for sid in vectors}
            for _ in range(BOOTSTRAP_RESAMPLES):
                idx = [rng.randrange(n) for _ in range(n)]
                for sid, vec in vectors.items():
                    means[sid].append(sum(vec[i] for i in idx) / n)
            for s in tested:
                dist = sorted(means[s["id"]])
                s["rca_f1_ci"] = [
                    round(_percentile(dist, alpha), 6),
                    round(_percentile(dist, 1.0 - alpha), 6),
                ]
            for a in tested:
                for b in tested:
                    if a is not b:
                        diffs[(a["id"], b["id"])] = sorted(
                            x - y for x, y in zip(means[a["id"]], means[b["id"]])
                        )

        for s in members:
            for other in members:
                if other is s:
                    continue
                if s["id"] in tested_ids and other["id"] in tested_ids:
                    better = _percentile(diffs[(other["id"], s["id"])], alpha) > 0
                else:
                    better = (other.get("mean_rca_f1") or 0.0) > (
                        s.get("mean_rca_f1") or 0.0
                    )
                if better:
                    s["beaten_by"].append(other["id"])
            s["beaten_by"].sort()
            s["rank"] = 1 + len(s["beaten_by"])


def unique_sorted(values: set[Any]) -> list[Any]:
    return sorted(v for v in values if v is not None and v != "")


def _version_sort_key(version: str) -> tuple[int | str, ...]:
    parts: list[int | str] = []
    for part in version.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(part)
    return tuple(parts)


def _read_citation(repo_root: Path) -> str | None:
    """BibTeX for the benchmark, if the archive ships one."""
    path = repo_root / "catalog" / "citation.bib"
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8").strip()
    return text or None


def _reset_dir(path: Path) -> None:
    if path.exists():
        for child in path.iterdir():
            if child.is_file():
                child.unlink()
    else:
        path.mkdir(parents=True, exist_ok=True)


def build_leaderboard(
    repo_root: Path,
    catalogs: dict[str, dict[str, Any]],
    out_dir: Path,
) -> None:
    submissions_root = repo_root / "submissions"
    summaries: list[dict[str, Any]] = []
    scores: dict[str, dict[str, float] | None] = {}
    versions: set[str] = set(catalogs)

    frameworks: set[str] = set()
    providers: set[str] = set()
    models: set[str] = set()
    methods: set[str] = set()
    tags: set[str] = set()
    orgs: set[str] = set()
    splits: set[str] = set()

    submissions_out = out_dir / "submissions"
    catalog_out = out_dir / "catalog"
    _reset_dir(submissions_out)
    _reset_dir(catalog_out)

    details: dict[str, dict[str, Any]] = {}
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
                package_dir,
                version,
                lookup,
                repo_root=repo_root,
                problem_domains=catalog.get("problem_domains"),
            )
            summaries.append(summary)
            scores[summary["id"]] = case_scores(detail)
            details[summary["id"]] = detail

            frameworks.add(summary.get("framework"))
            providers.add(
                model_vendor(summary.get("model"), summary.get("llm_provider"))
            )
            models.add(summary.get("model"))
            methods.update(summary.get("optimization_methods") or [])
            tags.update(summary.get("tags") or [])
            orgs.add(summary.get("org"))
            splits.add(summary.get("split"))

    # Repeated configurations need distinct legend names. Use recorded split
    # and run identity rather than the submitter's free-form title.
    names: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for summary in summaries:
        names[summary["name"]].append(summary)
    for group in names.values():
        if len(group) > 1:
            for summary in group:
                split = summary.get("split") or "unknown split"
                run_id = summary.get("run_id") or summary["id"]
                summary["name"] += f" · {split} · {run_id}"
    for summary in summaries:
        detail = details[summary["id"]]
        detail["name"] = summary["name"]
        safe_id = summary["id"].replace("/", "__")
        write_json(submissions_out / f"{safe_id}.json", detail)

    rank_statistics(summaries, scores)
    summaries.sort(
        key=lambda s: (
            s.get("benchmark_version") or "",
            s["rank"],
            -(s.get("mean_rca_f1") or 0.0),
            s.get("name") or "",
            s.get("id") or "",
        )
    )

    # Copy catalogs into public data
    for version, catalog in catalogs.items():
        write_json(
            catalog_out / f"{version}.json",
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
            "versions": sorted(versions, key=_version_sort_key),
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
            "ranking": {
                "method": "paired cluster bootstrap over cases",
                "resamples": BOOTSTRAP_RESAMPLES,
                "seed": BOOTSTRAP_SEED,
                "confidence": CONFIDENCE,
            },
            # So the page can say how fresh its numbers are.
            "generated_at": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat(),
            **(
                {"citation": citation_text}
                if (citation_text := _read_citation(repo_root))
                else {}
            ),
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
    # Refresh only known versions, plus the newest NIKA release for bootstrap.
    # Do not reintroduce retired release catalogs (e.g. deleted 0.1.0).
    if not args.skip_catalog_refresh and args.nika_root.is_dir():
        releases = args.nika_root.resolve() / "benchmark" / "releases"
        if releases.is_dir():
            nika_versions = [
                p.name
                for p in releases.iterdir()
                if p.is_dir() and (p / "RELEASE.yaml").is_file()
            ]
            if nika_versions:
                versions.add(max(nika_versions, key=_version_sort_key))

    if not versions:
        versions.add("0.2.0")

    for version in sorted(versions, key=_version_sort_key):
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

    pricing_path = catalog_dir / "pricing.json"
    if pricing_path.exists():
        write_json(out_dir / "pricing.json", load_json(pricing_path))
        print("Copied catalog/pricing.json", file=sys.stderr)
    else:
        print("Warning: no catalog/pricing.json; cost axis falls back to tokens",
              file=sys.stderr)

    print(f"Wrote leaderboard data to {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
