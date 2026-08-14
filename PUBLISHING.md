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

It builds an AAB (Android App Bundle), signs it with the release keystore, and uploads to the **production** track (`status: completed`). Manual `workflow_dispatch` runs still honour the `track`/`status` inputs and default to `internal`.

## Releasing (proven runbook)

1. Bump the version in **four** places, then run `npm run check:versions` before you push: `package.json` `version`, `app.json` `expo.version`, and `android/app/build.gradle` `versionName` — plus `versionCode` in **both** `app.json` (`expo.android.versionCode`) and `build.gradle`, incremented by one.
   - Play does not need the hand-bumped `versionCode` (the publish workflow overrides it with `github.run_number + 100`, so the Play code is e.g. `152`, unrelated to the `app.json` number). **F-Droid and direct-APK installs do.** They key upgrades off `versionCode`, so a release that reuses the previous one is silently never offered to anyone who already has that code installed. v0.4.15 shipped with v0.4.14's `versionCode 41` for exactly this reason (fixed in #180) — the F-Droid publish failed outright and the GitHub release never got created.
2. Add the changelog for the **new versionCode** in both `distribution/changelogs/<versionCode>.txt` and `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` (F-Droid reads the fastlane copy), and update the **Play** release notes in `distribution/whatsnew/whatsnew-en-US` (single file, applied to the build being uploaded; **max 500 chars**). `whatsnew` — not the fastlane `changelogs/*.txt` — is what the Play publish uses (`whatsNewDirectory` in the workflow). `check:versions` enforces that the changelog named after the versionCode describes the version you are releasing. Merge to `main`.
3. Tag the release: `git tag -a vX.Y.Z <sha> -m "..." && git push origin vX.Y.Z`. This triggers the publish workflow → **production** track, `status: completed`.
4. Verify the publish run is green, and read the run summary — it records the event, resolved track/status, and the real Play `versionCode` (run_number+100, not the `app.json` number).
5. Check the other two channels, because Play is only one of three and the smaller share of the install base: the **GitHub release** exists with both APKs (`build.yml`'s `release` job — this is what the in-app update check polls via `releases/latest`), and the **F-Droid index** lists the new version (`https://dzianisv.github.io/opencode-mobile/fdroid/repo/index-v1.json`).
6. Nothing else to do. There is no second promotion step.

## Promoting to production

CI does this for you on every release tag (AGE-110). The service account **does** hold "Release to production" — verified by run [31807432647](https://github.com/dzianisv/opencode-mobile/actions/runs/31807432647) (`Validating tracks: 'production'` → committed edit 02632873494323676310, 2026-08-14 14:22 UTC), so the older "internal only" note here was stale.

Manual paths, still available when you need them:

- **Recommended — Play Console:** Production → Create release → **Add from library** → select the build by its **versionName** (e.g. `0.4.10`) and confirm its `versionCode` (the run_number-derived one, e.g. `142` — not the `app.json` number) → review → roll out. If the "What's new" field is empty, paste from `distribution/whatsnew/whatsnew-en-US`. No rebuild.
- **Fully automated (optional):** `workflow_dispatch` with `track=production`, `status=completed` — same thing the tag push does, useful for re-shipping `main` without cutting a tag.

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
