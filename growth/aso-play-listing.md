# ASO — Google Play listing for OpenCode Mobile

Package: cc.agentlabs.opencode. Source of truth for the listing text is
`fastlane/metadata/android/en-US/` (title, short + full description,
phoneScreenshots) — it must match the live listing; a drift here is a bug,
not a stale note. Text applied Nov 15, 2026; verified live Nov 22, 2026
(storefront fetch + Play Console readback).

## Live listing (verified 2026-11-22)

- Title: "OpenCode Mobile: AI Coding" (26/30 chars).
- Short description: "AI coding agent in your pocket. Review diffs, approve tool calls, on your phone." (80/80 chars).
- Long description: hook + WHAT IT DOES / CORE FEATURES / CONNECTION OPTIONS /
  WHO IT IS FOR / GETTING STARTED / OPEN SOURCE / PRIVACY, ending "Android
  only. There is no iOS version." (2,467 chars, in fastlane).
- Rating: 4.778 last 28 days / 4.520 default, 144 raters.
- v0.4.25 at 50% staged rollout (versionCode 165), 178 countries.

## Screenshot deck — rebuilt 2026-11-22 (PR pending, then apply in Console)

The old deck was 7 raw captures: slot 1 a bare setup form, slots 2 and 3 the
same Sessions list twice (with smoke-test names "cua-smoke-sessions-check"
and "Pong reply" visible on the public storefront), slots 6 and 7 the same
code block twice, slot 4 mid-typing with the keyboard open and an Android
autofill bar. No headlines anywhere — the deck documented the UI instead of
selling the outcome.

New deck: 5 ad-style cards, 1280x2560, built by
`growth/play-screenshots/build-cards.py` from the real captures in
`docs-site/screenshots/` (same navy/blue system as the Product Hunt cards).
One benefit headline per card (3–5 words per line), real capture in a blue
frame below. Cuts land in clean white space, verified by pixel scan + visual
readback of every card.

| Slot | Headline | Sub | Source capture | Cut |
|---|---|---|---|---|
| 1 Hero | Your code, written from your phone. | The agent writes. You approve. | 06 (code created) | bottom 575px: "Run it..." lines + input bar |
| 2 Differentiator | Watch it think. Approve every step. | Thinking, tool calls, and diffs as they happen. | 05 (thinking + tool calls) | bottom 460px: tool card below the message |
| 3 Feature | Connect in seconds. | Paste your server address. Done. | 01 (Add Connection) | bottom 150px: half-cut button |
| 4 Feature | Every session, in your pocket. | Start, resume, and switch sessions. | 02 (Sessions list) | bottom 500px: FAB + tab bar |
| 5 Closer | Free. Open. Yours. | — | no screenshot: benefit list + icon | — |

Copy options considered per slot (paint a moment / outcome / kill a pain):
slot 1 also "Code lands while you're out." / "Never wait at your desk again.";
slot 2 also "Every step, visible." / "No silent rewrites." The chosen lines
won on the thumbnail test (readable at ~160px wide, one idea each).

Known limit: slot 4 still shows the smoke-test session names — no clean
Sessions capture exists yet. A fresh capture with real session titles
replaces it in the next deck refresh.

## Baseline for measuring the deck (2026-11-22, Play Console, 28-day)

- Acquisitions 5.83K (−2% vs prev 28d); first opens 3.11K (−13%); MAU 6.39K (+14%).
- Store listing: visitors 18.1K (+1%), install clicks 6.37K (+9%), CTR 35% (+8%).
- Conversion: 28.2% (28-day). Correction: the 33.25% carried since Nov 14 is
  the 90-day figure (Grow overview shows 33.22% under "Last 90 days"), not
  the 28-day figure — measure the deck against 28.2%.
- Crash 0.63%, ANR 0.09%. Impressions 149K (+40%); 7-day retention 176 (+47%).
- Ratings last 28d: 18 ratings — 5★ 8, 4★ 1, 3★ 1, 2★ 0, 1★ 8 (polarized;
  the 1★ reviews go to the 09:17 PT Play reviews job, not this lane).

## Keywords to win (score monthly: relevance, difficulty, volume)

- opencode mobile, opencode android, opencode client, opencode app
- ai coding agent, ai coding, coding agent, mobile coding agent
- claude code android, code from phone, self-hosted ai coding
- ai coding agent android, opencode android client

## How to apply (owner step, after the PR merges)

1. Play Console > OpenCode Mobile: AI Coding > Store presence > Main store listing.
2. Replace phone screenshots 01–07 with the new 01–05; delete the old 06/07.
3. Save, submit for review. Record the date and the numbers above in this
   file, so the next iteration can tell what moved. Watch conversion + install
   clicks over the next 28 days; a deck change moves slowly.
