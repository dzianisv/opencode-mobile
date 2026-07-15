# Apple App Store — opencode-mobile

Operational doc for shipping `cc.agentlabs.opencode` to Apple App Store under VIBE TECHNOLOGIES, LLC.

For full company facts (D-U-N-S, address, governor) see `~/.agents/skills/vibetechnologies-llc/SKILL.md`.

---

## Account state

The Apple account state below was last recorded on 2026-05-24. Re-verify it in the
Apple Developer portal before running the release workflow; this Linux runner has no
Apple or EAS credentials and cannot confirm enrollment status.

| Field | Value |
|---|---|
| Apple ID email | `support@agentlabs.cc` (per decision 2026-05-24) |
| Apple Developer Program | ⚠️ Last recorded as not enrolled; verify current status |
| D-U-N-S (for org enrollment) | 142059652 |
| Enrollment fee | $99/year |
| Identity verification call | ⚠️ Verify current status |
| App Store Connect record | ⚠️ No app ID is configured in `eas.json` |
| TestFlight | ⏸ No verified build yet |
| App Store production | ⏸ After TestFlight + Apple review |

### Bundle identity

| Field | Value |
|---|---|
| Bundle identifier | `cc.agentlabs.opencode` (same as Android) |
| Apple Team ID | ⏸ assigned at enrollment |
| App Store Connect App ID | ⏸ assigned on first app creation |

---

## Export Compliance

