# F-Droid Mainline Submission Checklist

This checklist covers the steps to file a Merge Request against
https://gitlab.com/fdroid/fdroiddata to add `ai.opencode.mobile` to the
F-Droid main repository.

**Do NOT start this process until ALL prerequisites are checked.**

---

## Prerequisites (must all be true before filing)

- [ ] First Google Play release is live (proves signing key is in production use)
- [ ] Signed APK (not AAB) is attached to a GitHub release tag (e.g. `v0.2.4`)
- [ ] Sentry opt-in gate is merged to `main` (avoids `Tracking` anti-feature)
- [ ] `expo-notifications` FCM-free flavor exists OR F-Droid team has been pre-warned
      (see `SIZE-OPTIMIZATION.md` section "FCM Flavor")
- [ ] Signing key SHA-256 fingerprint is confirmed in `distribution/SIGNING-KEY-FINGERPRINTS.md`
- [ ] Reproducible build has been tested locally (see `REPRODUCIBLE-BUILD-NOTES.md`)

---

## Step 1 — Prepare the signing key fingerprint

```bash
# Get the colon-separated fingerprint
keytool -list -v \
  -keystore keystores/production-release.jks \
  -storepass <STOREPASS> \
  | grep "SHA256:"
# Example output:
#   SHA256: 0C:25:9D:94:E0:FF:EA:5D:63:19:61:4B:22:9D:4B:6B:DC:22:DE:1F:56:E3:8E:76:94:83:98:D2:DF:6A:A0:99

# Convert to lowercase without colons (AllowedAPKSigningKeys format):
# 0c259d94e0ffea5d6319614b229d4b6bdc22de1f56e38e769483 98d2df6aa099
```

Update `distribution/fdroid-submission/metadata.yml`:
- Replace `<SIGNING_KEY_SHA256_FINGERPRINT_LOWERCASE_NO_COLONS>` with the fingerprint
- Replace `<FIRST_GITHUB_RELEASE_TAG>` with the actual tag (e.g. `v0.2.4`)

---

## Step 2 — Fork fdroiddata

```bash
# On GitLab
# 1. Go to https://gitlab.com/fdroid/fdroiddata
# 2. Fork to your personal GitLab account (not org — fdroid prefers personal forks)
# 3. Clone locally:
git clone https://gitlab.com/<YOUR_GITLAB_USERNAME>/fdroiddata.git
cd fdroiddata
git remote add upstream https://gitlab.com/fdroid/fdroiddata.git
git fetch upstream
git checkout -b add-ai.opencode.mobile upstream/master
```

---

## Step 3 — Add the metadata file

```bash
cp /path/to/opencode-mobile/distribution/fdroid-submission/metadata.yml \
   metadata/ai.opencode.mobile.yml
```

Verify:
- `metadata/ai.opencode.mobile.yml` exists
- `AllowedAPKSigningKeys` has the correct lowercase-no-colons fingerprint
- `commit:` points to a real tag in the GitHub repo
- `versionCode` and `versionName` match the APK attached to the release

---

## Step 4 — Test the build locally (optional but strongly recommended)

F-Droid provides a Docker-based build environment:

```bash
# Install fdroidserver
pip install fdroidserver

# Verify metadata parses cleanly
fdroid readmeta

# Attempt a build (requires Docker + significant time)
fdroid build ai.opencode.mobile:<versionCode>
```

If the build fails, fix `metadata/ai.opencode.mobile.yml` before filing the MR.

---

## Step 5 — File the Merge Request

```bash
git add metadata/ai.opencode.mobile.yml
git commit -m "Add ai.opencode.mobile (OpenCode Mobile)"
git push origin add-ai.opencode.mobile
```

Go to https://gitlab.com/<YOUR_GITLAB_USERNAME>/fdroiddata → open an MR
against `fdroid/fdroiddata:master`.

MR title: `Add ai.opencode.mobile`

MR description template:
```
## New app: OpenCode Mobile

**Package:** ai.opencode.mobile
**License:** MIT
**Category:** Development
**Source:** https://github.com/dzianisv/opencode-mobile

OpenCode Mobile is a free, open-source mobile client for the opencode AI
coding agent (sst/opencode). MIT licensed. Crash reporting opt-in default OFF.

Anti-features: NonFreeNet (user-self-hosted backend may connect to proprietary AI APIs).

Using AllowedAPKSigningKeys path — pre-signed APK from GitHub releases.
Build steps: npm install → expo prebuild → Gradle assembleRelease.
```

---

## Step 6 — Respond to reviewer feedback

- F-Droid maintainers typically review within 2–8 weeks.
- Monitor the MR for comments. Common asks:
  - Build reproducibility evidence
  - Clarification on anti-features
  - Pinning build dependencies to exact versions
  - Removing or stubbing FCM/GMS dependencies

---

## Step 7 — After acceptance

- F-Droid builds from source on their CI. First index update may take 1–2 weeks.
- Add `ai.opencode.mobile` to F-Droid's inclusion notice in `docs/fdroid.md`.
- Update `distribution/strategy.md` status row for F-Droid.
- Notify IzzyOnDroid via the inclusion issue that mainline accepted the app
  (IzzyOnDroid will then auto-delist within their next index rebuild).

---

## Reference

- F-Droid inclusion criteria: https://f-droid.org/en/docs/Inclusion_Policy/
- F-Droid metadata format: https://f-droid.org/en/docs/Build_Metadata_Reference/
- AllowedAPKSigningKeys: https://f-droid.org/en/docs/Reproducible_Builds/
- fdroiddata: https://gitlab.com/fdroid/fdroiddata
