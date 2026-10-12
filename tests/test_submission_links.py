import unittest
from pathlib import Path

from scripts.build_leaderboard_data import load_submission


class SubmissionLinksTest(unittest.TestCase):
    def test_historical_score_ids_link_to_canonical_trajectory_directories(self):
        root = Path(__file__).resolve().parents[1]
        package = root / "submissions/0.2.0/20261007_qwen3_6_35b_a3b_claudecode"
        summary, _ = load_submission(package, "0.2.0", {}, repo_root=root)
        self.assertEqual(summary["id"], "0.2.0/" + package.name)
        self.assertEqual(
            summary["trajectories_relpath"],
            "trajectories/0.2.0/20261007_claude_code_qwen3_6_35b_a3b_fp8",
        )
        self.assertTrue(
            summary["trajectories_url"].endswith(summary["trajectories_relpath"])
        )

    def test_entry_readme_links_follow_the_canonical_directory(self):
        root = Path(__file__).resolve().parents[1]
        package = root / "submissions/0.2.0/20261008_claude_cli_otel_2_0_llm_31b_it"
        summary, detail = load_submission(package, "0.2.0", {}, repo_root=root)
        self.assertIn(summary["trajectories_url"], detail["readme"])
