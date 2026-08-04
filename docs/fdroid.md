# F-Droid + IzzyOnDroid — opencode-mobile

Operational doc for distributing `cc.agentlabs.opencode` via F-Droid (mainline)
and IzzyOnDroid under VIBE TECHNOLOGIES, LLC.

This is the OSS-first distribution track, complementary to Google Play.
All channels share the same package id and signing key.

---

## Account state

Unlike Google Play, F-Droid and IzzyOnDroid require no developer account.

| Channel | Account needed | Status |
|---------|---------------|--------|
| F-Droid mainline | None — community-built; MR to fdroiddata | Submission packet ready; MR not yet filed |
| IzzyOnDroid | Codeberg account for filing issue | Submission packet ready; issue not yet filed |

---

## What's done (this session)

1. Fastlane metadata scaffold created: `fastlane/metadata/android/en-US/`
   - `title.txt`, `short_description.txt`, `full_description.txt` — F-Droid-audience copy
   - `changelogs/1.txt` — initial release notes for versionCode 1
   - `images/icon.png`, `images/featureGraphic.png` — copied from play-graphics
   - `images/phoneScreenshots/{01,02,03}.png` — copied from play-graphics

2. F-Droid mainline submission packet: `distribution/fdroid-submission/`
   - `metadata.yml` — ready to PR into fdroiddata (placeholders for release tag + key fingerprint)
   - `SUBMISSION-CHECKLIST.md` — full step-by-step MR filing guide
   - `REPRODUCIBLE-BUILD-NOTES.md` — reproducibility audit (2 issues found, documented)
   - `SIZE-OPTIMIZATION.md` — APK size analysis + ABI splits + FCM flavor doc

3. IzzyOnDroid submission packet: `distribution/izzyondroid-submission/`
   - `INCLUSION-REQUEST.md` — ready-to-paste Codeberg issue body (1 placeholder)
   - `SUBMISSION-CHECKLIST.md` — step-by-step filing guide

4. Signing key fingerprint documented: `distribution/SIGNING-KEY-FINGERPRINTS.md`
   - SHA-256: `0C:25:9D:94:...:DF:6A:A0:99` (full value in file)
   - Pasted into IzzyOnDroid request; F-Droid metadata has placeholder pending
     lowercase-no-colons conversion and confirmation

5. Sentry opt-in gate already implemented (opt-in, default OFF) — `Tracking`
   anti-feature is avoided.

6. `expo-notifications` audited — local-only usage confirmed; no FCM push tokens
   retrieved. NonFreeNet anti-feature acknowledged; NonFreeDep not triggered.

---

## What's left to do

| # | Item | Blocking? | Owner |
|---|------|-----------|-------|
| 1 | Add `.kotlin/` to `android/.gitignore` + untrack log files | F-Droid mainline | Agent (trivial) |
| 2 | ~~Attach signed universal APK to first GitHub release tag~~ — DONE: `v0.4.12` release carries `app-release-fdroid.apk` (2026-08-03 audit) | — | — |
| 3 | File IzzyOnDroid inclusion issue on Codeberg | IzzyOnDroid | User or Agent |
| 4 | ~~Update `metadata.yml` with actual release tag + key fingerprint~~ — DONE: refreshed for `v0.4.12`/`39` (tag `73852f3a`); fingerprint already filled. Recipe still needs a real `fdroid build` validation | F-Droid mainline | Agent |
| 5 | File MR against fdroiddata | F-Droid mainline | User or Agent |
| 6 | Run `expo prebuild` twice, compare output (reproducibility check) | F-Droid mainline | Agent |
| 7 | Measure arm64-v8a APK size with bundletool | Nice-to-have | Agent |

Item 1 (kotlin log untrack) should be done before the F-Droid MR.
Items 3 and 5 should be done after the first Play Store release is live.

---

## Submission process

### IzzyOnDroid (fastest — 1–3 days)

1. Attach signed universal APK to a GitHub release tag.
2. File Codeberg issue using `distribution/izzyondroid-submission/INCLUSION-REQUEST.md`.
3. Full guide: `distribution/izzyondroid-submission/SUBMISSION-CHECKLIST.md`.

### F-Droid mainline (4–12 weeks)

1. Complete prerequisites (see `distribution/fdroid-submission/SUBMISSION-CHECKLIST.md`).
2. Fork fdroiddata on GitLab.
3. Create `metadata/cc.agentlabs.opencode.yml` from `distribution/fdroid-submission/metadata.yml`.
4. File MR. Respond to reviewer feedback.
5. Full guide: `distribution/fdroid-submission/SUBMISSION-CHECKLIST.md`.

---

## Timeline

| Milestone | When |
|-----------|------|
| F-Droid + IzzyOnDroid submission packets ready | 2026-05-24 (done) |
| First Google Play Internal release | After identity verification |
| IzzyOnDroid issue filed | After first signed APK on GitHub releases |
| IzzyOnDroid inclusion | 1–3 days after issue |
| F-Droid MR filed | After first Play release + reproducibility fixes |
| F-Droid mainline acceptance | 4–12 weeks after MR |
| IzzyOnDroid auto-delist | After F-Droid mainline acceptance |

---

## Files in this repo

```
fastlane/
└── metadata/android/en-US/           # F-Droid auto-pull metadata
    ├── title.txt
    ├── short_description.txt
    ├── full_description.txt
    ├── changelogs/1.txt
    └── images/
        ├── icon.png
        ├── featureGraphic.png
        └── phoneScreenshots/{01,02,03}.png

distribution/
├── SIGNING-KEY-FINGERPRINTS.md       # SHA-256 key fingerprint reference
├── fdroid-submission/
│   ├── metadata.yml                  # fdroiddata MR content
│   ├── SUBMISSION-CHECKLIST.md       # F-Droid MR step-by-step
│   ├── REPRODUCIBLE-BUILD-NOTES.md   # Reproducibility audit
│   └── SIZE-OPTIMIZATION.md          # APK size + ABI splits doc
└── izzyondroid-submission/
    ├── INCLUSION-REQUEST.md          # Codeberg issue body
    └── SUBMISSION-CHECKLIST.md       # IzzyOnDroid step-by-step
```

---

## Reference

- F-Droid inclusion policy: https://f-droid.org/en/docs/Inclusion_Policy/
- F-Droid metadata format: https://f-droid.org/en/docs/Build_Metadata_Reference/
- F-Droid reproducible builds: https://f-droid.org/en/docs/Reproducible_Builds/
- fdroiddata (where MR goes): https://gitlab.com/fdroid/fdroiddata
- IzzyOnDroid policy: https://apt.izzysoft.de/fdroid/index/info
- IzzyOnDroid issues (where inclusion request goes): https://codeberg.org/IzzyOnDroid/repodata/issues
- App on IzzyOnDroid (after acceptance): https://apt.izzysoft.de/fdroid/index/apk/cc.agentlabs.opencode
- Signing key fingerprints: `distribution/SIGNING-KEY-FINGERPRINTS.md`
- Strategy + full channel overview: `distribution/strategy.md`
- Play Store operational doc: `docs/playstore.md`
