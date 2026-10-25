import copy
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

import yaml

from scripts.check_vendor_icons import check_package
from scripts.resolve_model_metadata import (
    HF_ORG,
    HF_USER,
    LOBEHUB_NPM,
    LOBEHUB_SVG,
    LOBEHUB_TOC,
    Report,
    Sources,
    best_contrast,
    resolve_hf_orgs,
    resolve_lobehub,
)
from scripts.vendors import (
    lobehub_model_match,
    lobehub_vendor_match,
    model_display,
    model_hf_repo,
    submitted_vendors,
    validate_vendors,
    vendor_display,
    vendor_id,
)

REPO = Path(__file__).resolve().parents[1]
TODAY = "2026-10-25"
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 avatar"
PNG = b"\x89PNG\r\n\x1a\nnew avatar"

VENDORS = {
    "att": {"hf_accounts": ["farbodtavakkoli"]},
    "deepseek-ai": {"llm_providers": ["deepseek"]},
    "openai": {"models": ["gpt-5"]},
    "ku-dfi": {"label": "KU-DFI"},
    "handmade": {"label": "Handmade Lab", "icon": "handmade.png"},
    "google": {"model_icons": {"Gemma-2-9B": "gemma2.png", "Gemma-Mini": None}},
}


def toc_entry(id_, title, group, has_color=True):
    return {"id": id_, "title": title, "fullTitle": title, "group": group, "param": {"hasColor": has_color}}


TOC = [
    toc_entry("Claude", "Claude", "model"),
    toc_entry("Qwen", "Qwen", "model"),
    toc_entry("Yi", "Yi", "model"),
    toc_entry("Anthropic", "Anthropic", "provider", has_color=False),
    toc_entry("ZAI", "Z.ai", "application", has_color=False),
]
CLAUDE_COLOR = b'<svg viewBox="0 0 24 24"><path fill="#D97757" d="M0 0"/></svg>'
QWEN_COLOR = b'<svg viewBox="0 0 24 24"><path fill="#082dff" d="M0 0"/></svg>'
MONO = b'<svg fill="currentColor" viewBox="0 0 24 24"><path d="M0 0"/></svg>'

SOURCES = {
    LOBEHUB_TOC: TOC,
    LOBEHUB_NPM: {"version": "2.0.0"},
    LOBEHUB_SVG.format(version="2.0.0", file="claude-color.svg"): CLAUDE_COLOR,
    LOBEHUB_SVG.format(version="2.0.0", file="qwen-color.svg"): QWEN_COLOR,
    LOBEHUB_SVG.format(version="2.0.0", file="qwen.svg"): MONO,
    LOBEHUB_SVG.format(version="2.0.0", file="anthropic.svg"): MONO,
    LOBEHUB_SVG.format(version="2.0.0", file="zai.svg"): MONO,
    HF_ORG.format(name="ornith-ai"): {
        "name": "ornith-ai",
        "fullname": "Ornith",
        "avatarUrl": "https://cdn.example/ornith.png",
    },
    HF_ORG.format(name="qwen"): {
        "name": "Qwen",
        "fullname": "Qwen",
        "avatarUrl": "https://cdn.example/qwen-2.png",
    },
    HF_ORG.format(name="zai-org"): {"name": "zai-org", "fullname": "Z.ai", "avatarUrl": "https://cdn.example/z.png"},
    HF_ORG.format(name="bare-org"): {"name": "bare-org", "fullname": "Bare"},
    HF_USER.format(name="someone"): {"user": "someone", "type": "user"},
    "https://cdn.example/ornith.png": WEBP,
    "https://cdn.example/qwen-2.png": PNG,
}


def fetch(url):
    if url in SOURCES:
        return copy.deepcopy(SOURCES[url])
    raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)


def sources():
    return Sources(fetch, fetch)


