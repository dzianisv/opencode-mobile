# Review: Task 5 — F-Droid CI Pipeline

Checked against `.tasks/5/design.md`, `.tasks/5/plan.md`, and `git diff origin/main...HEAD`.

---

## Findings

### 1. `.gitignore` — duplicate `*.jks` removed (correct, not a bug)

Original `origin/main:.gitignore` had `*.jks` twice: line 9 (`*.aab` → `*.jks` → `*.keystore`) and line 14 (after `keystores/`). The diff removes the duplicate at line 14 and adds `__pycache__/` + `*.pyc`. Single `*.jks` on line 9 remains. JKS files are still gitignored. ✅

### 2. `.github/workflows/publish-fdroid.yml:82` — `fdroidserver` version not pinned

`pip install fdroidserver` installs whatever the latest release is at CI time. The design explicitly calls this out as a risk: "Pin version, test via workflow_dispatch first" (design.md:36). Without a pin (`fdroidserver==2.2.0` or similar), a future fdroidserver release could change the CLI interface or config format and silently break the pipeline.

Fix: `pip install fdroidserver==2.2.0` (or the current stable version). Add a comment linking to the version used during testing.

### 3. `.github/workflows/publish-fdroid.yml:100` — No verification after `fdroid update`

The `fdroid update --create-metadata` step runs without any post-condition check. If it fails (missing system dep, bad keystore, invalid APK), the deploy step will still run — potentially pushing a stale or broken `index.xml` to gh-pages. The site would serve a 404 or corrupt repo index.

Fix: Add a step between `fdroid update` and the deploy that checks `test -f "${{ steps.fdroid-setup.outputs.fdroid-dir }}/repo/index.xml"`, or use `fdroid verify` if available.

### 4. `.github/workflows/publish-fdroid.yml:13` — Unnecessary `pages: write` permission

`peaceiris/actions-gh-pages@v4` pushes to the `gh-pages` branch via `GITHUB_TOKEN` with `contents: write`. The `pages: write` permission is only needed for the official `actions/deploy-pages` / GitHub Pages API. Harmless but misleading — could confuse future maintainers.

Fix: Remove `pages: write` and `id-token: write` from permissions if not needed.

### 5. `.github/workflows/publish-fdroid.yml:52-53` — Signing check differs from `build.yml`

In `build.yml:53`, production signing requires `refs/tags/v*` AND the secret:
```yaml
if [[ "${{ github.ref }}" == refs/tags/v* && -n "${{ secrets.KEYSTORE_BASE64 }}" ]]; then
```

In `publish-fdroid.yml`, it only checks the secret exists:
```yaml
if [[ -n "${{ secrets.KEYSTORE_BASE64 }}" ]]; then
```

This means a `workflow_dispatch` run will sign with the production key even without a tag. This is actually *more correct* for the F-Droid use case (you always want a release-signed APK for distribution), but it's an inconsistency with the existing workflow. Not a bug, worth noting.

### 6. Design alignment — overall

The workflow implements the 4-stage design (trigger → build APK → fdroid update → deploy). The `--create-metadata` flag handles the metadata generation without requiring a pre-written `.yml` file. The key separation (APK signing vs. repo signing) is correctly enforced by using different secrets. The deployment path (`fdroid/repo`) matches the documented repo URL. ✅

### Done criteria check (plan.md):

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `publish-fdroid.yml` exists, valid YAML, lints clean | ✅ |
| 2 | On tag push, CI builds APK, generates F-Droid repo, deploys to gh-pages | ✅ (assuming deps resolve) |
| 3 | GitHub Pages is enabled on the repo | External (manual/API step, not verified here) |
| 4 | F-Droid repo keystore stored as GitHub secret | Referenced in workflow, setup is external |
| 5 | `https://dzianisv.github.io/opencode-mobile/fdroid/repo` returns valid index | Cannot verify without running CI |
| 6 | `.gitignore` has `__pycache__` / `*.pyc` | ✅ |

---

## VERDICT: fix-required → RESOLVED

All findings addressed:
- **#2 (fix-required)**: Pinned `fdroidserver==2.4.4` — commit f503e4f
- **#3 (recommended)**: Added post-update `index.xml` verification step — commit f503e4f
- **#4 (recommended)**: Removed `pages: write` and `id-token: write` — commit f503e4f
