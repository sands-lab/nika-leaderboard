import unittest

from scripts.build_leaderboard_data import aggregate_trials, task_tokens


class TaskTokensTest(unittest.TestCase):
    def test_active_trials_with_zero_accounting_are_unknown(self):
        trials = aggregate_trials(
            [
                {"metrics": {"in_tokens": 0, "out_tokens": 0, "steps": 3}},
                {"metrics": {"in_tokens": 0, "out_tokens": 0, "steps": 0}},
            ],
            {},
        )
        self.assertIsNone(trials[0]["in_tokens"])
        self.assertIsNone(trials[0]["out_tokens"])
        self.assertEqual(trials[1]["in_tokens"], 0)
        self.assertEqual(trials[1]["out_tokens"], 0)

    def test_averages_repeats_within_each_case(self):
        trials = [
            {"case_key": "b", "in_tokens": 100, "out_tokens": 10},
            {"case_key": "a", "in_tokens": 300, "out_tokens": 30},
            {"case_key": "a", "in_tokens": 101, "out_tokens": 0},
        ]
        self.assertEqual(task_tokens(trials), [[200, 15], [100, 10]])

    def test_incomplete_accounting_has_no_task_estimate(self):
        trials = [
            {"case_key": "a", "in_tokens": None, "out_tokens": None},
            {"case_key": "b", "in_tokens": 50, "out_tokens": 5},
        ]
        self.assertIsNone(task_tokens(trials))
        self.assertIsNone(
            task_tokens([{"case_key": "a", "in_tokens": 100, "out_tokens": None}])
        )

    def test_none_without_any_counts(self):
        self.assertIsNone(task_tokens([]))
        self.assertIsNone(task_tokens([{"case_key": "a", "in_tokens": None}]))


if __name__ == "__main__":
    unittest.main()
