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
