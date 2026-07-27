# Submission checklist

Copy into your PR description:

- [ ] Package produced from an official `nika benchmark run --release …`
- [ ] `nika leaderboard validate <package>` passed locally
- [ ] `metadata.yaml` has non-empty `info.name`, `info.authors`, `agent.model`, `agent.framework`
- [ ] `README.md` describes the system, authors, and links (code / report / site if any)
- [ ] Package path is `submissions/<release_version>/{YYYYMMDD}_{slug}/`
- [ ] No secrets or absolute paths in package text fields
- [ ] CI validate workflow is green
