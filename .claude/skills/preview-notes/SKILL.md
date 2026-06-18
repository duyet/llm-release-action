---
name: preview-notes
description: Render real release notes for a tag/range against this repo's actual git history so recap-script and template edits can be eyeballed against real data (no LLM tier runs locally). Usage: /preview-notes <tag> (e.g. /preview-notes v0.3.0) or /preview-notes <prev>..<cur>.
---

Render the deterministic pipeline against real git history. The AI summary tier doesn't run locally, so only the recap block + compare link + attribution render — which is exactly the surface to inspect when editing `scripts/release-recap.mjs`, `scripts/generate-release-notes.mjs`, or the prompt templates.

1. **Resolve the range from `$ARGUMENTS`**:
   - If it contains `..` (e.g. `v0.2.7..v0.3.0`), use it directly. `prev`/`cur` are the two ends.
   - If it's a single tag `<tag>`: `prev = git describe --tags --abbrev=0 <tag>^` (fall back to `HEAD^`); range = `prev..<tag>` (or `prev..HEAD` if `<tag>` is `HEAD`/empty).
   - If empty: `prev = git describe --tags --abbrev=0 HEAD^`; range = `prev..HEAD`; `tag` = `HEAD`.

2. **Compute the recap** into `recap.md` + `recap-facts.txt`:
   ```
   RANGE=<range> RELEASE_TAG=<tag> PREVIOUS_TAG=<prev> GITHUB_REPOSITORY=duyet/llm-release-action \
     node scripts/release-recap.mjs
   ```

3. **Render the notes** to stdout:
   ```
   AI_SUMMARY="" AI_PROVIDER="" RECAP_MD="$(cat recap.md)" \
   RELEASE_TAG=<tag> PREVIOUS_TAG=<prev> DOCKER_IMAGE="" \
   node scripts/generate-release-notes.mjs
   ```

4. **Print the rendered notes** for review.

Cleanup the two temp files (`recap.md`, `recap-facts.txt`) when done unless the user wants to keep them.