class VendorIdTest(unittest.TestCase):
    def test_order_is_models_then_repo_owner_then_hosted_provider(self):
        cases = [
            # A model listed by hand wins over everything else.
            (dict(model="GPT-5", hf_repo=None, llm_provider=None), "openai"),
            (dict(model="Qwen3.5-27B", hf_repo="Qwen/Qwen3.5-27B", llm_provider="custom"), "qwen"),
            # A personal account is credited to the vendor that claims it.
            (dict(model="OTel", hf_repo="farbodtavakkoli/OTel-2.0-LLM-31B-IT", llm_provider="custom"), "att"),
            (dict(model="claude-opus-5-5", hf_repo=None, llm_provider="anthropic"), "anthropic"),
            (dict(model="deepseek-chat", hf_repo=None, llm_provider="deepseek"), "deepseek-ai"),
            # A self-hosted endpoint says nothing about who made the model.
            (dict(model="Mystery-7B", hf_repo=None, llm_provider="custom"), None),
            (dict(model="Mystery-7B", hf_repo=None, llm_provider=None), None),
        ]
        for kwargs, expected in cases:
            with self.subTest(**kwargs):
                self.assertEqual(vendor_id(VENDORS, **kwargs), expected)

    def test_hf_repo_prefers_the_catalog_then_the_package(self):
        models = {"qwen3.5-27b": {"hf_repo": "Qwen/Qwen3.5-27B"}}
        self.assertEqual(
            model_hf_repo(models, "Qwen3.5-27B", {"hf_repo": "other/repo"}, None, "custom"),
            "Qwen/Qwen3.5-27B",
        )
        self.assertEqual(model_hf_repo({}, "X", {"hf_repo": "org/x"}, None, "custom"), "org/x")
        # A self-hosted run may record the repo as its model ID.
        self.assertEqual(
            model_hf_repo({}, "Ornith-1.5-122B", None, "ornith-ai/Ornith-1.5-122B", "custom"),
            "ornith-ai/Ornith-1.5-122B",
        )
        # A hosted provider's model ID is never read as a repo.
        self.assertIsNone(model_hf_repo({}, "x", None, "openai/gpt-x", "openai"))


class DisplayTest(unittest.TestCase):
    LOBEHUB = {
        "icons": {
            "claude": {"title": "Claude", "icon": "lobehub/claude.svg"},
            "anthropic": {"title": "Anthropic", "icon": "lobehub/anthropic.svg"},
            "gemma": {"title": "Gemma", "icon": "lobehub/gemma.svg"},
        },
        "models": {"claude-opus-5-5": "claude", "gemma-2-9b": "gemma", "gemma-mini": "gemma"},
        "vendors": {"anthropic": "anthropic", "handmade": "anthropic"},
    }

    def test_vendor_icon_prefers_manual_then_lobehub_then_hugging_face(self):
        hf_orgs = {
            "anthropic": {"label": "Anthropic HF", "icon": "hf/anthropic.webp"},
            "ku-dfi": {"label": "KU Research Institute", "icon": "hf/ku-dfi.webp"},
        }
        show = lambda v: vendor_display(v, VENDORS, hf_orgs, self.LOBEHUB)  # noqa: E731
        self.assertEqual(show("handmade")["icon"], "handmade.png")
        self.assertEqual(show("anthropic"), {"id": "anthropic", "label": "Anthropic HF", "icon": "lobehub/anthropic.svg"})
        self.assertEqual(show("ku-dfi"), {"id": "ku-dfi", "label": "KU-DFI", "icon": "hf/ku-dfi.webp"})
        self.assertEqual(show("nobody"), {"id": "nobody", "label": "nobody", "icon": None})

    def test_model_icon_prefers_manual_and_can_be_turned_off(self):
        self.assertEqual(
            model_display("Claude Opus 5.5", VENDORS, self.LOBEHUB),
            {"label": "Claude", "icon": "lobehub/claude.svg"},
        )
        self.assertEqual(
            model_display("gemma-2-9b", VENDORS, self.LOBEHUB),
            {"label": "gemma-2-9b", "icon": "gemma2.png"},
        )
        # null in model_icons falls back to the vendor's icon.
        self.assertIsNone(model_display("Gemma-Mini", VENDORS, self.LOBEHUB))
        self.assertIsNone(model_display("GPT-5", VENDORS, self.LOBEHUB))

    def test_hand_made_vendor_icon_outranks_a_downloaded_model_icon(self):
        lobehub = {**self.LOBEHUB, "models": {"handmade-claude-7b": "claude"}}
        self.assertIsNone(model_display("Handmade-Claude-7B", VENDORS, lobehub, "handmade"))
        self.assertEqual(
            model_display("Handmade-Claude-7B", VENDORS, lobehub, "other")["icon"], "lobehub/claude.svg"
        )

    def test_every_checked_in_package_has_an_icon(self):
        vendors = json.loads((REPO / "catalog/vendors.json").read_text())
        hf_orgs = json.loads((REPO / "catalog/hf_orgs.json").read_text())
        lobehub = json.loads((REPO / "catalog/lobehub.json").read_text())
        for package, (vendor, model) in submitted_vendors(REPO).items():
            with self.subTest(package=package):
                self.assertIsNotNone(vendor)
                self.assertIsNotNone(vendor_display(vendor, vendors, hf_orgs, lobehub)["icon"])


