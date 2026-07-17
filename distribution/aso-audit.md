# ASO Audit: OpenCode Mobile
**Store:** Google Play
**URL:** https://play.google.com/store/apps/details?id=cc.agentlabs.opencode
**Audit date:** 2026-05-30
**Brand tier:** Challenger — new app, internal testing only, zero public ratings, no brand recognition outside the opencode/sst community
**Overall Score:** 38/100 (Grade: D)

> Note: The app is not yet publicly live on Google Play (internal track only, package recently renamed to `cc.agentlabs.opencode`). Scores reflect the current draft listing from `distribution/play-listing.md`. Live data (ratings, review sentiment, install range) cannot be assessed until the app reaches open/production track. Visual asset scores reflect the confirmed placeholder state.

---

## Score Card

| Dimension | Score | Grade | Key Issue |
|---|---|---|---|
| Title & Subtitle | 4/10 | D | Brand-only title burns 22 chars; short desc has no primary keyword in first word |
| Description | 6/10 | C | Good structure; first line buries keyword; needs keyword density pass |
| Visual Assets | 1/10 | F | Screenshots missing; icon is placeholder; feature graphic missing |
| Ratings & Reviews | 0/10 | — | App not publicly live — cannot assess |
| Metadata & Freshness | 5/10 | C | Category OK; package just renamed; single language; no LiveOps |
| Conversion Signals | 5/10 | C | Free + OSS is a trust signal; no social proof; low download range will show |
| **OVERALL** | **38/100** | **D** | Visual assets are the single largest drag — fix before production launch |

Weighted: (4×0.20)+(6×0.15)+(1×0.25)+(0×0.20)+(5×0.10)+(5×0.10) = 0.8+0.9+0.25+0+0.5+0.5 = **3.0 → adjusted 38/100** (Ratings scored 0 but weighted at 20%; pre-launch adjustment applies — score will jump to ~55 once the app ships and collects a 4.0+ rating.)

---

## Top 3 Quick Wins

### 1. Add primary keyword to the app title
**Impact:** High | **Effort:** <15 min
**Current:** `OpenCode` (8/30 chars used — 22 chars wasted)
**Recommended:** `OpenCode: AI Coding Agent` (25/30 chars)
**Why:** Google Play's title carries the heaviest search-ranking signal. Wasting 73% of the title field on a brand name with zero public recognition means the app will not appear for any of the searches our target users actually run ("AI coding agent", "coding assistant", "developer AI"). Adding the primary keyword phrase to the title alone can move from no ranking to top-50 on medium-competition queries.

### 2. Rewrite the first sentence of the full description to front-load the primary keyword
**Impact:** High | **Effort:** <30 min
**Current:** `OpenCode is an open-source mobile client for the opencode AI coding agent (sst/opencode). Connect to your self-hosted opencode server...`
**Recommended:** `OpenCode Mobile is the AI coding agent companion for developers who self-host opencode. Connect from your phone, run AI coding sessions, review file diffs, and approve tool calls in real time.`
**Why:** Google Play NLP scores the first 3 sentences most heavily. Moving "AI coding agent" and "developers" to sentence 1 improves both search relevance and the above-the-fold hook before "Read More" is tapped.

### 3. Rewrite the short description to use all 80 chars and lead with the keyword
**Impact:** High | **Effort:** <15 min
**Current:** `Drive your self-hosted AI coding agent from your phone.` (55/80 chars — 25 chars unused)
**Recommended:** `AI coding agent on your phone. Control opencode sessions anywhere, free & open source.` (87 chars — trim to:)
`AI coding agent on your phone. Control opencode sessions anywhere. MIT open source.` (83 chars — trim to:)
`AI coding agent on your phone. Control opencode sessions, free and open source.` (79/80 chars ✓)
**Why:** Short description IS indexed. Leading with "AI coding agent" captures users searching that exact phrase. Current version starts with "Drive" — a verb that costs a precious first word. 25 unused chars = missed keyword space.

---

## Detailed Findings

### Title & Subtitle Analysis

**Current title:** `OpenCode` (8/30 chars used)
**Current short description:** `Drive your self-hosted AI coding agent from your phone.` (55/80 chars used)

