# eas.json — Post-Enrollment Fill-in Guide

Two placeholders in `eas.json` must be filled after Apple Developer Program enrollment is approved.
Do NOT fill them before enrollment — the values don't exist yet.

---

## Placeholder: `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`

**What it is**: The numeric App ID assigned when you create the app record in App Store Connect.
Also called "Apple ID" of the app (not your Apple ID account — confusingly named).
Example value: `6478291034`

**Where to find it** (after enrollment + app creation):

1. Open https://appstoreconnect.apple.com/ and sign in with `support@agentlabs.cc`
2. Click **My Apps** in the top navigation
3. Click on **OpenCode** (the app you created)
4. In the left sidebar click **App Information** under the General section
5. Scroll down to the **General Information** section
6. Copy the value next to **Apple ID** — this is your `ascAppId`

**Replace in `eas.json`**:
```json
"ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID"
```
→
```json
"ascAppId": "6478291034"   // use your actual number
```

---

## Placeholder: `REPLACE_WITH_APPLE_TEAM_ID`

**What it is**: Your Apple Developer Team ID — a 10-character alphanumeric string.
Example value: `ABC1234DEF`

**Where to find it** (after enrollment):

1. Open https://developer.apple.com/account/ and sign in with `support@agentlabs.cc`
2. Click your name / account icon in the top right → **Membership details**
3. Your **Team ID** is listed under the team name

Alternatively, in App Store Connect:
1. Open https://appstoreconnect.apple.com/
2. Click your profile icon (top right) → **View Profile**
3. The Team ID is shown in the Developer Profile section

**Replace in `eas.json`**:
```json
"appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"
```
→
```json
"appleTeamId": "ABC1234DEF"   // use your actual Team ID
```

---

## Other fields already set

| Field | Value | Notes |
|---|---|---|
| `appleId` | `support@agentlabs.cc` | The Apple ID used for App Store Connect login — update if different |
| `distribution` (production ios) | `store` | Correct for App Store / TestFlight submissions |
| `buildType` (production android) | `app-bundle` | Correct for Play Store AAB submissions |
| `autoIncrement` | `buildNumber` | EAS increments the iOS build number remotely for every production build |
| `appVersionSource` | `remote` | EAS is the source of truth for store build numbers |
| `cli.version` | `>= 21.0.0` | CI installs the exact supported release, `eas-cli@21.0.0` |

---

## After filling in the placeholders

1. Run `eas init` once to create/link the Expo project.
2. Copy the generated `extra.eas.projectId` UUID and add it as the GitHub Actions repository variable `EAS_PROJECT_ID`. The release workflow injects it into `app.json` only on the runner.
3. Commit the updated `eas.json` to the repo.
4. Add the `EXPO_TOKEN` and App Store Connect API GitHub Actions secrets (see `.github/workflows/publish-app-store.yml` for the exact list).
5. Publish a GitHub Release for the version tag (or manually dispatch the App Store workflow).
6. The release event triggers CI to build the IPA via EAS and submit that exact build to TestFlight.

---

*This file is safe to commit. It contains no secrets — only navigation instructions.*
