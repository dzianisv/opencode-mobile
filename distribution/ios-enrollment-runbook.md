# Apple Developer Program Enrollment Runbook — VIBE TECHNOLOGIES, LLC

Pre-filled guide for enrolling as an organization. Do NOT proceed until you have $99 USD available on the Apple ID credit card, and you have the governor's contact information ready for the verification call.

Reference: https://developer.apple.com/programs/enroll/

---

## Pre-filled Entity Data

| Field | Value | Source |
|---|---|---|
| Legal Entity Name | VIBE TECHNOLOGIES, LLC | WA LLC registration |
| D-U-N-S Number | **142059652** | Already retrieved |
| UBI / EIN | 606 003 933 | WA Secretary of State |
| Legal Address | 519 S Henderson St, Seattle WA 98108-4522, USA | WA LLC registration |
| Legal Entity Type | LLC (Limited Liability Company) | |
| Primary Contact / Authorized Agent | Dzianis Vashchuk | Governor of LLC |
| Primary Contact Phone | (use a number reachable for Apple's verification call) | |
| Primary Contact Email | support@vibebrowser.app | |
| Website | https://www.vibebrowser.app/ | |

---

## Apple ID to Use

**DECIDED 2026-05-24**: Use `support@vibebrowser.app` — mailbox already exists (was verified during Play Console signup, confirmed receiving Google verification codes).

- If no Apple ID exists yet for `support@vibebrowser.app`: create at https://appleid.apple.com/account
- 2FA: enable immediately, trusted phone = Dzianis's mobile
- Bitwarden item naming: store as `APPLE_ID_VIBE_TECHNOLOGIES` (email + password + 2FA recovery codes)

---

## Step-by-Step Enrollment

### Step 1 — Prepare

- [ ] Verify D-U-N-S 142059652 is current at https://developer.apple.com/enroll/duns-lookup/ (takes 14 days to propagate if recently created; ours was already retrieved so should be active)
- [ ] Ensure the Apple ID email mailbox is active and accessible
- [ ] Have a credit card ready ($99 USD charge)
- [ ] Ensure Dzianis Vashchuk is available for a verification phone call during business hours (Apple calls the listed phone number for organization enrollment)

### Step 2 — Start Enrollment

1. Go to https://developer.apple.com/programs/enroll/
2. Click **Start Your Enrollment**
3. Sign in with the Apple ID you chose above (or create one)
4. Select **Company / Organization**

### Step 3 — Enter Organization Details

Fill as follows:

| Prompt | Enter |
|---|---|
| Legal Entity Name | `VIBE TECHNOLOGIES, LLC` |
| D-U-N-S Number | `142059652` |
| Headquarters Address (Line 1) | `519 S Henderson St` |
| City | `Seattle` |
| State | `WA` |
| ZIP | `98108` |
| Country | `United States` |
| Phone | (Dzianis's direct mobile — Apple calls this) |
| Website | `https://www.vibebrowser.app/` |

### Step 4 — Verify Your Authority

Apple asks you to confirm you are authorized to bind the organization to the Apple Developer Program Agreement. As governor/managing member of the LLC, Dzianis Vashchuk has this authority.

Select: "I am authorized to sign legal agreements on behalf of this organization."

### Step 5 — Apple Review & Verification Call

- Apple's team will verify the D-U-N-S number against Dun & Bradstreet records.
- **Expect a phone call** to the number entered above within 2–5 business days.
- The caller will confirm the legal entity name, address, and that you are authorized to enroll.
- Answer in English; have the LLC registration handy (UBI 606 003 933) in case they ask for additional verification.

**Timeline**: 2–7 business days for verification. Apple can take up to 14 days in edge cases.

### Step 6 — Pay

After verification is approved:
- Apple charges **$99 USD/year** to the credit card on the Apple ID.
- Enrollment renews annually. Set a calendar reminder.
- Source: https://developer.apple.com/support/enrollment/ (pricing as of 2025 — verify current pricing at enrollment time)

### Step 7 — Accept Agreements

After payment:
1. Sign in to https://developer.apple.com/account/
2. Accept the Apple Developer Program License Agreement
3. Accept the Paid Applications Agreement (required to distribute free apps too)

### Step 8 — Set Up App Store Connect

1. Go to https://appstoreconnect.apple.com/
2. Sign in with the same Apple ID
3. Fill in banking info even for a free app (required to publish):
   - US bank account (ACH/routing number)
   - Tax information (W-9 for US entities — EIN 606 003 933)
4. Accept the Paid Applications Schedule even if distributing free (Apple requires this)

---

## What Can Be Done in Parallel (Before Enrollment Approval)

While waiting for Apple's verification call and approval:

- [x] Prepare App Store listing copy → `distribution/app-store-listing.md`
- [x] Write CI workflow (draft) → `.github/workflows/publish-app-store.yml`
- [ ] Create app icon 1024×1024 PNG
- [ ] Capture iPhone screenshots (use iOS Simulator in Xcode on any Mac)
- [ ] Capture iPad screenshots
- [ ] Write/publish privacy policy at https://www.vibebrowser.app/opencode-mobile/privacy
- [ ] Set up EAS account at https://expo.dev/ (free tier, log in with Expo account)
- [ ] Add iOS config patches to `app.json` (done in this PR)
- [ ] Run `npx expo prebuild --platform ios` on a Mac to validate the Xcode project
- [ ] Prepare the Mac build worker (macbook13-pro at 100.68.120.26) as GitHub self-hosted runner

---

## After Enrollment Approval — App Store Connect Setup

1. Create a new App in App Store Connect:
   - Platform: iOS
   - Name: `OpenCode`
   - Primary Language: English (U.S.)
   - Bundle ID: `ai.opencode.mobile` — register this explicit App ID first at https://developer.apple.com/account/resources/identifiers/
   - SKU: `ai.opencode.mobile` (can match bundle ID)

2. Configure App ID capabilities needed:
   - Push Notifications (for `expo-notifications`)
   - Associated Domains (if deep linking via `opencode://` is used externally — not strictly needed for current app)

3. Create App Store Connect API Key for CI:
   - Go to https://appstoreconnect.apple.com/access/api
   - Create key with **App Manager** role
   - Download the `.p8` file (can only be downloaded once!)
   - Note: Key ID and Issuer ID
   - Base64-encode the .p8 and store in GitHub secret `APPLE_APP_STORE_CONNECT_API_KEY`

4. Create an internal TestFlight group and add yourself as tester

---

## Cost Summary

| Item | Cost | Frequency |
|---|---|---|
| Apple Developer Program | $99 USD | Per year (auto-renews) |
| EAS Build (free tier) | $0 | Up to 30 builds/month for iOS |
| EAS Build (production tier) | $19/month | Unlimited builds, priority queue |
| macOS GitHub runner | ~$0.08/min × ~25 min/build ≈ $2/build | Per build |

**Recommendation**: Start with EAS Build free tier for first few releases. Upgrade to production tier ($19/month) if build queue times become a problem. See task 2 analysis in the final report.

---

## Timeline Estimate

| Milestone | Estimated Time from Starting Enrollment |
|---|---|
| Enrollment form submitted | Day 0 |
| Apple verification call | Day 2–5 |
| Enrollment approved + payment | Day 3–7 |
| Banking/tax info set up | Day 7–8 |
| App ID + provisioning profile created | Day 8 |
| First TestFlight build submitted via CI | Day 9–10 |
| TestFlight internal testers can install | Day 9–10 (no review for internal) |
| App Store production submission | Day 10–12 |
| Apple review complete + production live | Day 12–14 (review typically 24–48 hours) |