class LobehubMatchTest(unittest.TestCase):
    def test_model_names_match_at_a_word_boundary(self):
        cases = [
            ("claude-opus-5-5", "Claude"),
            ("qwen3-6-35b-a3b-fp8", "Qwen"),
            ("yi-34b", "Yi"),
            ("yield-7b", None),
            # Only model icons count: Anthropic is a provider.
            ("anthropic-7b", None),
            ("mistral-small-qwen-distill", None),
        ]
        for key, title in cases:
            with self.subTest(key=key):
                match = lobehub_model_match(TOC, key)
                self.assertEqual(match and match["title"], title)

    def test_vendor_names_match_ignoring_punctuation(self):
        self.assertEqual(lobehub_vendor_match(TOC, ["zai-org", None, "Z.ai"])["id"], "ZAI")
        self.assertEqual(lobehub_vendor_match(TOC, ["anthropic"])["id"], "Anthropic")
        self.assertIsNone(lobehub_vendor_match(TOC, ["ornith-ai", "Ornith"]))


class ResolveLobehubTest(unittest.TestCase):
    def resolve(self, lobehub, in_use, refresh=True, icon_root=None):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        report = Report()
        files = resolve_lobehub(
            lobehub, VENDORS, {}, in_use, sources(), report, icon_root or Path(tmp.name), refresh
        )
        return files, report

    def test_models_and_vendors_are_mapped_and_icons_fetched(self):
        lobehub = {}
        files, report = self.resolve(
            lobehub, {("anthropic", "Claude Opus 5.5"), ("zai-org", "GLM-4.7-Flash"), ("ornith-ai", "Ornith-1.5-122B")}
        )
        self.assertEqual(lobehub["models"], {"claude-opus-5-5": "claude"})
        # zai-org matches through its Hugging Face name, Z.ai.
        self.assertEqual(lobehub["vendors"], {"anthropic": "anthropic", "zai-org": "zai"})
        self.assertEqual(files["lobehub/claude.svg"], CLAUDE_COLOR)
        # A single-colour icon is drawn in the site's light ink.
        self.assertIn(b'fill="#e8edf5"', files["lobehub/anthropic.svg"])
        self.assertEqual(lobehub["icons"]["anthropic"]["variant"], "mono")
        self.assertEqual(len(report.added_vendors), 3)

    def test_low_contrast_colour_icon_is_drawn_in_ink(self):
        self.assertLess(best_contrast(QWEN_COLOR), 3)
        lobehub = {}
        files, _ = self.resolve(lobehub, {("qwen", "Qwen3.5-27B")})
        self.assertEqual(lobehub["icons"]["qwen"]["variant"], "mono")
        self.assertIn(b"#e8edf5", files["lobehub/qwen.svg"])

    def test_manual_icons_are_not_matched(self):
        lobehub = {}
        # A hand-made model icon, and a hand-made vendor icon for a Claude-named model.
        self.resolve(lobehub, {("google", "Gemma-2-9B"), ("handmade", "Claude-Handmade")})
        self.assertEqual((lobehub["models"], lobehub["vendors"]), ({}, {}))

    def test_unchanged_icons_are_not_rewritten_and_unused_ones_are_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "lobehub").mkdir()
            (root / "lobehub/claude.svg").write_bytes(CLAUDE_COLOR)
            lobehub = {
                "icons": {
                    "claude": {"title": "Claude", "icon": "lobehub/claude.svg", "variant": "color", "version": "1.0.0"},
                    "gone": {"title": "Gone", "icon": "lobehub/gone.svg", "variant": "mono", "version": "1.0.0"},
                },
                "models": {"claude-opus-5-5": "claude", "old-model": "gone"},
                "vendors": {},
            }
            files, report = self.resolve(lobehub, {(None, "Claude Opus 5.5")}, icon_root=root)
        # A new release with identical bytes is recorded but not rewritten.
        self.assertEqual(lobehub["icons"]["claude"]["version"], "2.0.0")
        self.assertNotIn("lobehub/claude.svg", files)
        self.assertEqual(report.changed_vendors, [])
        # A model no package uses any more loses its mapping, and its icon goes.
        self.assertEqual(lobehub["models"], {"claude-opus-5-5": "claude"})
        self.assertEqual(files, {"lobehub/gone.svg": None})
        self.assertNotIn("gone", lobehub["icons"])


