import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_leaderboard_data import load_submission

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "submissions/0.2.0/20261016_claude_code_claude_opus_5_5"
ENTRY_ID = "0.2.0/" + PACKAGE.name


class UnverifiedEntryTest(unittest.TestCase):
    def test_official_entry_can_be_unverified_without_changing_scores(self):
        metrics = json.loads((PACKAGE / "results/metrics.json").read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "catalog").mkdir()
            (root / "catalog/unverified.json").write_text(
                json.dumps({ENTRY_ID: {"reason": "Trajectories were not provided."}})
            )
            summary, detail = load_submission(PACKAGE, "0.2.0", {}, repo_root=root)
            self.assertTrue(summary["official"])
            self.assertEqual(summary["verification_status"], "unverified")
            self.assertEqual(
                summary["verification_reason"], "Trajectories were not provided."
            )
            self.assertIsNone(summary["trajectories_url"])
            self.assertEqual(summary["mean_rca_f1"], metrics["mean_rca_f1"])
            self.assertEqual(detail["verification_status"], "unverified")

    def test_unverified_status_requires_an_explanation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "catalog").mkdir()
            for review in (None, {}, {"reason": ""}):
                with self.subTest(review=review):
                    (root / "catalog/unverified.json").write_text(
                        json.dumps({ENTRY_ID: review})
                    )
                    with self.assertRaisesRegex(ValueError, "requires a reason"):
                        load_submission(PACKAGE, "0.2.0", {}, repo_root=root)
