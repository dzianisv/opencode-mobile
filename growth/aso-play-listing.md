# ASO — Google Play listing for OpenCode Mobile

Package: cc.agentlabs.opencode. Source of truth for the listing text is
`fastlane/metadata/android/en-US/` (title, short + full description,
phoneScreenshots) — it must match the live listing; a drift here is a bug,
not a stale note. Text applied Nov 15, 2026; verified live Nov 22, 2026
(storefront fetch + Play Console readback).

## Live listing (verified 2026-11-27, Play Console live read)

- Title: "OpenCode Mobile: AI Coding" (26/30 chars). Matches
  `fastlane/metadata/android/en-US/title.txt` — no drift.
- Short description: "AI coding agent in your pocket. Review diffs, approve tool calls, on your phone." (80/80 chars). Matches fastlane — no drift.
- Long description: hook + WHAT IT DOES / CORE FEATURES / CONNECTION OPTIONS /
  WHO IT IS FOR / GETTING STARTED / OPEN SOURCE / PRIVACY, ending "Android
  only. There is no iOS version." (2,489 bytes in fastlane).
- Rating: 4.824 last 28 days (+0.56) / 4.510 default, 147 raters, 46 ratings
  with reviews (verified 2026-11-27, Play Console live read).
- v0.4.27 at 20% staged rollout (released Nov 23, 2026 06:07, 178 countries);
  v0.4.26 superseded. Rollout step-up held on the S/T surge (Sentry S 65, T 15).
- Reviews: queue clear — the one new review since Nov 24 (Daniel, Nov 25,
  5 stars, keyboard issue "got fixed") was already replied to Nov 26 01:20.
- NEW Play Console flag: "Your app may crash on 16 KB devices." Not yet
  verified as a real defect — flagged for the daily loop to check.

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

## Deck measurement 2026-11-27 (Play Console live read, 28-day Oct 30–Nov 26; data through Nov 24)

- Acquisitions 4.87K (−26%); first opens 2.74K (−30%); MAU 5.97K (0%).
- Store listing (Oct 27–Nov 23 window): visitors 17,412, install clicks 5.37K (−17%), CTR 34% (flat). Conversion 26.8% (default listing; the 33.15% on the Grow overview card is the 90-day figure, not 28-day).
- Verdict: NO SIGNAL YET. Deck live ~4 days; the 28-day window is still dominated by pre-deck days; conversion 27.1% → 26.8% is within noise. Judge the deck after a full week live (Nov 30).
- Crash 0.89% (+0.256pp vs previous 28d — up from 0.73% Nov 26), ANR 0.07% (−0.02pp). Crash uptick flagged for the daily loop / Sentry job — not a listing signal by itself, but watch it.
- Rating 28-day 4.824 (+0.56) / default 4.510, 147 raters (+1). No new reviews since Nov 25.
- v0.4.27 still at 20% rollout (5 days), step-up held. Installed audience 7,639 (Nov 24).
- Lifetime installs (Console monthly sum, Jun–Nov 24): 24,661 device acquisitions (Jun 880, Jul 2,718, Aug 4,657, Sep 4,947, Oct 7,319, Nov 4,140 MTD) — up from 23,257 measured Nov 17.
- Storefront verified live this run (crawled 2026-11-26 21:41 UTC): title, short desc (80/80), long desc all match fastlane — no drift.

## Deck measurement 2026-11-26 (Play Console live read, 28-day Oct 29–Nov 25)

- Acquisitions 5.06K (−22%); first opens 2.80K (−27%); MAU 6.08K (+5%).
- Store listing (Oct 26–Nov 22 window): visitors 16.2K (+14%), install
  clicks 5.55K (+13%), CTR 34% (+2pp). Conversion 27.1% (default listing;
  the 33.13% on the Grow overview card is the 90-day figure, not 28-day).
- Verdict: NO SIGNAL YET. The deck has been live ~3 days (storefront
  "Updated on Nov 23, 2026") and the 28-day window is still dominated by
  pre-deck days; conversion 28.2% → 27.1% is within noise. Keep measuring
  daily; judge the deck after a full week live.
- Crash 0.73% (+0.155pp), ANR 0.09% (+0.09pp). Impressions 163K (+45%);
  7-day retention 168 (+22%). Installed audience 7,719 (Nov 23).
- Rating 28-day 4.824 (+0.58) / default 4.510, 146 raters.

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
