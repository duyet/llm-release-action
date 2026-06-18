---
name: validate
description: Locally replicate the CI validation for llm-release-action — syntax-check both scripts and run the smoke-test note-rendering fixture with the same grep assertions. Use before pushing changes to scripts/ or action.yml. No test runner exists; this is the only verification loop.
---

There is no `npm test`. Replicate `.github/workflows/ci.yml` exactly:

1. **Syntax-check both scripts** (fail fast on parse errors):
   ```
   node --check scripts/release-recap.mjs
   node --check scripts/generate-release-notes.mjs
   ```

2. **Run the smoke-test note rendering** with the synthetic fixture from `ci.yml`. Export the same env vars —
   `AI_SUMMARY="## ✨ Features\n- Do a new thing"`, `AI_PROVIDER=copilot`,
   `RECAP_MD="## 📊 Release recap\n\n- 📦 **3 commits**"`,
   `RELEASE_TAG=v9.9.9`, `PREVIOUS_TAG=v9.9.8`,
   `GITHUB_REPOSITORY=duyet/llm-release-action`, `GITHUB_SHA=0123456789abcdef`,
   `DOCKER_IMAGE=ghcr.io/duyet/example` — then run
   `node scripts/generate-release-notes.mjs`.

3. **Grep the output** and assert each is present (these mirror CI):
   - `docker pull ghcr.io/duyet/example:9.9.9`
   - `FROM ghcr.io/duyet/example:9.9.9`
   - `compare/v9.9.8...v9.9.9`
   - `summary by \`copilot\`` (the attribution line)
   - `releases/tag/v9.9.9` (the upgrade-section release-page link)
   - `Upgrade with AI` (the new section heading)

4. **Smoke-test recap rendering** against this repo's history (no token needed —
   the `RANGE=HEAD` fixture has no PR numbers, so no `gh` API calls fire):
   ```
   RANGE=HEAD RELEASE_TAG=v9.9.9 PREVIOUS_TAG=v9.9.8 \
     GITHUB_REPOSITORY=duyet/llm-release-action node scripts/release-recap.mjs >/dev/null
   ```
   Then assert `recap.md` contains `📊 Release recap`, `commit`, `Peak hour`, and
   `Top contributors` (structural substrings — numbers vary with history).

If any assertion fails, fix before pushing. Report exactly which grep failed — do not claim "validated" if a step was skipped.
