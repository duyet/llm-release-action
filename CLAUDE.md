# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **GitHub composite action** (`action.yml`, `using: composite`) that turns a release tag into a GitHub Release body: an AI summary (GitHub Copilot → GitHub Models → OpenAI-compatible fallback), deterministic recap stats, a Docker block, a compare link, and an optional migration prompt. Pairs with `release-please` for semver/tagging.

## No build, no deps, no test runner

- Plain Node **22** ES modules (`.mjs`). No `package.json`, no lockfile, no `npm test`.
- The two scripts are **dependency-free** — only `node:child_process`/`node:fs` plus the `git` and `gh` CLIs via `execSync`.
- **To validate locally**: there is no test command. Replicate `.github/workflows/ci.yml` — `node --check` both scripts, then run the smoke-test fixture (fake `AI_SUMMARY`/`AI_PROVIDER=copilot`/`RELEASE_TAG=v9.9.9`/… env vars) and grep the output. The `/validate` skill does this.

## The files↔env contract (the #1 gotcha)

The two scripts have **opposite** I/O contracts — getting this wrong is the most common mistake:

- `scripts/release-recap.mjs` reads env (`RANGE`, `RELEASE_TAG`, `PREVIOUS_TAG`, `GITHUB_REPOSITORY`, `GH_TOKEN`) and **writes `recap.md` + `recap-facts.txt` to the current working directory**.
- `scripts/generate-release-notes.mjs` is deterministic and reads **everything from env vars**, not files. `action.yml` does `export AI_SUMMARY="$(cat ai-summary.md)"` / `export RECAP_MD="$(cat recap.md)"` before invoking it, and writes its **stdout** to `release-notes.md`.

Bundled scripts/prompts are located via `$GITHUB_ACTION_PATH` (composite-action-relative). Intermediate files (`recap.md`, `recap-facts.txt`, `ai-prompt.txt`, `ai-summary.md`, `release-notes.md`, `final-notes.md`) are written to the workspace cwd, not `$RUNNER_TEMP`.

## LLM tiers

Three `actions/ai-inference@v2` steps, **all `continue-on-error: true`** — a release never fails on inference. Chain: Copilot (`copilot-model`) → GitHub Models (`models-model`, runs only if Copilot empty) → OpenAI-compatible (`openai-endpoint`+`openai-api-key`, runs only if both empty and a key is set). `ai-provider` output is one of `copilot | github-models | openai | empty`.

## Backward compatibility is a hard constraint

This action is **shared verbatim across every duyet repo** and consumers pin `@v1`. Inputs, outputs, and prompt template placeholders are a contract: do **not** rename/remove an input or change an output's `value` mapping without a major bump and a migration note. Adding new inputs with defaults is safe.

## Publishing

`@v1` is a **moving branch** (force-updated to `main`), not per-release tags. Publish with:
```
git push origin main:refs/heads/v1 --force
```

## Conventions

- **Code style**: no semicolons (ASI), single quotes, 2-space indent, ES modules, `??` and optional chaining. Match the existing `.mjs` files.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`).
- **Migration auto-detection** (`action.yml` "Compute commit range"): `migration: auto` means true when the bump is non-patch (`${CUR%.*}` differs, so `1.2.x` vs `1.3.x` but **not** `1.2.3` vs `1.2.4`) **or** a commit subject/body matches `BREAKING CHANGE` / `!:`.
- The recap script's day/night split uses **UTC** hours (6–18 = day).
