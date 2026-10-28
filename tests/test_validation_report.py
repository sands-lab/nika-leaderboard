import tempfile
import unittest
from pathlib import Path

from scripts.validation_report import (
    COMMENT_LIMIT,
    MARKER,
    build_report,
    fenced,
    load_results,
    truncate_for_comment,
)

PACKAGE = "submissions/0.2.0/20261027_example"
NIKA_OK = f"### ✅ `{PACKAGE}`\n\nAll checks passed.\n"
NIKA_DRIFT = (
    f"### ❌ `{PACKAGE}`\n\n"
    "**ERROR_RELEASE_DRIFT: task definitions differ from release 0.2.0 (15 trials)**\n"
)
FOOTER = dict(nika_repo="sands-lab/nika", nika_ref="dev", nika_sha="a" * 40, run_url="https://run")


def run(stdout="", stderr="", exit_code=0, fmt="markdown", package=PACKAGE):
    return dict(package=package, exit_code=exit_code, format=fmt, stdout=stdout, stderr=stderr)


class ValidationReportTest(unittest.TestCase):
    def test_passing_package_uses_text_markers_and_footer(self):
        report = build_report([run(NIKA_OK)], **FOOTER)
        self.assertTrue(report.startswith(MARKER + "\n"))
        self.assertIn("## [ x ] Leaderboard validation: all packages valid", report)
        self.assertIn(f"### [ x ] `{PACKAGE}`", report)
        self.assertNotIn("✅", report)
        self.assertIn("`dev` @ [`aaaaaaaaaaaa`](https://github.com/sands-lab/nika/commit/" + "a" * 40, report)
        self.assertIn("[run log](https://run)", report)

    def test_failing_package_forwards_nika_report(self):
        report = build_report([run(NIKA_OK, package="submissions/0.2.0/ok"), run(NIKA_DRIFT, exit_code=1)], **FOOTER)
        self.assertIn("## [ ] Leaderboard validation: not accepted", report)
        self.assertIn("1 of 2 packages have errors.", report)
        self.assertIn(f"### [ ] `{PACKAGE}`", report)
        self.assertIn("ERROR_RELEASE_DRIFT", report)
        self.assertNotIn("❌", report)

    def test_validator_crash_is_not_blamed_on_submitter(self):
        report = build_report([run("", "Traceback\nKeyError: 'x'", exit_code=1)], **FOOTER)
        self.assertIn("## [ ] Leaderboard validation: could not finish", report)
        self.assertIn("1 of 1 packages could not be checked.", report)
        self.assertIn("not in your package", report)
        self.assertIn("KeyError: 'x'", report)
        self.assertNotIn("Fix the errors", report)

    def test_plain_text_fallback_for_older_nika(self):
        report = build_report(
            [run("", "missing trials (15): ['a']", exit_code=1, fmt="text")], **FOOTER
        )
        self.assertIn(f"### [ ] `{PACKAGE}`", report)
        self.assertIn("```text\nmissing trials (15): ['a']\n```", report)

    def test_ci_error_report(self):
        report = build_report([], ci_error="CI could not install the NIKA validator", **FOOTER)
        self.assertIn("## [ ] Leaderboard validation could not run", report)
        self.assertIn("not in your submission", report)

    def test_fence_outlasts_backticks_in_output(self):
        self.assertTrue(fenced("a ```` b").startswith("`````text\n"))

    def test_long_reports_are_truncated_for_comments(self):
        text = truncate_for_comment("x" * (COMMENT_LIMIT + 10), "https://run")
        self.assertLessEqual(len(text), COMMENT_LIMIT)
        self.assertIn("[run summary](https://run)", text)

    def test_load_results_reads_runs_in_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name, code in (("002", "1"), ("001", "0")):
                d = Path(tmp) / name
                d.mkdir()
                (d / "package").write_text(f"submissions/x/{name}\n")
                (d / "exit_code").write_text(code + "\n")
                (d / "format").write_text("markdown\n")
                (d / "stdout").write_text(f"### ✅ `/work/repo/submissions/x/{name}`\n")
            runs = load_results(Path(tmp), workspace="/work/repo/")
        self.assertEqual([r["package"] for r in runs], ["submissions/x/001", "submissions/x/002"])
        self.assertEqual([r["exit_code"] for r in runs], [0, 1])
        self.assertEqual(runs[0]["stdout"], "### ✅ `submissions/x/001`\n")


if __name__ == "__main__":
    unittest.main()
