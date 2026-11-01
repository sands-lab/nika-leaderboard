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

    def test_tied_ranks_stay_consecutive(self):
        entries = [
            {
                "id": name,
                "benchmark_version": "0.2.0",
                "split": "test",
                "mean_rca_f1": score,
            }
            for name, score in (("a", 0.9), ("b", 0.9), ("c", 0.5), ("d", 0.1))
        ]
        rank_statistics(entries, {})
        by_id = {e["id"]: e for e in entries}
        self.assertEqual(by_id["a"]["rank"], 1)
        self.assertEqual(by_id["b"]["rank"], 1)
        self.assertEqual(by_id["c"]["rank"], 2)
        self.assertEqual(by_id["d"]["rank"], 3)
        self.assertEqual(by_id["a"]["beaten_by"], [])
        self.assertEqual(by_id["b"]["beaten_by"], [])
        self.assertEqual(by_id["c"]["beaten_by"], ["a", "b"])
        self.assertEqual(by_id["d"]["beaten_by"], ["a", "b", "c"])


if __name__ == "__main__":
    unittest.main()
