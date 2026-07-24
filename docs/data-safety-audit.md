# Data Safety Audit — Email Address (Play rejection versionCode 142)

App: **OpenCode: AI Coding Agent** · package `cc.agentlabs.opencode`
Rejection: Google Play rejected update **versionCode 142** for *"Invalid Data safety form"* — an **Email Address** transmitted off-device that is not declared in the Data safety form.

---

## 1. Which commit == versionCode 142

**versionCode is assigned remotely by EAS, not committed in git.** `eas.json` sets:

```json
"cli": { "appVersionSource": "remote" }
```

With `appVersionSource: "remote"`, Expo/EAS auto-increments and owns the Android `versionCode` on its build servers. The values committed in the tree (`android/app/build.gradle` → `versionCode 34`, `app.json` → `versionCode 37`) are **stale and ignored for production app-bundle builds**. `git log`/`git tag` top out at versionCode 39 (tag `v0.4.12`, SHA `3ac7eb7`); **142 never appears anywhere in git history**, tags, `app.json`, `app.config.*`, or `eas.json`. EAS CLI is not installed on this machine, so the exact build→SHA map could not be pulled from `eas build:list`.

**Consequence for this audit:** email egress is a *property of the app source*, not of a specific `versionCode`. It does not vary between builds around 142. The audit was therefore performed at the authoritative current source: **`origin/main` @ `6c103ac`** (fetched fresh). This is the code that produces the production bundle and is the correct target for the Data-safety declaration.

