import copy
import unittest
import urllib.error
from datetime import date

from scripts.model_catalog import validate_catalog
from scripts.resolve_model_metadata import (
    HF_COMMITS,
    HF_MODEL,
    HF_TREE,
    LITELLM,
    MODELS_DEV,
    OPENROUTER,
    Sources,
    resolve,
)

# Catalog dates may not lie in the future, so the run happens "today".
TODAY = date.today().isoformat()

SOURCES = {
    MODELS_DEV: {
        "anthropic": {
            "models": {
                "claude-haiku-5-5": {
                    "name": "Claude Haiku 5.5",
                    "release_date": "2026-10-07",
                    "open_weights": False,
                    "cost": {
                        "input": 0.1,
                        "output": 0.5,
                        "cache_read": 0.01,
                        "tiers": [
                            {"input": 0.5, "output": 2.5, "tier": {"type": "context", "size": 100000}}
                        ],
                    },
                }
            }
        },
        "qwen": {"models": {"qwen3.6-35b-a3b": {"name": "Qwen3.6 35B A3B", "open_weights": True}}},
        # No vendor listing for the FP8 checkpoint: the hosts' majority name wins.
        "host-a": {"models": {"Qwen/Qwen3.6-35B-A3B-FP8": {"name": "Qwen3.6 35B A3B FP8"}}},
        "host-b": {"models": {"qwen3.6-35b-a3b-fp8": {"name": "Qwen3.6 35B A3B FP8"}}},
        "host-c": {"models": {"qwen3.6-35b-a3b-fp8": {"name": "qwen3.6-35b-a3b-fp8"}}},
    },
    OPENROUTER: {
        "data": [
            {
                "id": "anthropic/claude-haiku-5.5",
                "pricing": {"prompt": "0.0000001", "completion": "0.0000005"},
            },
            {
                "id": "qwen/qwen3.6-35b-a3b",
                "hugging_face_id": "Qwen/Qwen3.6-35B-A3B",
                "pricing": {"prompt": "0.00000015", "completion": "0.000001"},
            },
            {
                "id": "google/gemma-4-31b-it",
                "hugging_face_id": "google/gemma-4-31B-it",
                "pricing": {"prompt": "0.0000002", "completion": "0.0000004"},
            },
        ]
    },
    # LiteLLM disagrees on input; models.dev must win.
    LITELLM: {"claude-haiku-5-5": {"input_cost_per_token": 2e-7, "output_cost_per_token": 5e-7}},
    HF_MODEL.format(repo="Qwen/Qwen3.6-35B-A3B-FP8"): {"id": "Qwen/Qwen3.6-35B-A3B-FP8"},
    HF_COMMITS.format(repo="Qwen/Qwen3.6-35B-A3B-FP8", page=0): [
        {"id": "c3", "date": "2026-04-20T10:00:00.000Z"},
        {"id": "c2", "date": "2026-04-15T09:00:00.000Z"},
        {"id": "c1", "date": "2026-04-01T08:00:00.000Z"},
    ],
    HF_TREE.format(repo="Qwen/Qwen3.6-35B-A3B-FP8", rev="c1"): [{"path": "README.md"}],
    HF_TREE.format(repo="Qwen/Qwen3.6-35B-A3B-FP8", rev="c2"): [
        {"path": "README.md"},
        {"path": "model-00001-of-00002.safetensors"},
    ],
}


def fetch(url):
    if url in SOURCES:
        return copy.deepcopy(SOURCES[url])
    if url.startswith("https://huggingface.co/api/models/") and "/commits/" in url:
        return []
    raise urllib.error.URLError("not found")


def empty_catalog():
    return {}, {"as_of": "2026-10-01", "currency": "USD", "unit": "per_million_tokens", "models": {}}