OpenCode Mobile uses only standard HTTPS/TLS provided by iOS networking APIs (via React Native's `fetch` and the underlying `URLSession`). It does NOT implement any custom cryptographic algorithms, key exchange protocols, or cipher suites.

**Answers to give in App Store Connect > App Information > Export Compliance:**

| Question | Answer |
|---|---|
| Does your app use encryption? | Yes (standard OS-provided HTTPS) |
| Does the app qualify for the HTTPS exemption? | Yes |
| Is the encryption exempt from EAR? | Yes — qualifies under ECCN 5D992 exemption (software using standard HTTPS, not modifying encryption) |

**In practice, App Store Connect asks:**
"Does your app use encryption other than what's provided by Apple's operating system?"
→ **Answer: No**

This falls under the exemption described at:
https://developer.apple.com/documentation/security/complying_with_encryption_export_regulations

Because the answer is "No", no ERN (Encryption Registration Number) is required and no export compliance documentation needs to be filed with the US Bureau of Industry and Security (BIS).

**`ITSAppUsesNonExemptEncryption: false` is already set in `app.json` `ios.infoPlist`** — this suppresses the App Store Connect encryption question on every subsequent build submission automatically. (Added 2026-05-24.)

---

## What's already done

1. ✅ iOS section of `app.json` patched:
   - `ios.buildNumber`: "1" (initial value; EAS manages production build numbers remotely)
   - `ios.entitlements.aps-environment`: "production" (push notifications)
   - `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads`: true (required — connects to user self-hosted opencode servers over HTTP on LAN)
   - Usage strings: NSFaceIDUsageDescription, NSSpeechRecognitionUsageDescription, NSMicrophoneUsageDescription, NSPhotoLibraryUsageDescription, NSCameraUsageDescription, NSLocalNetworkUsageDescription
   - Plugin registrations completed for `expo-notifications`, `expo-image-picker`, `expo-speech-recognition` (were missing — would have caused native iOS setup to silently skip)
2. ✅ EAS Build config: `eas.json` with development/preview/production profiles (2 placeholders for App ID + Team ID)
3. ✅ Build strategy chosen: **EAS Build** (Expo cloud, free tier 30 builds/mo, managed certs, EAS Submit handles TestFlight upload)
4. ✅ CI workflows: `.github/workflows/ios-ci.yml` validates unsigned Simulator builds; `.github/workflows/publish-app-store.yml` fails fast until Apple/EAS setup is complete
5. ✅ Listing copy drafted: `distribution/app-store-listing.md`
6. ✅ Enrollment runbook: `distribution/ios-enrollment-runbook.md` (pre-filled with all VIBE TECHNOLOGIES, LLC fields)
7. ✅ Release notes scaffold: `distribution/whatsnew-ios/release-notes-en-US.txt`

---

## What's left to do — eligibility checklist

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Sign in / create Apple ID for `support@agentlabs.cc` w/ 2FA | User | 🔴 user action required |
| 2 | Enroll in Apple Developer Program ($99) | User | 🔴 user action required |
| 3 | Pass Apple verification call | User | 🔴 user action required |
| 4 | App icon — 1024×1024 PNG, opaque (no alpha) | ✅ Done | `assets/icon.png` is RGB with no alpha channel |
| 5 | iPhone screenshots 6.7" (1290×2796) + 6.5" (1242×2688) | Mac | 🔴 Placeholder mockups exist; recapture the current app in Simulator |
| 6 | iPad screenshots 12.9" (2048×2732) | Mac | 🔴 Placeholder mockups exist; recapture the current app in Simulator |
| 7 | Privacy policy — live at https://dzianisv.github.io/opencode-mobile/privacy/ | ✅ done | Live & verified (HTTP 200) on gh-pages. Content handled by Android agent (`distribution/privacy-policy.{md,html}`). iOS-specific ATT / nutrition label addendum written in `distribution/app-store-listing.md`. |
| 8 | Privacy nutrition label (App Tracking + Data Collection) | ✅ Done | Updated in `distribution/app-store-listing.md` — ATT explicitly noted (not used), Sentry opt-in status documented |
| 9 | Export compliance | ✅ Done | `ITSAppUsesNonExemptEncryption: false` added to `app.json`. Answers + rationale in this doc (see Export Compliance section above) and `distribution/app-store-listing.md`. |
| 10 | ATS justification in App Review notes | ✅ Done | Full justification text in `distribution/app-store-listing.md` under "App Review Notes — ATS Justification" |
| 11 | Reviewer test instructions | ✅ Done | Updated with correct command (`opencode serve --hostname 0.0.0.0`) in `distribution/app-store-listing.md` |
| 12 | GitHub variable `EAS_PROJECT_ID`; secrets: `EXPO_TOKEN`, `APPLE_APP_STORE_CONNECT_API_KEY_ID`, `APPLE_APP_STORE_CONNECT_ISSUER_ID`, `APPLE_APP_STORE_CONNECT_API_KEY` (base64 .p8) | User | 🟡 post-enrollment — run `eas init`, then see `.github/workflows/publish-app-store.yml` |
| 13 | Update `eas.json` placeholders: `ascAppId` + `appleTeamId` | User | 🟡 post-enrollment — see `eas.json.README.md` for click paths |
| 14 | CI workflow validated | CI | 🟡 Linux checks pass; PR must prove the macOS Simulator build |
| 15 | TestFlight release notes | ✅ Done | `distribution/whatsnew-ios/release-notes-en-US.txt` — polished, 1658 chars (limit 4000) |

---

## Publishing process (after enrollment + assets ready)

1. (manual) Sign in to App Store Connect, create app with bundle id `cc.agentlabs.opencode`.
2. (manual) Generate App Store Connect API key (App Manager role) → download `.p8` → base64 encode → add as GitHub secret.
3. (manual) Update `eas.json` placeholders (Team ID, ASC App ID).
4. (manual) `eas login` + `eas init` + `eas build:configure`; add the generated project UUID as repository variable `EAS_PROJECT_ID`.
5. (automated) Publish a GitHub Release for the version tag → CI calls EAS Build → EAS Submit → IPA lands in TestFlight.
6. (manual, first time) Add internal testers in App Store Connect → distribute via TestFlight.
7. (manual) After internal testing OK → submit for App Store review (production).
8. Apple review typically 24-48h. 90% of submissions reviewed within 24h.

---

## Build strategy comparison (chose EAS Build)

| Factor | EAS Build ✅ | GitHub macOS runner | Mac self-hosted |
|---|---|---|---|
| macOS infra | none | none (GitHub-hosted) | macbook13-pro via Tailscale |
| Cert mgmt | automatic | manual | manual |
| Setup time | ~1h | ~4h | ~2h + manual cert work |
| Cost / build | $0 (free tier 30/mo) | ~$2 (~25min × $0.08/min) | $0 compute, uptime risk |
| First-build reliability | high (Expo SLA) | high | depends on Mac being on |

Upgrade to EAS $19/mo only if free-tier queue (10-30 min wait) becomes a problem.

---

## Timeline + cost (from research)

| Milestone | ETA from start | Cost |
|---|---|---|
| Apple enrollment approved | day 3-7 | $99 |
| First EAS build + TestFlight upload | day 8-10 | $0 |
| Internal TestFlight install | day 8-10 (no review) | $0 |
| App Store production submission | day 10-12 | $0 |
| Production live (after Apple review) | day 12-14 (24-48h) | $0 |
| **Total to TestFlight** | **~1-2 weeks** | **$99** |
| **Total to production** | **~2 weeks** | **$99** |

---

## Files in repo

- `app.json` — iOS config (patched 2026-05-24)
- `eas.json` — EAS build profiles (2 placeholders)
- `.github/workflows/ios-ci.yml` — PR/main unsigned iOS Simulator build gate
- `.github/workflows/publish-app-store.yml` — fail-fast TestFlight release CI
- `distribution/app-store-listing.md` — listing copy + answers
- `distribution/ios-enrollment-runbook.md` — enrollment runbook
- `distribution/whatsnew-ios/release-notes-en-US.txt` — release notes
- `distribution/strategy.md` — broader strategy (cross-platform)

---

## Reference

- Apple Developer enroll: https://developer.apple.com/programs/enroll/
- D-U-N-S lookup: https://developer.apple.com/enroll/duns-lookup/
- Apple ID create: https://appleid.apple.com/account
- App Store Connect: https://appstoreconnect.apple.com/
- Review guidelines: https://developer.apple.com/app-store/review/guidelines/
- ATS docs: https://developer.apple.com/documentation/security/preventing_insecure_network_connections
- TestFlight: https://developer.apple.com/testflight/
- EAS Build docs: https://docs.expo.dev/build/introduction/
- EAS Submit docs: https://docs.expo.dev/submit/introduction/
