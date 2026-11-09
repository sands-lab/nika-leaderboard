import json
import subprocess
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = yaml.safe_load(
    (ROOT / ".github/workflows/validate-submission.yml").read_text()
)
SCRIPT = WORKFLOW["jobs"]["changes"]["steps"][0]["with"]["script"]
PACKAGE = "submissions/0.2.0/example"


class EntryRoutingTest(unittest.TestCase):
    def route(self, files, policy, changed_files=None):
        fixture = {
            "files": files,
            "policy": policy,
            "changed_files": len(files) if changed_files is None else changed_files,
        }
        harness = """
const fixture = JSON.parse(process.argv[1]);
const output = {};
const context = {repo: {owner: 'sands-lab', repo: 'nika-leaderboard'},
  sha: 'trusted-workflow-sha', payload: {pull_request: {number: 87}}};
const core = {setOutput: (key, value) => {output[key] = value}};
const github = {rest: {pulls: {get: async () => ({data: {
  head: {sha: 'entry-pr-sha'}, changed_files: fixture.changed_files}}), listFiles: {}},
  repos: {getContent: async (args) => {
    if (args.ref !== 'trusted-workflow-sha') throw new Error('Untrusted policy revision');
    if (args.path !== 'catalog/unverified.json') throw new Error('Unexpected policy path');
    if (fixture.policy === null) throw Object.assign(new Error('Not found'), {status: 404});
    return {data: {content: Buffer.from(JSON.stringify(fixture.policy)).toString('base64')}};
  }}}, paginate: async () => fixture.files};
(async () => { SCRIPT; process.stdout.write(JSON.stringify(output)); })()
  .catch(error => {process.stderr.write(error.message); process.exitCode = 1});
""".replace("SCRIPT", SCRIPT)
        return subprocess.run(
            ["node", "-e", harness, json.dumps(fixture)],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_only_trusted_policy_selects_unverified_scores(self):
        result = self.route(
            [{"filename": PACKAGE + "/metadata.yaml"}],
            {"0.2.0/example": {"reason": "Trajectories not provided."}},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["unverified_packages"], PACKAGE)
        self.assertEqual(output["audit_packages"], "")
        self.assertEqual(output["scores_ref"], "entry-pr-sha")

    def test_missing_policy_requires_trajectory_audit(self):
        result = self.route([{"filename": PACKAGE + "/metadata.yaml"}], None)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["audit_packages"], PACKAGE)
        self.assertEqual(output["unverified_packages"], "")

    def test_mixed_entries_keep_their_respective_checks(self):
        result = self.route(
            [
                {"filename": PACKAGE + "/metadata.yaml"},
                {"filename": "submissions/0.2.0/other/metadata.yaml"},
            ],
            {"0.2.0/example": {"reason": "Trajectories not provided."}},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["unverified_packages"], PACKAGE)
        self.assertEqual(output["audit_packages"], "submissions/0.2.0/other")

    def test_invalid_policy_and_incomplete_inventory_fail(self):
        for policy, changed_files in [({"0.2.0/example": {"reason": ""}}, 1), ({}, 2)]:
            result = self.route(
                [{"filename": PACKAGE + "/metadata.yaml"}], policy, changed_files
            )
            self.assertNotEqual(result.returncode, 0)