class ResolveNewModelsTest(unittest.TestCase):
    def test_proprietary_model_uses_models_dev_and_flags_disagreement(self):
        models, pricing = empty_catalog()
        report = resolve(models, pricing, ["Claude Haiku 5.5"], Sources(fetch), TODAY)
        self.assertEqual(
            models["claude-haiku-5-5"],
            {
                "name": "Claude Haiku 5.5",
                "released": "2026-10-07",
                "release_source": "https://www.anthropic.com/claude-haiku-5-5",
                "model_page": "https://www.anthropic.com/claude-haiku-5-5",
                "retrieved_via": "models.dev",
            },
        )
        price = pricing["models"]["claude-haiku-5-5"]
        self.assertEqual((price["basis"], price["provider"]), ("api", "Anthropic"))
        self.assertEqual(
            price["quotes"],
            [
                {
                    "input": 0.1,
                    "output": 0.5,
                    "cache_read": 0.01,
                    "tiers": [{"min_prompt_tokens": 100000, "input": 0.5, "output": 2.5}],
                    "source": "https://www.anthropic.com/claude-haiku-5-5",
                    "retrieved": TODAY,
                    "retrieved_via": "models.dev",
                }
            ],
        )
        self.assertTrue(any("LiteLLM" in line for line in report.review))
        self.assertFalse(any("OpenRouter lists" in line for line in report.review))
        self.assertEqual(pricing["as_of"], TODAY)
        self.assertEqual(validate_catalog(models, pricing), [])

    def test_quantized_open_weights_use_base_quote_and_first_weight_commit(self):
        models, pricing = empty_catalog()
        report = resolve(models, pricing, ["Qwen3.6-35B-A3B-FP8"], Sources(fetch), TODAY)
        entry = models["qwen3.6-35b-a3b-fp8"]
        self.assertEqual(entry["name"], "Qwen3.6 35B A3B FP8")
        self.assertEqual(entry["released"], "2026-04-15")
        self.assertEqual(
            entry["release_source"], "https://huggingface.co/Qwen/Qwen3.6-35B-A3B-FP8/commit/c2"
        )
        self.assertEqual(entry["hf_repo"], "Qwen/Qwen3.6-35B-A3B-FP8")
        price = pricing["models"]["qwen3.6-35b-a3b-fp8"]
        self.assertEqual((price["basis"], price["provider"]), ("hosted_open_weight", "OpenRouter"))
        self.assertIn("Qwen/Qwen3.6-35B-A3B", price["note"])
        quote = price["quotes"][0]
        self.assertEqual((quote["input"], quote["output"]), (0.15, 1.0))
        self.assertEqual(quote["source"], "https://openrouter.ai/qwen/qwen3.6-35b-a3b")
        self.assertTrue(any("first weight commit" in line for line in report.review))
        self.assertEqual(validate_catalog(models, pricing), [])

    def test_unknown_model_stays_pending(self):
        models, pricing = empty_catalog()
        report = resolve(models, pricing, ["Mystery-7B"], Sources(fetch), TODAY)
        self.assertEqual((models, pricing["models"]), ({}, {}))
        self.assertEqual(report.unresolved, ["`Mystery-7B`: no release date or price"])
        self.assertFalse(report.changed)
        self.assertEqual(pricing["as_of"], "2026-10-01")


class RefreshPricesTest(unittest.TestCase):
    def catalog(self, gemma_input):
        _, pricing = empty_catalog()
        pricing["models"] = {
            "gemma-4-31b-it": {
                "basis": "hosted_open_weight",
                "provider": "OpenRouter",
                "quotes": [
                    {
                        "input": gemma_input,
                        "output": 0.4 if gemma_input == 0.2 else 0.34,
                        "source": "https://openrouter.ai/google/gemma-4-31b-it",
                        "retrieved": "2026-10-12",
                    }
                ],
            },
            "telecomgpt-r1": {
                "basis": "hosted_open_weight",
                "provider": "Featherless AI",
                "quotes": [
                    {
                        "input": 1.6,
                        "output": 12.0,
                        "source": "https://featherless.ai/models/KU-DFI/TelecomGPT-R1",
                        "retrieved": "2026-10-13",
                    }
                ],
            },
            "otel-2.0-llm-31b-it": {
                "basis": "hosted_open_weight",
                "provider": "none",
                "status": "unavailable",
                "note": "No public quote.",
            },
        }
        return pricing

    def test_changed_rate_appends_a_quote_and_keeps_history(self):
        pricing = self.catalog(0.09)
        report = resolve({}, pricing, [], Sources(fetch), TODAY)
        quotes = pricing["models"]["gemma-4-31b-it"]["quotes"]
        self.assertEqual([(q["input"], q["output"]) for q in quotes], [(0.09, 0.34), (0.2, 0.4)])
        self.assertEqual(quotes[1]["retrieved"], TODAY)
        self.assertEqual(quotes[1]["retrieved_via"], "openrouter-api")
        self.assertEqual(len(report.changed_prices), 1)
        self.assertEqual(report.skipped, ["`telecomgpt-r1`: quotes from Featherless AI are maintained by hand"])
        self.assertEqual(validate_catalog({}, pricing), [])

    def test_unchanged_rate_appends_nothing(self):
        pricing = self.catalog(0.2)
        before = copy.deepcopy(pricing)
        report = resolve({}, pricing, [], Sources(fetch), TODAY)
        self.assertFalse(report.changed)
        self.assertEqual(pricing, before)


if __name__ == "__main__":
    unittest.main()
