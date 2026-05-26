## Approach Summary
Add CI workflow that builds APK on tag push, generates self-hosted F-Droid repo via fdroidserver, and deploys to GitHub Pages. Users add `https://dzianisv.github.io/opencode-mobile/fdroid/repo` to F-Droid.

## Tradeoff: Speed vs Quality
- chosen: balanced
- rationale: CI pipeline should be reliable; fdroidserver needs careful config for signing key + GitHub Pages deploy. Balanced = thorough in CI-yaml correctness, pragmatic in skipping local Android SDK tests (CI-only).

## Tasks

| # | Title | Files | Depends on | Parallel group | Suggested model |
|---|-------|-------|------------|----------------|-----------------|
| 1 | Generate F-Droid repo keystore + store as GitHub secret | (manual step) | — | A | deepseek-v4-flash-free |
| 2 | Enable GitHub Pages on repo via API | (manual/API step) | — | A | deepseek-v4-flash-free |
| 3 | Write publish-fdroid.yml workflow | `.github/workflows/publish-fdroid.yml`, `.gitignore` | 1, 2 | B | general-purpose |
| 4 | Add `.pyc` to gitignore | `.gitignore` | — | A | general-purpose |

## Parallel Groups
- **A** (independent, manual one-time): 1, 2, 4 — run in parallel
- **B**: 3 — workflow implementation after secrets infrastructure is ready

## Done Criteria
1. `publish-fdroid.yml` exists, valid YAML, lints clean
2. On tag push, CI builds APK, generates F-Droid repo, deploys to gh-pages
3. GitHub Pages is enabled on the repo
4. F-Droid repo keystore stored as GitHub secret
5. `https://dzianisv.github.io/opencode-mobile/fdroid/repo` returns valid F-Droid repo index
6. `.gitignore` has `__pycache__` / `*.pyc`

## Rollback Plan
- Revert the workflow file
- Disable GitHub Pages via API
- Delete `gh-pages` branch