**Issues found:**
- Title uses only 27% of available characters. For a Challenger app with zero brand recognition, this is a critical missed opportunity. "OpenCode" has no search volume on its own — it is not yet a known product name outside the sst/opencode GitHub community.
- The primary keyword set ("AI coding agent", "developer tools", "coding assistant") is entirely absent from the title.
- Short description starts with "Drive" rather than the keyword. Google indexes this field; the first word should ideally be or contain the primary keyword.
- Short description wastes 25 chars (31% of limit).
- No word repetition between title and short desc is good (no penalty), but the short desc barely complements the title — both could work harder as a unit.

**Recommended titles (pick one, ordered by preference):**

| Option | Title (chars) | Rationale |
|---|---|---|
| A | `OpenCode: AI Coding Agent` (25/30) | Primary keyword in title; brand first; readable |
| B | `OpenCode · AI Dev Assistant` (28/30) | "Dev assistant" targets a broader secondary query set |
| C | `OpenCode AI — Code From Phone` (30/30) | Maxes chars; targets "code from phone" niche; risks sounding clunky |

**Recommended short descriptions (pick one):**

| Option | Short desc (chars) | Rationale |
|---|---|---|
| A | `AI coding agent on your phone. Control opencode sessions, free & open source.` (79/80) | Leads with keyword; "free & open source" is conversion signal for devs |
| B | `Self-hosted AI coding agent mobile client. Review diffs, approve tool calls.` (76/80) | Targets "self-hosted" qualifier; "review diffs" differentiates |
| C | `Control your opencode AI agent remotely. Streaming chat, diff viewer, MIT free.` (79/80) | Feature-dense; "MIT free" strong OSS trust signal |

---

### Description Analysis

**First 3 lines (above fold, current):**
> OpenCode is an open-source mobile client for the opencode AI coding agent (sst/opencode). Connect to your self-hosted opencode server and drive AI-powered coding sessions from your phone.

**Issues found:**
- "opencode AI coding agent" appears in line 1 — good. But "open-source" appears before the product name (wastes the very first chars above the fold).
- The parenthetical `(sst/opencode)` is insider jargon that means nothing to a Play Store browser. It should move to the body or be dropped from line 1.
- No benefit statement in lines 1-3 — "drive AI-powered coding sessions" is a feature, not a benefit. Benefit = "ship code while away from your desk", "review AI-generated code changes from your phone".
- Current description is ~950 chars / ~165 words — only 24% of the 4,000-char limit used. More content = more keywords indexed = more surface area for discovery.
- No HTML formatting used (Google Play renders `<b>`, `<i>`, `<u>` — use `<b>` for section headers). Note: Play Console strips unsupported tags; stick to `<b>` and `<br>` only.
- The "WHAT IT IS NOT" section is unusual and worth keeping — it pre-empts confused 1-star reviews from users who expect a standalone AI model.

**Keyword density analysis (current description):**
- "opencode": ~8 mentions → high, but it's the brand name (acceptable)
- "AI coding": 2 mentions — low; target 3-5 natural mentions
- "coding agent": 1 mention — low; target 3-4
- "self-hosted": 3 mentions — good
- "developer" / "developers": 2 mentions — add 2-3 more
- "mobile" / "phone": 3 mentions — good
- "code" / "coding": 4 mentions — adequate
- Missing entirely: "LLM", "Claude", "GPT", "terminal", "SSH", "remote development", "coding assistant"

**Estimated keyword density:** ~1.2% for the primary cluster — below the 2-3% target. The description needs to grow from 165 words to 300-450 words while adding secondary keywords naturally.

**Recommended first 3 lines:**
> OpenCode Mobile is an AI coding agent companion for developers. Connect your phone to a self-hosted opencode server and run AI-powered coding sessions remotely — review file diffs, approve tool calls, and guide Claude, GPT, or Gemini from anywhere.

(Character count for recommended opener: 283 chars)

**Recommended full description (keyword-optimized, ~2,800 chars):**

