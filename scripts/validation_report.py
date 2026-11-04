"""Build the submission validation report for a pull request comment.

The ``validate`` job in ``validate-submission.yml`` runs ``nika leaderboard
validate`` once per package and saves each run in its own directory under
``--results``:

``package``
    The package path relative to the repository, such as
    ``submissions/0.2.0/20261027_name``. NIKA is given the absolute path,
    because it resolves relative paths against its own checkout; ``--workspace``
    names the prefix to strip from its report.
``exit_code``
    The validator's exit status.
``format``
    ``markdown`` when NIKA printed its own report, ``text`` for NIKA versions
    without ``--format markdown``.
``stdout``, ``stderr``
    The validator's output streams.

This script joins them into one Markdown report: a heading with the overall
result, one section per package, and a footer naming the NIKA ref and commit
that CI validated against. The report starts with a hidden marker so the
workflow can find and edit its own comment on later pushes. With ``--ci-error``
it writes a short report saying the check itself failed, which is not the
submitter's fault. Uses only the standard library, so it runs before NIKA or
the project environment is installed.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

MARKER = "<!-- nika-validate -->"
PASSED = "[ x ]"
NOT_PASSED = "[ ]"
GUIDE_URL = (
    "https://github.com/sands-lab/nika/blob/main/docs/benchmarks/"
    "leaderboard-submission.md"
)
# GitHub rejects comments longer than 65,536 characters.
COMMENT_LIMIT = 65_000
STDERR_TAIL_LINES = 60
# NIKA's package headings mark the result with an emoji; the report uses
# text markers instead.
NIKA_HEADING = re.compile(r"^### (✅|❌) ", re.MULTILINE)


def fenced(text: str, lang: str = "text") -> str:
    """A code block whose fence is longer than any backtick run in ``text``."""
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    fence = "`" * max(3, longest + 1)
    return f"{fence}{lang}\n{text.rstrip()}\n{fence}"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


def load_results(results_dir: Path, workspace: str = "") -> list[dict]:
    """Saved validator runs, in the order the workflow wrote them.

    Absolute paths under ``workspace`` are shortened to repository paths.
    """
    prefix = workspace.rstrip("/") + "/" if workspace else ""

    def relative(text: str) -> str:
        return text.replace(prefix, "") if prefix else text

    runs = []
    for run_dir in sorted(p for p in results_dir.iterdir() if p.is_dir()):
        exit_text = read(run_dir / "exit_code").strip()
        runs.append(
            {
                "package": read(run_dir / "package").strip(),
                "exit_code": int(exit_text) if exit_text else 1,
                "format": read(run_dir / "format").strip() or "text",
                "stdout": relative(read(run_dir / "stdout")),
                "stderr": relative(read(run_dir / "stderr")),
            }
        )
    return runs


def classify(run: dict) -> str:
    """``passed``, ``failed``, or ``crashed`` (no report from the validator)."""
    if run["format"] == "markdown" and not run["stdout"].lstrip().startswith("### "):
        return "crashed"
    return "passed" if run["exit_code"] == 0 else "failed"


def package_section(run: dict, status: str) -> str:
    package = run["package"]
    if status == "crashed":
        tail = "\n".join(run["stderr"].rstrip().splitlines()[-STDERR_TAIL_LINES:])
        lines = [
            f"### {NOT_PASSED} `{package}`",
            "",
            "**The validator stopped before it could check this package.** "
            "This is most likely a problem in the validation setup, not in your "
            "package. A maintainer will look into it and re-run the check; you "
            "do not need to push again.",
        ]
        if tail:
            lines += [
                "",
                f"<details><summary>Validator output (last {STDERR_TAIL_LINES} lines)</summary>",
                "",
                fenced(tail),
                "",
                "</details>",
            ]
        return "\n".join(lines)
    if run["format"] == "markdown":
        return NIKA_HEADING.sub(
            lambda m: f"### {PASSED if m.group(1) == '✅' else NOT_PASSED} ",
            run["stdout"].strip(),
        )
    # NIKA without --format markdown: show its plain output as it is.
    mark = PASSED if status == "passed" else NOT_PASSED
    lines = [f"### {mark} `{package}`"]
    output = "\n".join(part for part in (run["stderr"].strip(), run["stdout"].strip()) if part)
    if status == "failed":
        lines += [
            "",
            "The NIKA version used by CI does not explain errors in detail yet. "
            f"The validator's output follows; the [submission guide]({GUIDE_URL}) "
            "describes each check.",
        ]
    if output:
        lines += ["", fenced(output)]
    return "\n".join(lines)


def footer(nika_repo: str, nika_ref: str, nika_sha: str, run_url: str) -> str:
    repo_url = f"https://github.com/{nika_repo}"
    parts = [f"Validated with [{nika_repo}]({repo_url}) `{nika_ref or 'unknown ref'}`"]
    if nika_sha:
        parts[0] += f" @ [`{nika_sha[:12]}`]({repo_url}/commit/{nika_sha})"
    if run_url:
        parts.append(f"[run log]({run_url})")
    return "<sub>" + " · ".join(parts) + "</sub>"


def build_report(
    runs: list[dict],
    *,
    nika_repo: str,
    nika_ref: str,
    nika_sha: str,
    run_url: str,
    ci_error: str | None = None,
) -> str:
    """The full Markdown report, starting with the comment marker."""
    tail = ["---", footer(nika_repo, nika_ref, nika_sha, run_url), ""]
    if ci_error:
        body = [
            MARKER,
            f"## {NOT_PASSED} Leaderboard validation could not run",
            "",
            f"{ci_error.rstrip('.')}. This is a problem in the validation setup, "
            "not in your submission. A maintainer will fix it and re-run the "
            "check; you do not need to change your package.",
            "",
        ]
        return "\n".join(body + tail)

    statuses = [classify(run) for run in runs]
    failed = statuses.count("failed")
    crashed = statuses.count("crashed")
    if failed or crashed:
        result = "not accepted" if failed else "could not finish"
        heading = f"## {NOT_PASSED} Leaderboard validation: {result}"
        problems = []
        if failed:
            problems.append(f"{failed} of {len(runs)} packages have errors")
        if crashed:
            problems.append(f"{crashed} of {len(runs)} packages could not be checked")
        intro = "; ".join(problems).capitalize() + "."
        if failed:
            intro += (
                " Fix the errors below and push again. This comment is updated on "
                "every push."
            )
    else:
        heading = f"## {PASSED} Leaderboard validation: all packages valid"
        noun = "package" if len(runs) == 1 else "packages"
        intro = f"{len(runs)} {noun} checked. A maintainer will review the entry."

    body = [MARKER, heading, "", intro, ""]
    for run, status in zip(runs, statuses):
        body += [package_section(run, status), ""]
    return "\n".join(body + tail)


def truncate_for_comment(report: str, run_url: str) -> str:
    """Shorten a report that exceeds GitHub's comment size limit."""
    if len(report) <= COMMENT_LIMIT:
        return report
    where = f"the [run summary]({run_url})" if run_url else "the run summary"
    note = f"\n\n…\n\n**The report is too long for a comment.** Read it in full in {where}.\n"
    return report[: COMMENT_LIMIT - len(note)] + note


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--results", type=Path, help="Directory of saved validator runs")
    parser.add_argument(
        "--workspace",
        default=os.environ.get("GITHUB_WORKSPACE", ""),
        help="Repository root to strip from package paths in the validator output",
    )
    parser.add_argument("--nika-repo", default="sands-lab/nika")
    parser.add_argument("--nika-ref", default="")
    parser.add_argument("--nika-sha", default="")
    parser.add_argument("--run-url", default="")
    parser.add_argument("--ci-error", help="Report that the check itself failed, with this reason")
    parser.add_argument("--summary", type=Path, help="Append the full report to this file")
    parser.add_argument("--comment", type=Path, help="Write the comment body to this file")
    args = parser.parse_args()

    has_results = not args.ci_error and args.results is not None and args.results.is_dir()
    runs = load_results(args.results, args.workspace) if has_results else []
    if not args.ci_error and not runs:
        args.ci_error = "The validator did not record any results"
    report = build_report(
        runs,
        nika_repo=args.nika_repo,
        nika_ref=args.nika_ref,
        nika_sha=args.nika_sha,
        run_url=args.run_url,
        ci_error=args.ci_error,
    )
    if args.summary:
        with args.summary.open("a", encoding="utf-8") as fh:
            fh.write(report.replace(MARKER + "\n", "", 1) + "\n")
    if args.comment:
        args.comment.write_text(truncate_for_comment(report, args.run_url), encoding="utf-8")
    if not args.summary and not args.comment:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
