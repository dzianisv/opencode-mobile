# Publishing to Google Play Store

## Required GitHub Secrets

Configure these in **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | Google Play Console service account JSON key (full JSON content) |
| `KEYSTORE_BASE64` | Base64-encoded release keystore (`base64 -w0 release.keystore`) |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias in the keystore |
| `KEY_PASSWORD` | Key password |

## Setup Steps

### 1. Create a release keystore

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore -alias release \
  -keyalg RSA -keysize 2048 -validity 10000
```

Encode it for GitHub secrets:
```bash
base64 -w0 release.keystore
```

### 2. Create a Google Play service account

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > IAM > Service Accounts
2. Create a service account and download the JSON key
3. In Google Play Console > Settings > API access, link the service account
4. Grant it release management permissions for your app

### 3. Workflow triggers

The publish workflow runs on:
- GitHub Release publish events
- Tag pushes matching `v*`

It builds an AAB (Android App Bundle), signs it with the release keystore, and uploads to the **internal** track. Promote to production via Play Console.

## Releasing (proven runbook)

1. Bump `version` in `package.json` **and** `app.json` (`expo.version`). Do **not** bother hand-bumping `android.versionCode` for Play — the publish workflow overrides it with `github.run_number + 100` at build time (so the Play `versionCode` is e.g. `142`, unrelated to the number in `app.json`; that field only matters for local/other builds).
2. Update the **Play** release notes in `distribution/whatsnew/whatsnew-en-US` (single file, applied to the build being uploaded; **max 500 chars**). This — not the `fastlane/metadata/android/en-US/changelogs/*.txt` files — is what the Play publish uses (`whatsNewDirectory` in the workflow). The fastlane `changelogs/*.txt` files feed **F-Droid**, not Play; keep them for F-Droid but don't expect Play to read them. Merge to `main`.
3. Tag the release: `git tag -a vX.Y.Z <sha> -m "..." && git push origin vX.Y.Z`. This triggers the publish workflow → **internal** track.
4. Verify the publish run is green, then confirm the build on the internal track. Note its real Play `versionCode` (run_number+100) — that's what you promote, not the `app.json` number.
5. **Promote to production** (see below).

## Promoting to production

Production is **not** published by CI by default — the service account is scoped to the internal track only, which is intentional (a human gate before a build reaches all users).

- **Recommended — Play Console:** Production → Create release → **Add from library** → select the build by its **versionName** (e.g. `0.4.10`) and confirm its `versionCode` (the run_number-derived one, e.g. `142` — not the `app.json` number) → review → roll out. If the "What's new" field is empty, paste from `distribution/whatsnew/whatsnew-en-US`. No rebuild.
- **Fully automated (optional):** grant the CI service account **"Release to production"** for this app in Play Console → Users & permissions, then run the workflow's `workflow_dispatch` with `track=production`, `status=completed`. **Without that permission the production dispatch fails with `The caller does not have permission` after building** — so don't dispatch `track=production` until the service account has been granted production access.

## Fastlane (Alternative)

A Fastlane setup is included for local publishing:

```bash
bundle install
bundle exec fastlane android deploy
```

Set environment variables: `SUPPLY_JSON_KEY`, `RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.