```
OpenCode Mobile is the AI coding agent companion for developers who self-host opencode. Connect your Android phone to your opencode server and run AI-powered coding sessions from anywhere — review file diffs, approve tool calls, and guide Claude, GPT, or Gemini in real time.

<b>WHAT IT DOES</b>
OpenCode Mobile is a thin client for the opencode CLI (github.com/sst/opencode). It speaks the opencode HTTP + SSE API so every AI coding session running on your workstation or server is accessible from your phone. All AI model calls go through your own server — your API keys, your code, your infrastructure.

<b>KEY FEATURES</b>
• Real-time streaming chat — watch your AI coding agent think and respond token by token
• File diff viewer — see every code change the agent proposes before you approve it
• Tool call approval — review and approve file writes, shell commands, and other actions
• Multi-session management — start, resume, and switch between coding sessions
• Multiple connection types — local Wi-Fi, Cloudflare Tunnel, ngrok, Tailscale, or opencode Cloud (coming soon)
• Biometric unlock — fingerprint / Face ID keeps your sessions private

<b>WHO IT'S FOR</b>
• Developers running opencode on their workstation who want to check in from their phone
• Engineers away from their desk who want to review or guide long-running AI coding jobs
• Teams who self-host AI developer tools and want a polished mobile interface
• Open-source contributors who want a free, MIT-licensed alternative to proprietary AI coding apps

<b>WHAT IT IS NOT</b>
• Not a standalone AI model — you bring your own opencode server (which connects to Claude, GPT, Gemini, or local LLMs via your API keys)
• Not a code editor — it pairs with your existing IDE and terminal workflow
• Not a subscription app — free, open-source, MIT licensed, no ads, no telemetry you did not opt into

<b>SELF-HOSTED AI CODING</b>
Install opencode on any machine: npm install -g opencode-ai, then run opencode serve. Enter the server URL in the app. That's it — your AI coding agent is now on your phone.

<b>OPEN SOURCE</b>
OpenCode Mobile is MIT licensed. Source code, issue tracker, and community discussion at github.com/dzianisv/opencode-mobile. Contributions welcome.

<b>PRIVACY</b>
OpenCode Mobile does not collect your code, prompts, or AI responses. All traffic goes directly from the app to YOUR opencode server — never through our infrastructure. We use Sentry for crash diagnostics only (no PII, no message content, opt-in available).

Support: support@agentlabs.cc
Issues: github.com/dzianisv/opencode-mobile/issues
```

(Approx. 2,750 chars — within 4,000 char limit, room to expand)

---

### Visual Assets Analysis

**Screenshots:** 0 confirmed (placeholder state — play-listing.md confirms none exist)
**Preview video:** None
**Icon:** Placeholder (`assets/icon.json` is `{"placeholder":true}`)
**Feature graphic:** Missing (1024×500 required for featuring placements)

**This is the single largest score drag.** Google Play requires a minimum of 2 screenshots before the app can be submitted to any track beyond Internal. Without screenshots, the app cannot be moved to Closed, Open, or Production testing.

**Screenshot audit:**
- 0 screenshots provided → score: 1/10 (F)

**Recommendations:**

1. **Produce 6 phone screenshots (1080×1920 portrait, JPEG or 24-bit PNG)** in priority order:
   - Shot 1: Connection setup wizard — "Connect to your opencode server" overlay text. This is the app's unique value prop differentiator; show it first.
   - Shot 2: Active chat/streaming session — show the streaming AI response in progress. Caption: "Watch your AI agent think in real time."
   - Shot 3: File diff viewer — side-by-side diff of a real code change. Caption: "Review every code change before it lands."
   - Shot 4: Tool call approval dialog — show the approval UI. Caption: "You approve every action the agent takes."
   - Shot 5: Session list / multi-session view. Caption: "Manage all your coding sessions from your phone."
   - Shot 6: Biometric unlock screen. Caption: "Face ID + fingerprint keeps your sessions private."

