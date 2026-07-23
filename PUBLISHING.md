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

## Resubmitting after a Data Safety rejection (issue #143)

Google Play rejected `cc.agentlabs.opencode` on 2026-07-22 because the app's Data Safety
declaration did not disclose collection of **Email Address**. Root cause: the "OpenCode
Connect" waitlist card on the Connect screen (`app/connection/add.tsx` →
`src/lib/waitlist.ts` → `POST https://opencode.agentlabs.cc/api/beta-signup`) collects an
email address when a user opts in, and the backend forwards it to **Brevo** (email
marketing/CRM). This was true collection that the Data Safety form did not declare — Play
requires *all* personal-info collection to be declared, even when it's optional and
unrelated to the app's core function.

The repo-side declaration is now fixed (this PR): `distribution/play-listing.md` Data Safety
table, `distribution/privacy-policy.md`/`.html`, and `docs/privacy/index.html` all disclose
the email collection. To resubmit:

1. **Play Console → your app → App content → Data safety → Manage**.
2. Under **Data types → Personal info**, check **Email address**.
   - **Is this data collected, shared, or both?** → **Collected and shared**.
   - **Is this data processed ephemerally?** → No.
   - **Is data collection required for your app, or can users choose whether this data is
     collected?** → **Users can choose whether this data is collected** (optional — only
     collected if the user opts into the waitlist).
   - **Why is this user data collected?** → check **Account management** (the waitlist is a
     signup for the not-yet-launched hosted service). Optionally also check **App
     functionality** if Console requires at least one additional purpose.
   - Under sharing: declare it is shared with a third party (Brevo) for the same purpose.
3. Re-verify the existing declared types are still accurate (unchanged by this fix):
   **App activity** (PostHog analytics), **App info and performance / Crash logs** (Sentry),
   and **Diagnostics — user-submitted reports** (Chatwoot) — all opt-in, default OFF, shared
   with the named third parties. See the full table in `distribution/play-listing.md` →
   "Data safety form".
4. Confirm the **Privacy policy URL** field still points at
   `https://dzianisv.github.io/opencode-mobile/privacy/` (now updated with the email
   disclosure — `docs/privacy/index.html`, mirrored from `distribution/privacy-policy.md`).
5. Save, then **Send for review** (Play re-reviews Data Safety changes; this is separate from
   a binary/release review since no code changed).
6. Once Data Safety is approved, resume any blocked release rollout (e.g. 0.4.12 and pending
   retention fixes) — those builds themselves did not need to change, only the Console-side
   declaration.

**Known earlier blocker (if it resurfaces):** a prior release (v0.4.5) was blocked by Google
with a "Missing sign-in details" rejection under **App access**, not Data Safety — Play
reviewers could not exercise the app because it requires the user's own opencode server and
Play had no way to sign in / connect one. That was resolved (see `HANDOFF.md`) by providing
reviewer instructions plus a temporary demo server URL in the **App access** form (see the
reviewer-instructions block in `distribution/play-listing.md` → "App access"). If a future
review flags "sign-in details" again, the fix is the same: confirm **App access** still has
either working temporary credentials/demo server or an accurate "all functionality available
without sign-in" declaration — this is unrelated to the Data Safety fix in this PR, but is
the other known rejection mode for this app and worth checking in the same Console pass.

## Fastlane (Alternative)

A Fastlane setup is included for local publishing:

```bash
bundle install
bundle exec fastlane android deploy
```

Set environment variables: `SUPPLY_JSON_KEY`, `RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.