class ResolveHfOrgsTest(unittest.TestCase):
    def resolve(self, hf_orgs, in_use, lobehub=None, refresh=True):
        report = Report()
        files = resolve_hf_orgs(hf_orgs, VENDORS, lobehub or {}, in_use, sources(), TODAY, report, refresh)
        return files, report

    def test_new_organization_is_added_with_its_avatar(self):
        hf_orgs = {}
        files, report = self.resolve(hf_orgs, {"ornith-ai"})
        self.assertEqual(files, {"hf/ornith-ai.webp": WEBP})
        self.assertEqual(
            hf_orgs["ornith-ai"],
            {
                "org": "ornith-ai",
                "label": "Ornith",
                "icon": "hf/ornith-ai.webp",
                "avatar_url": "https://cdn.example/ornith.png",
                "retrieved": TODAY,
            },
        )
        self.assertEqual(len(report.added_vendors), 1)

    def test_vendor_with_a_lobehub_icon_keeps_only_its_name(self):
        hf_orgs = {}
        files, _ = self.resolve(hf_orgs, {"zai-org"}, lobehub={"vendors": {"zai-org": "zai"}})
        self.assertEqual(files, {})
        self.assertEqual(hf_orgs["zai-org"], {"org": "zai-org", "label": "Z.ai", "retrieved": TODAY})

    def test_changed_avatar_replaces_the_file_and_is_reported(self):
        hf_orgs = {
            "qwen": {
                "org": "Qwen",
                "label": "Qwen",
                "icon": "hf/qwen.webp",
                "avatar_url": "https://cdn.example/qwen-1.png",
                "retrieved": "2026-10-01",
            }
        }
        files, report = self.resolve(hf_orgs, {"qwen"})
        # The new avatar is a PNG, so the old WEBP goes.
        self.assertEqual(files, {"hf/qwen.webp": None, "hf/qwen.png": PNG})
        self.assertEqual(hf_orgs["qwen"]["retrieved"], TODAY)
        self.assertIn("new avatar", report.changed_vendors[0])

    def test_unchanged_organization_keeps_its_retrieval_date(self):
        hf_orgs = {
            "ornith-ai": {
                "org": "ornith-ai",
                "label": "Ornith",
                "icon": "hf/ornith-ai.webp",
                "avatar_url": "https://cdn.example/ornith.png",
                "retrieved": "2026-10-01",
            }
        }
        before = copy.deepcopy(hf_orgs)
        files, report = self.resolve(hf_orgs, {"ornith-ai"})
        self.assertEqual((files, hf_orgs), ({}, before))
        self.assertFalse(report.changed)

    def test_unusable_accounts_are_left_for_a_curator(self):
        hf_orgs = {}
        files, report = self.resolve(hf_orgs, {"someone", "nowhere", "bare-org", "handmade"})
        self.assertEqual(files, {})
        text = " ".join(report.unresolved)
        self.assertIn("`someone`: a personal Hugging Face account", text)
        self.assertIn("`nowhere`: no Hugging Face organization or LobeHub icon", text)
        self.assertIn("`bare-org`: the Hugging Face organization has no avatar", text)
        # A vendor with a hand-made label and icon is never looked up.
        self.assertNotIn("handmade", text)


