# llm-release-action

Centralized, AI-assisted release-notes logic shared across [duyet](https://github.com/duyet)'s
repositories. A single composite action turns a release tag into a rich GitHub
Release body:

- **AI summary** with a best-effort **GitHub Copilot → GitHub Models → AnyRouter**
  fallback. The release never fails on inference — if every tier is unavailable
  the notes still render from the deterministic recap + changelog link.
- **Deterministic recap stats** — commits, PRs, days, pace, day/night split,
  contributors, AI-agent involvement and a shoutout to the most active agent.
- **Docker block** — a ready `docker pull` + `FROM …` snippet with the release's
  image tag injected.
- **Compare link** to the previous tag.
- **Paste-able migration prompt** appended automatically on breaking / non-patch
  releases (when the repo supplies one).

Pairs with [`release-please`](https://github.com/googleapis/release-please-action)
for the semver + tag + standing-changelog-PR half of the pipeline.

## Usage

```yaml
# .github/workflows/release.yml
permissions:
  contents: write
  models: read        # required for the GitHub Models / Copilot tiers

jobs:
  release-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.release.tag_name || inputs.tag }}
          fetch-depth: 0          # full history for recap + compare link

      - uses: duyet/llm-release-action@v1
        with:
          release-tag: ${{ github.event.release.tag_name || inputs.tag }}
          project-name: chmonitor
          docker-image: ghcr.io/duyet/clickhouse-monitoring
          docker-extra-image: ghcr.io/duyet/chmonitor
          notes-prompt-file: .github/release-notes-prompt.md
          migration-prompt-file: .github/release-migration-prompt.md
          # Optional AnyRouter fallback — tier is skipped when the secret is unset.
          anyrouter-api-key: ${{ secrets.ANYROUTER_API_KEY }}
          anyrouter-model: ${{ vars.ANYROUTER_MODEL }}
```

> **Get an API key** for the LLM fallback tier at
> [keylicity.com](https://keylicity.com), then pass it via the action's
> `*-api-key` input shown in the table below.

### Inputs

| Input | Default | Notes |
|---|---|---|
| `release-tag` | — | **Required.** `vX.Y.Z`. |
| `previous-tag` | auto | Auto-detected from git when empty. |
| `project-name` | repo name | Used in the default prompt + attribution. |
| `notes-prompt-file` | bundled generic | Repo-local override; `{{PROJECT_NAME}}`/`{{RELEASE_TAG}}`/`{{RANGE}}`/`{{RECAP}}`/`{{COMMITS}}` are substituted. |
| `system-prompt-file` | bundled generic | Repo-local override. |
| `migration-prompt-file` | — | Appended on breaking / non-patch releases. |
| `migration` | `auto` | `auto` \| `true` \| `false`. |
| `copilot-model` / `models-model` | `openai/gpt-4o` | |
| `anyrouter-api-key` | — | Enables the AnyRouter tier when set. |
| `anyrouter-endpoint` | `https://anyrouter.dev/api/v1` | |
| `anyrouter-model` | `openai/gpt-4o-mini` | |
| `anyrouter-source` / `anyrouter-title` | `project-name` | App-attribution headers. |
| `anyrouter-categories` | `programming-app` | App-attribution header. |
| `docker-image` / `docker-extra-image` / `docker-version` | — | Enables the Docker block when `docker-image` is set. |
| `publish` | `true` | Create/update the GitHub Release body. |
| `github-token` | `github.token` | |

### Outputs

| Output | Notes |
|---|---|
| `notes-file` | Path to `release-notes.md`. |
| `ai-provider` | `copilot` \| `github-models` \| `anyrouter` \| empty. |
| `migration` | `true`/`false`. |
| `previous-tag` / `range` | Resolved values. |

## Example output

A generated release body looks roughly like this — the AI-written summary is the
top section; everything below it is deterministic and renders even if every LLM
tier is unavailable.

````markdown
## ✨ Features

- Add peak-hour and top-contributor stats to the release recap
- Add an "Upgrade with AI" copy-prompt section to every release

## 📊 Release recap

- 📦 **18 commits** across **6 pull requests**
- 🧯 Closed **4 issues**
- 🗓️ Shipped over **5 days** — pace **~3.6 commits/day**
- ⏰ Peak hour **14:00 UTC** · 🌞 12 day / 🌙 6 night
- 👥 **3 contributors**
- 💬 **24 comments** back and forth across reviews
- 🤖 **2 AI agents** involved
- 🙌 Top contributors: 👤 **Alice** (9), 👤 **Bob** (5), 🤖 **dependabot** (4)

## 🐳 Docker image

This release is published to the GitHub Container Registry as `ghcr.io/owner/repo:0.3.0`.

```bash
docker pull ghcr.io/owner/repo:0.3.0
```

Pin it in your own `Dockerfile`:

```dockerfile
FROM ghcr.io/owner/repo:0.3.0
```

## 🔁 Full changelog

**Compare:** [`v0.2.7...v0.3.0`](https://github.com/owner/repo/compare/v0.2.7...v0.3.0)

## 🤖 Upgrade with AI

Release notes: [`v0.3.0`](https://github.com/owner/repo/releases/tag/v0.3.0)

Paste this into your AI agent to upgrade from `v0.2.7` to `v0.3.0`:

```text
I'm currently on v0.2.7. Read the v0.3.0 release notes at
https://github.com/owner/repo/releases/tag/v0.3.0 (full diff:
https://github.com/owner/repo/compare/v0.2.7...v0.3.0), then upgrade this
project to v0.3.0 — apply the breaking changes, follow any migration steps,
and verify the build and tests still pass.
```

> Built from commit `1a2b3c4` on 2026-06-18 · summary by `copilot`.
````

## Companion: GitHub's own auto-generated release notes

When you'd rather have GitHub group PRs by label (no LLM), drop a
[`.github/release.yml`](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)
in the consuming repo. It pairs well with semver labels:

```yaml
# .github/release.yml
changelog:
  exclude:
    labels: [ignore-for-release]
    authors: [dependabot]
  categories:
    - title: ⚠️ Breaking Changes 🛠
      labels: [semver-major, breaking-change]
    - title: ✨ Exciting New Features 🎉
      labels: [semver-minor, enhancement, feature]
    - title: 🐛 Bug Fixes
      labels: [semver-patch, bug, fix]
    - title: Other Changes
      labels: ["*"]
```

This action's `release-please` config already emits the equivalent grouped
`CHANGELOG.md`; the `.github/release.yml` is useful for the GitHub "Generate
release notes" button and for the compare view.

## License

MIT
