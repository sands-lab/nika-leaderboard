import unittest

from scripts.build_leaderboard_data import rank_statistics


class RankingStatisticsTest(unittest.TestCase):
    def test_complete_entries_with_different_case_ids_keep_confidence_intervals(self):
        entries = [
            {
                "id": name,
                "benchmark_version": "0.2.0",
                "split": "test",
                "mean_rca_f1": 0.5,
            }
            for name in ("original", "paired", "revised")
        ]
        scores = {
            "original": {"a": 0.0, "b": 1.0},
            "paired": {"a": 0.0, "b": 1.0},
            "revised": {"a": 0.0, "c": 1.0},
        }
        rank_statistics(entries, scores)
        for entry in entries:
            self.assertEqual(entry["rca_f1_ci"], [0.0, 1.0])
            self.assertEqual(entry["rank"], 1)
            self.assertEqual(entry["beaten_by"], [])
        first = {e["id"]: e["rca_f1_ci"] for e in entries}
        entries.reverse()
        rank_statistics(entries, scores)
        self.assertEqual(first, {e["id"]: e["rca_f1_ci"] for e in entries})


if __name__ == "__main__":
    unittest.main()
