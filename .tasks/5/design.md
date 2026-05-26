## Problem / Goal / Success Metric
(carry over from Phase 2)

## Current State
- `build.yml` builds APK and attaches to GitHub releases (works for v0.3.1+)
- `publish-play-store.yml` builds AAB + publishes to Play Store (blocked: app not created yet)
- `publish-app-store.yml` publishes to TestFlight (blocked: Apple enrollment pending)
- No F-Droid distribution at all
- `distribution/fdroid-submission/metadata.yml` prepared for mainline F-Droid (manual MR)
- GitHub Pages NOT enabled on repo

## Proposed Design
New CI workflow `.github/workflows/publish-fdroid.yml`:

1. **Trigger**: on tag push (v*) OR workflow_dispatch
2. **Build APK**: reuse same steps as `build.yml` — npm install, expo prebuild, gradle assembleRelease with production signing
3. **Generate F-Droid repo**: install `fdroidserver`, restore repo signing keystore from secret, run `fdroid update --create-metadata` to produce signed repo index
4. **Deploy**: push `fdroid/` directory to `gh-pages` branch via `peaceiris/actions-gh-pages`

**One-time setup outside CI**:
- Generate F-Droid repo signing keystore → store as GitHub secret `FDROID_REPO_KEYSTORE_B64` + `FDROID_REPO_KEYSTORE_PASS` + `FDROID_REPO_KEY_ALIAS` + `FDROID_REPO_KEY_PASS`
- Enable GitHub Pages on repo (via Settings → Pages → source: `gh-pages` branch, `/` root)

**Repo URL**: `https://dzianisv.github.io/opencode-mobile/fdroid/repo`

The existing APK signing key (production-release.jks) signs the APK. The F-Droid repo needs a SEPARATE keystore for signing the repo index (index.xml). These are different keys for different purposes.

## Alternatives Considered
1. **Skip fdroidserver, manually craft index.xml** — rejected: fragile, violates F-Droid spec, no icon generation, no archive management
2. **Use IzzyOnDroid only** — rejected: IzzyOnDroid auto-delists when mainline F-Droid accepts the app; we want our own repo that persists regardless
3. **Wait for mainline F-Droid** — rejected: blocked on Play Store; self-hosted repo works today
4. **Deploy via S3/Cloudflare R2 instead of gh-pages** — rejected: gh-pages is free, zero infra, fits the existing GitHub-centric toolchain

## Risks & Open Questions
| Risk | Mitigation |
|------|------------|
| fdroidserver pip package may have missing deps in CI runner | Pin version, test via workflow_dispatch first |
| F-Droid repo keystore must be stable across CI runs | Generate once, store in secrets; if lost, repo URL changes |
| GitHub Pages not enabled | API call to enable via `gh api -X POST repos/:owner/:repo/pages` — one-time setup in the workflow |
| APK signature vs repo signature confusion | Document clearly in comments: two different keys |
| fdroidserver requires Java for apksigner | Already have JDK 17 in CI from android build steps |

## Touched Surface
- NEW: `.github/workflows/publish-fdroid.yml` — the workflow
- MODIFIED: `.gitignore` — add `.pyc` entries
- ONE-TIME: repo keystore generation (done during implementation)
- ONE-TIME: GitHub Pages enable (done via API)