Relevant already-merged history:
- `d6e24e9` — *fix(compliance): disclose email collection in Play Data Safety* (PR #146, closes #143). This is the prior fix for **this same rejection** (Play rejected `cc.agentlabs.opencode` on 2026-07-22 for undisclosed Email Address). It updated the listing/privacy docs to declare the waitlist email → Brevo. versionCode 142 is the build that triggered/carried this rejection cycle.

> Audit revision: **`origin/main` @ 6c103ac** (read via `git show <rev>:<path>`; working tree kept clean).

---

## 2. Email egress paths found

Grepped the entire app+src tree at `origin/main` for `email|setUser|identify|posthog|amplitude|analytics|sentry|revenuecat|Purchases.logIn|segment` and read every hit. **Exactly one** path sends an email off-device.

| Source (file:line / SDK) | Data type | Where it goes | Purpose | Optional or Required |
|---|---|---|---|---|
| `app/connection/add.tsx:217` → `src/lib/waitlist.ts:submitWaitlistSignup` (POST `https://opencode.agentlabs.cc/api/beta-signup`) | Email Address | First-party beta-signup API → **Brevo** (email marketing/CRM) | "OpenCode Connect" waitlist signup (account/contact for a future hosted product) | **Optional** — user only types an email into a dismissible waitlist card and taps submit |
| `app/connection/add.tsx:227` → `src/lib/waitlist.ts:buildWaitlistMailtoUrl` (mailto fallback) | Email Address | `mailto:support@agentlabs.cc` (user's own mail client) | Fallback for the same waitlist when the API is unreachable | Optional — user-initiated send from their own mail app; not a developer network collection |

### Paths that do NOT transmit email (ruled out)
- **Sentry** (`src/lib/sentry.ts`): `sendDefaultPii: false`; no `Sentry.setUser`/email anywhere; `beforeSend` → `scrubEvent` and `redactObject` strip `url/host/hostname/authorization/token/password/username/...`; console breadcrumbs dropped. **No email, no PII.** Gated behind first-launch consent (`TelemetryConsentModal`).
- **PostHog** (`src/lib/analytics.ts`): self-instantiated, no autocapture, **no `identify()`/`email`/`setUser`**; random anonymous distinct ID + coarse event props only. Gated behind the same consent.
- **Connection `username`** (`src/lib/auth.ts`): a Basic-auth username for the user's **own** self-hosted OpenCode server (defaults to `"opencode"`). Sent only to the host the user typed, never to a developer/third-party endpoint. Not an email, not developer-collected PII.
- **No** RevenueCat / `Purchases.logIn`, **no** Firebase Auth / `signInWith*`, **no** Amplitude/Segment, **no** other `fetch`/POST body containing an email.

**What Play most likely detected on 142:** the waitlist `POST … {email} → Brevo` (the only real off-device email), which was undeclared at the time. (Not Sentry/PostHog auto-capture — those carry no email.)

---

## 3. Exact Play Console Data safety answers — Email Address

Data type: **Personal info → Email address**

- **Collected?** **Yes** (the app sends it off-device to the developer's server / Brevo).
- **Shared?** **Yes** — shared with **Brevo** (Sendinblue), a third-party CRM/email processor. (Play "shared" = transferred to a third party.)
- **Processed ephemerally?** **No** — Brevo persists it on a contact list.
- **Required or optional?** **Optional** — the user chooses to enter an email in the waitlist card; the app is fully usable without it.
- **Purposes** (check exactly these Play boxes):
  - ✅ **Account management** (waitlist / future-product account)
  - ✅ **Developer communications** (product/waitlist updates via Brevo)
  - ⬜ App functionality — *not* required for the app to work
  - ⬜ Analytics · ⬜ Fraud prevention/security/compliance · ⬜ Advertising/marketing · ⬜ Personalization
  - *(If Brevo is used to send promotional emails, additionally check **Advertising or marketing**. Only check it if that is actually true.)*
- **Encrypted in transit?** **Yes** — HTTPS (`https://opencode.agentlabs.cc/...`).
- **Deletion mechanism?** **Yes** — user can request deletion by emailing `support@agentlabs.cc`; must be documented in the privacy policy (already added in §3c / third-party-services of `distribution/privacy-policy.md` via PR #146).

---

## 4. Recommendation — declare vs remove (per source)

| Source | Recommendation | Why |
|---|---|---|
| **Waitlist → Brevo** (`waitlist.ts`) | **DECLARE** (Email = Collected + Shared/Brevo, Optional, Account management + Developer communications) | This is an intentional, user-initiated, optional feature with a real business purpose. Declaring it is correct and low-risk. PR #146 already wrote the matching privacy-policy + listing copy; the fix is simply to make the **Play Console Data safety form** match §3 above and resubmit. |
| Sentry / PostHog / auth username | **No declaration needed for Email** | No email leaves the device via these; already handled correctly. |

**Headline recommendation: DECLARE the email (do not remove the waitlist).** The single real egress is an optional, opt-in waitlist that forwards email to Brevo for account/communications — a legitimate, disclosed use. Removing it would delete a working growth feature for no compliance benefit. Fill the Play Console Data safety form for **Email Address** exactly as in §3 (Collected: yes; Shared: yes → Brevo; Optional; Purposes: Account management + Developer communications; Encrypted in transit: yes; deletion via support@agentlabs.cc) and resubmit.

*Optional hardening (future PR, not made here):* if the waitlist is not a priority, an alternative is to **remove** the API POST and keep only the `mailto:` fallback (`buildWaitlistMailtoUrl`) — a user-initiated send from their own mail client is not a developer network collection, which would let you answer Email = **Not collected**. This is a product decision, not a compliance requirement; declaring is the cleaner, recommended path.

---

## Appendix — how the audit was run

```
git fetch origin --tags --prune
git grep -n -i -E "email|setUser|identify|posthog|amplitude|analytics|sentry|revenuecat|Purchases.logIn|segment" origin/main -- 'src/**' 'app/**' '*.ts' '*.tsx' '*.js'
git show origin/main:src/lib/waitlist.ts   # confirmed POST → opencode.agentlabs.cc/api/beta-signup → Brevo
git show origin/main:src/lib/sentry.ts     # sendDefaultPii:false, scrubEvent, no setUser/email
git show origin/main:src/lib/analytics.ts  # PostHog, no identify/email, anonymous ID only
git show origin/main:src/lib/auth.ts       # username = self-hosted server Basic-auth, not email
```