class ValidateVendorsTest(unittest.TestCase):
    def repo(self, vendors, hf_orgs, lobehub=None):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / "catalog").mkdir()
        (root / "web/public/providers/hf").mkdir(parents=True)
        (root / "web/public/providers/hf/qwen.webp").write_bytes(WEBP)
        (root / "catalog/vendors.json").write_text(json.dumps(vendors))
        (root / "catalog/hf_orgs.json").write_text(json.dumps(hf_orgs))
        (root / "catalog/lobehub.json").write_text(json.dumps(lobehub or {}))
        return root

    def test_checked_in_vendor_catalog_is_valid(self):
        self.assertEqual(validate_vendors(REPO), [])

    def test_invalid_entries_are_rejected(self):
        good_org = {
            "org": "Qwen",
            "label": "Qwen",
            "icon": "hf/qwen.webp",
            "avatar_url": "https://cdn.example/qwen.png",
            "retrieved": TODAY,
        }
        cases = [
            ({"Qwen": {}}, {}, None, "lowercase"),
            ({"a": {"colour": "blue"}}, {}, None, "unknown field"),
            ({"a": {"label": ""}}, {}, None, "label must be"),
            ({"a": {"icon": "missing.png"}}, {}, None, "does not exist"),
            ({"a": {"icon": "../../../catalog/vendors.json"}}, {}, None, "stay under"),
            ({"a": {"models": "gpt-5"}}, {}, None, "list of names"),
            ({"a": {"models": ["GPT-5"]}, "b": {"models": ["gpt-5"]}}, {}, None, "claimed by both"),
            ({"a": {"model_icons": {"x": "missing.png"}}}, {}, None, "does not exist"),
            ({}, {"qwen": {**good_org, "icon": "hf/gone.webp"}}, None, "does not exist"),
            ({}, {"qwen": {k: v for k, v in good_org.items() if k != "avatar_url"}}, None, "go together"),
            ({}, {}, {"icons": {}, "models": {"x": "claude"}}, "unknown icon"),
        ]
        for vendors, hf_orgs, lobehub, message in cases:
            with self.subTest(message=message):
                errors = validate_vendors(self.repo(vendors, hf_orgs, lobehub))
                self.assertTrue(any(message in e for e in errors), errors)
        valid = self.repo({"qwen": {"label": "Qwen", "model_icons": {"Qwen-X": None}}}, {"qwen": good_org})
        self.assertEqual(validate_vendors(valid), [])


class CheckPackageTest(unittest.TestCase):
    def package(self, model, llm_provider, extra=None):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / "results").mkdir()
        (root / "metadata.yaml").write_text(
            yaml.safe_dump({"agent": {"model": model, "extra": extra or {}}})
        )
        (root / "results/identity.yaml").write_text(
            yaml.safe_dump({"run": {"model": model, "llm_provider": llm_provider}})
        )
        return root

    def check(self, model, llm_provider, extra=None):
        return check_package(
            self.package(model, llm_provider, extra), "0.2.0/pkg", {}, VENDORS, {}, {}, sources()
        )

    def test_saved_icon_passes(self):
        ok, line = self.check("Handmade-1", "custom", {"hf_repo": "handmade/Handmade-1"})
        self.assertTrue(ok, line)

    def test_lobehub_match_or_organization_avatar_passes(self):
        for model, source in (("claude-opus-5-5", "LobeHub icon `Claude`"), ("ornith-ai/Ornith-1.5-122B", "Hugging Face")):
            with self.subTest(model=model):
                ok, line = self.check(model, "anthropic" if model.startswith("claude") else "custom")
                self.assertTrue(ok, line)
                self.assertIn(source, line)
                self.assertIn("after merge", line)

    def test_gaps_are_reported_with_the_fix(self):
        cases = [
            (("Mystery-7B", "custom"), "List the model under `models`"),
            (("someone/Model-7B", "custom"), '"hf_accounts": ["someone"]'),
            (("nowhere/Model-7B", "custom"), "Add a `label` and `icon`"),
            (("bare-org/Model-7B", "custom"), "Add an `icon`"),
        ]
        for args, fix in cases:
            with self.subTest(model=args[0]):
                ok, line = self.check(*args)
                self.assertFalse(ok)
                self.assertIn(fix, line)


if __name__ == "__main__":
    unittest.main()
