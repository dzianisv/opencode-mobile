# Reproducible Build Notes — ai.opencode.mobile

F-Droid's modern `AllowedAPKSigningKeys` path requires that F-Droid's build
server can compile the same APK and arrive at a binary that matches the
pre-signed APK we supply via GitHub releases. Any non-determinism in the build
will break this verification.

---

## Issues found (2026-05-24)

### 1. Kotlin error log files tracked in git — MEDIUM

**Files committed:**
```
android/.kotlin/errors/errors-1779181311003.log
android/.kotlin/errors/errors-1779181311094.log
```

**Problem:** These log files contain absolute host paths:
```
While analysing /home/azureuser/workspace/opencode-mobile/node_modules/...
```

When F-Droid builds from source on their server, these log files will not
exist (or will contain different paths). Since they are tracked in git and
checked out during the build, they could cause differing build outputs
if the Kotlin compiler reads or embeds them. More practically, they make
the source tree non-portable — a smell that will draw reviewer attention.

**Recommended fix:** Add `.kotlin/` to `android/.gitignore`:
```
# android/.gitignore (add this line)
.kotlin/
```

Then remove the tracked files:
```bash
git rm -r --cached android/.kotlin/
git commit -m "chore: untrack kotlin error log files from android/.kotlin/"
```

This is a trivial fix. Do it before filing the F-Droid MR.

---

### 2. android/ directory tracked in git — LOW (expected but notable)

`expo prebuild` regenerates `android/` from `app.json` and `package.json`.
F-Droid's build metadata uses `npx expo prebuild` as a `prebuild:` step,
which means F-Droid rebuilds `android/` from scratch on their server.

The tracked `android/app/build.gradle` and other generated files must match
what `expo prebuild` produces. If the Expo SDK version drifts between what is
committed and what npm installs, the build will fail.

**Mitigation already in place:** `package-lock.json` is committed, which pins
all npm dependency versions. The F-Droid metadata `Builds:` step uses
`npm install --legacy-peer-deps` which respects `package-lock.json`.

**Residual risk:** If `expo prebuild` is non-deterministic (e.g., writes the
current date/time into generated files), subsequent runs will produce different
outputs. This is unlikely but should be verified by running prebuild twice and
comparing outputs:
```bash
npx expo prebuild --platform android --non-interactive --clean
git diff android/
```

---

### 3. Hermes bytecode embedding — LOW

The React Native Hermes engine compiles the JavaScript bundle to Hermes bytecode
at build time. The bytecode format is versioned but should be deterministic for
the same JS source + Hermes version. The Hermes version is pinned via
`react-native` in `package-lock.json`, so this is low risk.

---

### 4. PNG crunching — LOW

`build.gradle` has `crunchPngs true` for release builds. PNG crunching via aapt2
is generally deterministic but can vary across aapt2 versions. F-Droid's build
environment may use a different Android build tools version.

**Mitigation:** Pin `buildToolsVersion` in `android/build.gradle` explicitly
rather than relying on the Expo-supplied default. Check via:
```bash
grep buildToolsVersion android/build.gradle android/app/build.gradle
```

---

### 5. No hardcoded timestamps found — PASS

Grepped `android/` for `System.currentTimeMillis`, `new Date()`, `buildTime`,
`BUILD_DATE`, `UUID.randomUUID()` — no results. This is the most common
reproducibility killer and is clean here.

---

### 6. No absolute host paths in build files — PASS

Grepped `android/` `*.gradle` and `*.properties` for `/home/`, `/Users/`,
`C:\` — no results in build config files.

---

## Priority action items before F-Droid MR

| Priority | Item | Effort |
|----------|------|--------|
| HIGH | Add `.kotlin/` to `android/.gitignore` and untrack log files | 5 min |
| MEDIUM | Run `expo prebuild` twice, compare output with `git diff` | 15 min |
| MEDIUM | Pin `buildToolsVersion` explicitly in `android/build.gradle` | 5 min |
| LOW | Verify Hermes bytecode is deterministic (compare two builds) | 30 min |
| LOW | Test full reproducible build using F-Droid's Docker build env | Hours |

---

## How to test reproducible builds

F-Droid provides a reproducible build test tool:

```bash
# Install fdroidserver
pip install fdroidserver

# Test reproducibility against a released APK
fdroid signatures path/to/app-release.apk

# Full build test
fdroid build ai.opencode.mobile:<versionCode> --verbose
```

See https://f-droid.org/en/docs/Reproducible_Builds/ for the full guide.
