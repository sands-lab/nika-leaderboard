import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.validate_model_metadata import validate_models


class ModelMetadataTest(unittest.TestCase):
    def test_missing_or_invalid_public_model_information_blocks_submission(self):
        repo = Path(__file__).resolve().parents[1]
        models = json.loads((repo / "catalog/models.json").read_text())
        pricing = json.loads((repo / "catalog/pricing.json").read_text())
        model = "gemma-4-31B-it"
        cases = [
            ("released", None),
            ("released", "2099-01-01"),
            ("release_source", ""),
            ("model_page", ""),
            ("input", None),
            ("input", 0),
            ("output", -1),
            ("source", ""),
            ("retrieved", None),
            ("provider", ""),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "catalog").mkdir()
            submission = root / "submissions/0.2.0/entry"
            submission.mkdir(parents=True)
            (submission / "metadata.yaml").write_text(f"agent:\n  model: {model}\n")
            for field, value in [(None, None), *cases]:
                with self.subTest(field=field, value=value):
                    metadata, quote = copy.deepcopy(models), copy.deepcopy(pricing)
                    if field in {"released", "release_source", "model_page"}:
                        metadata[model][field] = value
                    elif field:
                        quote["models"][model][field] = value
                    (root / "catalog/models.json").write_text(json.dumps(metadata))
                    (root / "catalog/pricing.json").write_text(json.dumps(quote))
                    errors = validate_models(root)
                    if field:
                        self.assertTrue(errors)
                    else:
                        self.assertEqual(errors, [])
            (root / "catalog/models.json").write_text("{}")
            (root / "catalog/pricing.json").write_text(json.dumps(pricing))
            self.assertTrue(validate_models(root))
