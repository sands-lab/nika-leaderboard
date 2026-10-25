import unittest

from scripts.build_leaderboard_data import disambiguate_names, entry_name, reasoning_effort


def entry(id_, version, name, tags=(), created_at=""):
    return {
        "id": id_,
        "benchmark_version": version,
        "name": name,
        "tags": list(tags),
        "created_at": created_at,
    }


class EntryNameTest(unittest.TestCase):
    def test_same_label_in_different_releases_is_left_alone(self):
        entries = [
            entry("0.1.0/a", "0.1.0", "Qwen3.5-27B · ReAct", ["slides"]),
            entry("0.2.0/b", "0.2.0", "Qwen3.5-27B · ReAct"),
        ]
        disambiguate_names(entries)
        self.assertEqual([e["name"] for e in entries], ["Qwen3.5-27B · ReAct"] * 2)

    def test_repeats_in_one_release_are_qualified_by_their_own_tags(self):
        entries = [
            entry("0.1.0/a", "0.1.0", "GPT-OSS-20B · ReAct"),
            entry("0.1.0/b", "0.1.0", "GPT-OSS-20B · ReAct", ["replication"]),
        ]
        disambiguate_names(entries)
        self.assertEqual(
            [e["name"] for e in entries],
            ["GPT-OSS-20B · ReAct", "GPT-OSS-20B · ReAct · replication"],
        )

    def test_repeats_on_different_splits_are_qualified_by_split(self):
        entries = [
            {**entry("0.2.0/a", "0.2.0", "M · ReAct"), "split": "dev"},
            {**entry("0.2.0/b", "0.2.0", "M · ReAct"), "split": "test"},
        ]
        disambiguate_names(entries)
        self.assertEqual(
            [e["name"] for e in entries], ["M · ReAct · dev", "M · ReAct · test"]
        )

    def test_a_qualifier_never_recreates_another_entrys_label(self):
        entries = [
            entry("0.2.0/a", "0.2.0", "M · Claude Code · skills"),
            entry("0.2.0/b", "0.2.0", "M · Claude Code", created_at="2026-10-01"),
            entry("0.2.0/c", "0.2.0", "M · Claude Code", ["skills"], created_at="2026-10-02"),
        ]
        disambiguate_names(entries)
        names = [e["name"] for e in entries]
        self.assertEqual(len(set(names)), 3)
        self.assertEqual(names[2], "M · Claude Code · run 2")

    def test_untagged_repeats_are_numbered_by_submission_date(self):
        entries = [
            entry("0.2.0/late", "0.2.0", "M · ReAct", created_at="2026-10-02"),
            entry("0.2.0/early", "0.2.0", "M · ReAct", created_at="2026-10-01"),
        ]
        disambiguate_names(entries)
        self.assertEqual(
            [e["name"] for e in entries], ["M · ReAct · run 2", "M · ReAct · run 1"]
        )


    def test_reasoning_effort_follows_the_model_in_parentheses(self):
        summary = {
            "model": "GPT-6.1 Sol",
            "framework": "Codex",
            "reasoning_effort": reasoning_effort({"reasoning_effort": "medium"}, {}),
        }
        self.assertEqual(entry_name(summary), "GPT-6.1 Sol (medium) · Codex")

    def test_identity_reasoning_effort_wins_over_agent_extra(self):
        self.assertEqual(
            reasoning_effort({"reasoning_effort": "medium"}, {"reasoning_effort": "high"}),
            "medium",
        )
        self.assertEqual(
            reasoning_effort({"reasoning_effort": None}, {"reasoning_effort": "high"}),
            "high",
        )

    def test_missing_or_blank_reasoning_effort_is_omitted(self):
        self.assertIsNone(reasoning_effort({}, {}))
        self.assertIsNone(reasoning_effort({"reasoning_effort": None}, {"reasoning_effort": "  "}))
        self.assertEqual(
            entry_name({"model": "M", "framework": "ReAct", "reasoning_effort": None}),
            "M · ReAct",
        )

if __name__ == "__main__":
    unittest.main()
