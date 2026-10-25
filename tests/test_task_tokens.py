import unittest

from scripts.build_leaderboard_data import task_tokens


class TaskTokensTest(unittest.TestCase):
    def test_averages_repeats_within_each_case(self):
        trials = [
            {"case_key": "b", "in_tokens": 100, "out_tokens": 10},
            {"case_key": "a", "in_tokens": 300, "out_tokens": 30},
            {"case_key": "a", "in_tokens": 101, "out_tokens": None},
        ]
        self.assertEqual(task_tokens(trials), [[200, 15], [100, 10]])

    def test_skips_trials_without_token_counts(self):
        trials = [
            {"case_key": "a", "in_tokens": None, "out_tokens": None},
            {"case_key": "b", "in_tokens": 50, "out_tokens": 5},
        ]
        self.assertEqual(task_tokens(trials), [[50, 5]])

    def test_none_without_any_counts(self):
        self.assertIsNone(task_tokens([]))
        self.assertIsNone(task_tokens([{"case_key": "a", "in_tokens": None}]))


if __name__ == "__main__":
    unittest.main()
