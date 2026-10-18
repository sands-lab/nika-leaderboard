import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.model_catalog import find_key, model_slug, package_date, select_quote, validate_catalog
from scripts.validate_model_metadata import pending_models, validate_models

REPO = Path(__file__).resolve().parents[1]
MODELS = json.loads((REPO / "catalog/models.json").read_text())
PRICING = json.loads((REPO / "catalog/pricing.json").read_text())


class CatalogFormatTest(unittest.TestCase):
    def test_checked_in_catalog_is_valid(self):
        self.assertEqual(validate_models(REPO), [])

    def test_invalid_entries_are_rejected(self):
        model = "gemma-4-31b-it"
        cases = [
            ("model", "name", ""),
            ("model", "released", None),
            ("model", "released", "2099-01-01"),
            ("model", "release_source", "http://example.com"),
            ("model", "model_page", ""),
            ("model", "hf_repo", "not a repo"),
            ("model", "colour", "blue"),
            ("price", "basis", "guess"),
            ("price", "provider", ""),
            ("price", "quotes", []),
            ("price", "status", "gone"),
            ("quote", "input", None),
            ("quote", "input", 0),
            ("quote", "output", -1),
            ("quote", "output", float("inf")),
            ("quote", "source", ""),
            ("quote", "retrieved", "2099-01-01"),
            ("quote", "cache_read", -0.1),
            ("quote", "tiers", [{"min_prompt_tokens": 0, "input": 1, "output": 2}]),
        ]
        for where, field, value in cases:
            with self.subTest(where=where, field=field, value=value):
                models, pricing = copy.deepcopy(MODELS), copy.deepcopy(PRICING)
                target = {
                    "model": models[model],
                    "price": pricing["models"][model],
                    "quote": pricing["models"][model]["quotes"][0],
                }[where]
                target[field] = value
                self.assertTrue(validate_catalog(models, pricing))

    def test_keys_must_be_lowercase_and_unique_by_model(self):
        models = copy.deepcopy(MODELS)
        models["Gemma-4-31B-it"] = models["gemma-4-31b-it"]
        errors = validate_catalog(models, PRICING)
        self.assertTrue(any("lowercase" in e for e in errors))
        self.assertTrue(any("same model" in e for e in errors))

    def test_quotes_must_be_in_date_order(self):
        pricing = copy.deepcopy(PRICING)
        quotes = pricing["models"]["gpt-5"]["quotes"]
        quotes.insert(0, {**quotes[0], "retrieved": "2026-10-09"})
        self.assertTrue(validate_catalog(MODELS, pricing))

    def test_unavailable_price_needs_a_note_and_no_quotes(self):
        pricing = copy.deepcopy(PRICING)
        pricing["models"]["telecomgpt-r1"] = {
            "basis": "hosted_open_weight",
            "provider": "none",
            "status": "unavailable",
            "note": "No public hosted quote for these weights.",
        }
        self.assertEqual(validate_catalog(MODELS, pricing), [])
        del pricing["models"]["telecomgpt-r1"]["note"]
        self.assertTrue(validate_catalog(MODELS, pricing))

    def test_missing_model_is_pending_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "catalog").mkdir()
            (root / "catalog/models.json").write_text(json.dumps(MODELS))
            (root / "catalog/pricing.json").write_text(json.dumps(PRICING))
            for name, model in (("a", "Claude Opus 5.5"), ("b", "Brand New 9B")):
                pkg = root / "submissions/0.2.0" / f"20261020_{name}"
                pkg.mkdir(parents=True)
                (pkg / "metadata.yaml").write_text(f"agent:\n  model: {model}\n")
            self.assertEqual(validate_models(root), [])
            self.assertEqual(pending_models(root), {"Brand New 9B": ["release date", "price"]})


class CatalogLookupTest(unittest.TestCase):
    def test_submitted_names_match_runtime_ids(self):
        self.assertEqual(model_slug("Claude Haiku 5.5"), "claude-haiku-5-5")
        self.assertEqual(find_key(MODELS, "Claude Opus 5.5"), "claude-opus-5-5")
        self.assertEqual(find_key(MODELS, "Qwen3.6-35B-A3B-FP8"), "qwen3.6-35b-a3b-fp8")
        self.assertEqual(find_key(MODELS, "gemma-4-31B-it"), "gemma-4-31b-it")
        self.assertIsNone(find_key(MODELS, "Qwen3.6-35B-A3B"))

    def test_package_date(self):
        self.assertEqual(package_date("20261017_claude_code_claude_haiku_5_5"), "2026-10-17")
        self.assertIsNone(package_date("claude_code"))

    def test_quote_selection_is_frozen_at_the_package_date(self):
        quotes = [
            {"input": 1, "output": 2, "retrieved": "2026-10-12"},
            {"input": 3, "output": 4, "retrieved": "2026-10-19"},
        ]
        self.assertEqual(select_quote(quotes, "2026-10-12")["input"], 1)
        self.assertEqual(select_quote(quotes, "2026-10-18")["input"], 1)
        self.assertEqual(select_quote(quotes, "2026-10-19")["input"], 3)
        # Priced only after merge: the earliest quote applies.
        self.assertEqual(select_quote(quotes, "2026-09-01")["input"], 1)
        self.assertEqual(select_quote(quotes, None)["input"], 3)
        self.assertIsNone(select_quote([], "2026-10-12"))


if __name__ == "__main__":
    unittest.main()
