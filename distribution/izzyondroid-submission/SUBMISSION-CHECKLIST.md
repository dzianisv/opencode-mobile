# IzzyOnDroid Submission Checklist

Step-by-step guide to file the inclusion request for `ai.opencode.mobile`
in the IzzyOnDroid F-Droid repository.

IzzyOnDroid is the fastest OSS distribution channel — typical inclusion is
1–3 days after filing. It serves pre-built APKs directly from GitHub releases.

**Pre-condition: a signed APK must be attached to a GitHub release tag before filing.**

---

## Prerequisites

- [ ] Signed release APK (not AAB) exists and is attached to a GitHub tag
      (e.g. `https://github.com/dzianisv/opencode-mobile/releases/tag/v0.2.4`)
- [ ] APK is signed with `keystores/production-release.jks`
- [ ] SHA-256 fingerprint confirmed: see `distribution/SIGNING-KEY-FINGERPRINTS.md`
- [ ] Sentry opt-in gate is in production (avoids `Tracking` anti-feature escalation)
- [ ] Privacy policy is live at `https://opencode.vibebrowser.app/privacy`
- [ ] `app.json` `version` and `android.versionCode` are set correctly in the tagged commit

---

## Step 1 — Attach APK to GitHub release

The CI workflow currently builds an AAB (for Play Store). For IzzyOnDroid and
F-Droid you need a **universal APK**.

Option A — Convert AAB to universal APK with bundletool:
```bash
bundletool build-apks \
  --bundle=android/app/build/outputs/bundle/release/app-release.aab \
  --output=apks.apks \
  --mode=universal \
  --ks=keystores/production-release.jks \
  --ks-pass=pass:<STOREPASS> \
  --ks-key-alias=<KEY_ALIAS> \
  --key-pass=pass:<KEY_PASS>

unzip apks.apks universal.apk -d apk-out/
# Resulting APK: apk-out/universal.apk → rename to app-release.apk
```

Option B — Add `assembleRelease` to CI alongside `bundleRelease`, then
attach the resulting `app-release.apk` to the GitHub release artifact.

Whichever option, attach the `.apk` file to the GitHub release created by the
release tag.

---

## Step 2 — Verify the APK

```bash
# Confirm package id and version
aapt dump badging apk-out/universal.apk | grep -E "package:|versionCode|versionName"
# Expected:
#   package: name='ai.opencode.mobile' versionCode='<N>' versionName='<X.Y.Z>'

# Confirm signing fingerprint matches distribution/SIGNING-KEY-FINGERPRINTS.md
apksigner verify --print-certs apk-out/universal.apk | grep SHA-256
```

---

## Step 3 — Create a Codeberg account (if needed)

IzzyOnDroid issues are hosted on Codeberg (not GitHub).
URL: https://codeberg.org

Register or log in at https://codeberg.org/user/sign_up

---

## Step 4 — File the inclusion issue

1. Go to https://codeberg.org/IzzyOnDroid/repodata/issues
2. Click "New Issue"
3. Title: `Include ai.opencode.mobile (OpenCode Mobile)`
4. Body: paste the content from `distribution/izzyondroid-submission/INCLUSION-REQUEST.md`
   (with all `<PLACEHOLDER>` values replaced)
5. Submit

---

## Step 5 — Monitor and respond

- IzzyOnDroid maintainers typically respond within 1–3 days.
- Common requests:
  - Confirm APK URL pattern resolves correctly
  - Confirm signing key fingerprint via `apksigner` output
  - Clarification on anti-features
- Once accepted, the app appears in the next IzzyOnDroid index build (usually within 24h).

---

## Step 6 — After acceptance

- Add the IzzyOnDroid badge to `README.md`
- Update `distribution/strategy.md` status row for IzzyOnDroid to "live"
- Update `docs/fdroid.md` with inclusion date
- When mainline F-Droid MR is later accepted, comment on this issue:
  "Mainline F-Droid has accepted ai.opencode.mobile — please auto-delist per policy."

---

## Reference

- IzzyOnDroid inclusion policy: https://apt.izzysoft.de/fdroid/index/info
- Codeberg issues: https://codeberg.org/IzzyOnDroid/repodata/issues
- IzzyOnDroid repo (for badge URLs): https://apt.izzysoft.de/fdroid/index/apk/ai.opencode.mobile