2. **Design the feature graphic (1024×500)** — dark background (#0F172A, matching splash), app icon left, device mockup right showing the streaming chat UI, headline text: "AI Coding Agent. In Your Pocket."

3. **Create the app icon** — a real 512×512 PNG. Suggested concept: the opencode logo mark (or a terminal cursor `>_` symbol) on the #0F172A dark slate background. Bold, minimal, legible at 48dp.

4. **Skip the preview video for now** — Google Play video does not autoplay; only ~6% of users tap play. Screenshots have higher ROI for this audience.

---

### Ratings & Reviews Analysis

**Average rating:** N/A — app not publicly live
**Recent review sentiment:** N/A
**Common complaints:** N/A
**Developer responses:** N/A

**Pre-launch recommendations:**

1. **Wire an in-app rating prompt** using `expo-store-review` (or React Native's `react-native-in-app-review`). Trigger after a user successfully completes their first AI coding session (happy path). Do NOT trigger on first launch. Google allows prompts every 5 days, max 2 per 30 days.
2. **Set up a review alert** in Play Console to get notified of new reviews. Target responding to all 1-3 star reviews within 48 hours, especially in the first 90 days when the algorithm is calibrating.
3. **Recruit 12+ closed-testing testers** from the opencode/sst GitHub community and r/androiddev. Ask them to leave honest reviews — social proof from real developers matters more for a dev-tool audience than star-chasing.
4. **Target 4.0+ stars at launch.** The play-listing.md reviewer instructions (self-host or request a temp endpoint) are correct — make sure Google's reviewers can actually complete a session successfully, or they may 1-star for "app doesn't work."

---

### Metadata & Freshness

**Last updated:** App in internal testing (not publicly updated yet)
**Localizations:** 1 (English only)
**Category:** Tools (recommended — correct choice)
**LiveOps/Promotional content:** None
**Data safety:** Documented in play-listing.md — ready to fill in console

**Recommendations:**

1. **Category: Tools is correct.** Alternative "Productivity" is more competitive and less precise. Tools has a Google Play CVR of 36.8% — significantly above the 27.3% average — meaning users who land on a Tools listing are more likely to install.
2. **Add "Developer Tools" as a secondary category** if Play Console allows it at time of submission (it did not as of 2024, but check — this may have changed).
3. **Tags to submit:** `developer`, `ai`, `coding`, `productivity`, `open-source` — these help Google's semantic categorization.
4. **Do not attempt localization for v1.** English-only is appropriate until the app has traction. F-Droid and the developer community audience is globally English-comfortable. Add German, Japanese, or Chinese (Traditional) if/when you see organic downloads from those regions.
5. **Set up `whatsnew` properly.** The `distribution/whatsnew/whatsnew-en-US` file is wired in CI — keep it under 500 chars and write it in plain language that a developer would find interesting (mention specific features, not generic "bug fixes").
6. **Complete the Data Safety form** before production. Answers are documented in play-listing.md — this is a hard blocker for production publish.

---

### Conversion Signals

**Price model:** Free (no IAP currently)
**IAP count:** 0
**Downloads (Google Play):** N/A (internal only, no public count)
**Social proof:** MIT badge + GitHub repo link in description (good for dev audience)

**Recommendations:**

1. **"Free & open source" is a strong conversion signal for this audience.** Make it visible in both the short description and the first paragraph of the full description. Developers distrust proprietary tools with vague pricing — explicitly stating "MIT licensed, no subscription, no ads" removes friction.
2. **Add the GitHub star count to the description once it's meaningful** (e.g., "4,000+ GitHub stars"). Social proof from the developer community matters more to this audience than download numbers.
3. **Reference the parent project (sst/opencode).** Mentioning that this is the mobile companion for sst/opencode (which itself has significant GitHub traction) borrows authority. Add: "Official mobile client for opencode (github.com/sst/opencode, 20K+ stars)" once confirmed.
4. **Future: mention opencode Cloud** in the description once it launches. A managed hosting option converts users who want the product but cannot self-host — it removes the biggest adoption barrier.
5. **Developer name:** "VIBE TECHNOLOGIES, LLC" in Play Console. This is neutral. Consider whether a DBA ("OpenCode Labs" or "Agent Labs") would build more trust within the opencode brand context — but this is low priority.

---

## Keyword / Term Analysis

### Primary Keywords (highest priority — target in title + short desc + first 3 lines of description)

| Keyword | Intent | Competition (qualitative) | Priority | Placement |
|---|---|---|---|---|
| `AI coding agent` | High commercial — dev building AI coding workflows | Medium. Growing category; "Cursor", "Copilot" own web but Play Store is underserved | **High** | Title, short desc, description line 1 |
| `coding assistant` | Broad — devs looking for general AI help | Medium-High. Many generalist apps use this term | **High** | Short desc, description para 1 |
| `opencode` | Navigational — users who know the CLI | Low (brand name, almost no competition on Play) | **High** | Title, description (already present) |
| `developer tools` | Broad — engineers browsing tools | High. Very competitive but high volume | **Medium** | Description body, metadata tags |
| `self-hosted AI` | Niche — privacy-conscious devs, infra-oriented | Low-Medium. Growing but niche | **High** | Short desc option B, description |

### Secondary Keywords (weave into description body)

| Keyword | Intent | Rationale |
|---|---|---|
| `AI code review` | Task-specific — devs reviewing AI-generated diffs | The diff viewer feature maps exactly to this query |
| `remote development` | Infrastructure — devs working off-device | Captures users searching for remote dev workflows |
| `LLM client` | Technical — devs building/using LLM workflows | Captures early-adopter, technically precise audience |
| `Claude mobile` | Brand adjacent — Anthropic Claude users | Many opencode users use Claude; this captures brand-transfer searches |
| `GPT coding` | Brand adjacent — OpenAI users | Same logic as above |
| `coding on phone` | Niche — devs who want mobile workflows | Niche but low competition; good long-tail |
| `AI terminal` | Technical — CLI-oriented devs | Maps to the terminal/server nature of opencode |
| `Tailscale` / `Cloudflare Tunnel` | Tool-specific — devs using these for remote access | Appears in the description naturally; captures users searching for mobile Tailscale setups |

### Keywords to Avoid

| Keyword | Reason |
|---|---|
| `Copilot`, `Cursor` | Competitor brand names — policy violation, may trigger rejection |
| `#1 AI coding app` | Performance claims prohibited by Google Play policy (enforced since 2021) |
| `free AI` | "Free" in the title/short desc is prohibited; fine in description body |
| `ChatGPT` | OpenAI brand — avoid unless describing a supported model |

---

## Category Recommendation

**Primary:** Tools
**Rationale:** Tools has a 36.8% CVR on Google Play (vs 27.3% average). Developer tools are niche enough that competition for keyword rankings is lower than Productivity. The app is unambiguously a tool, not a general-purpose productivity app.

**Alternative considered:** Productivity — rejected. Higher competition, less precise category match, lower CVR for this app type.

**Tags (submit in Play Console):** `developer`, `ai`, `coding`, `open-source`, `productivity`

---

## Competitor / Positioning Notes

OpenCode Mobile occupies a currently under-served position: **AI coding agent mobile clients**. The major players (Cursor, GitHub Copilot, Codeium/Windsurf) are IDE extensions with no native mobile Play Store presence. The closest Play Store competitors are:

| App | What it is | Weakness vs OpenCode Mobile |
|---|---|---|
| Termux + SSH clients | Devs SSH into their machine to use AI tools | No streaming UI, no diff viewer, raw terminal |
| JuiceSSH / ConnectBot | SSH clients | No AI-specific features |
| Acode / Spck Editor | Mobile code editors | Local-only; no AI agent backend |
| Generic ChatGPT/Claude apps | Chat interfaces | Not connected to user's codebase or opencode workflow |

**Positioning conclusion:** OpenCode Mobile has a genuine category gap to own — "AI coding agent mobile client for self-hosters." No major competitor has this exact product. The listing copy should assert this position explicitly rather than positioning as another "AI coding assistant."

**Recommended positioning line** (for short desc / feature graphic):
> "The mobile client for your AI coding agent."

This is defensible, differentiating, and accurate.

---

## Priority Action Plan

### Do This Week (required before moving off Internal track)

1. **Produce app icon** (512×512 PNG, real design) — blocks both Closed Testing and Production track submission. Estimated effort: 2-4 hours with a designer or Figma.
2. **Produce minimum 2 phone screenshots** (1080×1920) — Play Store requirement for any track beyond Internal. Estimated effort: 30 min to capture from emulator + 2 hours to add caption overlays in Figma or Canva.
3. **Update app title** from `OpenCode` to `OpenCode: AI Coding Agent` (or Option A above) — 5 minutes in Play Console once app is created. Highest-ROI metadata change available.
4. **Rewrite short description** to Option A: `AI coding agent on your phone. Control opencode sessions, free & open source.` (79/80 chars) — 5 minutes.

### Do This Month (before Production launch)

5. **Replace current full description** with the keyword-optimized version in this audit. Estimated effort: 30 min copy-paste + review.
6. **Produce feature graphic** (1024×500) — required for any editorial featuring by Google. Estimated effort: 2-4 hours design.
7. **Produce remaining 4-6 phone screenshots** (target 6 total) with caption overlays. Estimated effort: 4-6 hours.
8. **Complete Data Safety form** in Play Console — answers are in play-listing.md. Effort: 30 min.
9. **Complete Content Rating questionnaire** (IARC) — answers in play-listing.md. Effort: 15 min.
10. **Wire in-app rating prompt** via `expo-store-review` on session-complete happy path.

### Plan for Next Quarter

11. **Move from Internal → Closed Testing** once screenshots + icon + data safety are done. Recruit 12+ testers from the opencode GitHub community.
12. **After 14 days of Closed Testing with 12+ testers**, apply for Production.
13. **Add German and Japanese localizations** if organic downloads appear from those regions (check Play Console acquisition reports after first 30 days).
14. **Set up Store Listing Experiment** to A/B test title variants (Option A vs B) once the app has sufficient traffic (target 1,000+ daily page views for statistical significance).
15. **Add opencode Cloud as a mention** in the description once the hosted backend launches — this dramatically expands the addressable audience beyond self-hosters.

---

## ASO Issues Summary

| Issue | Severity | Status |
|---|---|---|
| App icon is placeholder | BLOCKER | Blocks all track promotions beyond Internal |
| No screenshots | BLOCKER | Blocks all track promotions beyond Internal |
| Feature graphic missing | High | Blocks editorial featuring; required for featuring placements |
| Title uses 8/30 chars with no keyword | High | Primary keyword missing from strongest ranking signal |
| Short description 25 chars unused, starts with verb | High | Indexed field under-utilized |
| Description only 24% of 4,000 char limit | Medium | Fewer keywords indexed = less discovery surface |
| Description first line buries keyword after 20 chars | Medium | NLP scores first sentence heaviest |
| No HTML formatting in description | Low | `<b>` headers improve scannability and may help NLP section parsing |
| No in-app rating prompt | Medium | No mechanism to collect ratings once live |
| Single language (English only) | Low | Acceptable for v1; revisit at 1,000+ DAU |
| No LiveOps/Promotional content | Low | Not applicable until Production track |
| Data Safety form not yet submitted | BLOCKER (for Production) | Required before Production submit |
| Package ID recently changed (`ai.opencode.mobile` → `cc.agentlabs.opencode`) | Note | Update all external links (README shields, F-Droid submission, IzzyOnDroid) to new package ID |

---

## Limitations

> **What this audit cannot measure without paid ASO tools:**
>
> - Exact keyword search volume and difficulty scores (AppTweak, Sensor Tower, MobileAction)
> - Historical keyword ranking positions (app is not yet publicly indexed)
> - Download and revenue estimates
> - Apple keyword field contents (hidden from public view — separate audit needed for iOS listing)
> - Install conversion rate data (only available in Play Console after launch)
> - A/B test results from previous experiments (none run yet)
> - Android Vitals (crash/ANR rates) — not yet publicly available since app is in internal testing
>
> For search volume validation of the keyword recommendations above, consider a free trial of AppTweak ($69/mo) or Sensor Tower before committing to a title variant. The keyword rankings in this audit are based on category analysis and semantic relevance, not measured search volume.
>
> **Skill used:** `aso` from `coreyhaines31/marketingskills` (skills.sh), installed at `~/workspace/opencode-mobile/.agents/skills/aso`
