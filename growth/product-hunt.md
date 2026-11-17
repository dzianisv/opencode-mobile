# Product Hunt — launch runbook for OpenCode Mobile

Status: PREP ONLY, 2026-11-18. Nothing here has been posted. There is no
Product Hunt account and no listing for OpenCode Mobile; do not create
either from this prep — the launch itself is a later step, once prep is
complete and a Tue–Thu window opens.

Product: OpenCode Mobile — free, open-source (MIT) Android client for
OpenCode (v1 + v2). Package `cc.agentlabs.opencode` — never change it.
Prod: v0.4.23 (Play 20% rollout, versionCode 163). Repo:
github.com/dzianisv/opencode-mobile. Play:
https://play.google.com/store/apps/details?id=cc.agentlabs.opencode.
Docs site: https://dzianisv.github.io/opencode-mobile/

## Launch copy (paste-ready)

### Name

OpenCode Mobile

### Tagline (36 chars, limit 60)

Your AI coding agent, in your pocket

### Description

OpenCode Mobile is the free, open-source Android client for OpenCode.
It puts your AI coding sessions in your pocket: connect to the OpenCode
server on your own machine, watch the agent think token by token, review
diffs before anything lands, and approve tool calls from your phone.

No account. No relay. No paywall. Your code, prompts, and API keys never
leave your own server — the app talks only to the server you run.
MIT licensed, source on GitHub.

### Topics (suggested)

Developer Tools, Artificial Intelligence, Android

### First comment (posted by the maker, right after the listing goes live)

> Hey — I'm Den, I build OpenCode Mobile.
>
> What broke: my AI coding agent lived on my desk. OpenCode runs on my
> workstation, and the moment I walked away from it — commute, couch,
> coffee shop — I was blind. The agent kept working, but I couldn't see
> it, steer it, or approve anything until I was back at my keyboard.
>
> What changed: OpenCode Mobile puts the session in your pocket. Connect
> your phone to the OpenCode server on your own machine and you can watch
> the agent think token by token, review diffs before anything lands,
> and approve or reject tool calls from anywhere. v0.4.23, live on Google
> Play now, fixes the chat crash that killed long sessions and ships
> F-Droid parity, so the open-source build is reproducible.
>
> Why it matters: the agent works for you, not the other way round. You
> don't need a laptop to stay in the loop on a long job — you need a
> phone and your own server.
>
> It's free, MIT open source, no account, no relay, no paywall. Your
> code, prompts, and API keys never leave your server — the app talks
> only to the server you run.
>
> Happy to answer anything — and I'd genuinely like to know: if you run
> a coding agent, what would you want a phone client to do first?

## Where the content comes from

- All gallery images are built from real assets in this repo — never
  mockups, never stock, never generated screens:
  - Mark: `assets/icon.png` (the shipped 1024x1024 app icon).
  - Screenshots: `docs-site/screenshots/01.png`, `02.png`, `05.png`,
    `06.png` (real flows, 1280x2560, from the app running against a
    live server). Checked 2026-11-18: no "FAKE DEVICE MODE" banner on
    any shot used.
- Copy comes from the live Play listing (`growth/aso-play-listing.md`):
  the tagline is the same promise as the short description ("AI coding
  agent in your pocket"). Nothing in the copy claims a feature the app
  does not have.

## How the cards are made

- Builder: `growth/product-hunt/build-cards.py` (Pillow, DejaVu Sans).
  Run `python3 growth/product-hunt/build-cards.py` from the repo root;
  it regenerates every card from the sources above.
- Thumbnail: `thumbnail-240x240.png` — the shipped icon downscaled.
- Gallery (5 x 1270x760, one idea per card, captions 5–7 words):
  1. `gallery-01-hero.png` — name + tagline + shot 06 (code created:
     the strongest proof).
  2. `gallery-02-connect.png` — "Connect in seconds" + shot 01.
     Source bottom 150 px cropped: the capture caught a half-visible
     button at the frame edge.
  3. `gallery-03-sessions.png` — "Every session, in your pocket" +
     shot 02.
  4. `gallery-04-live.png` — "Watch the agent work, live" + shot 05.
  5. `gallery-05-benefits.png` — "Free. Open. Yours." benefit list
     (free / open source MIT / your server only).
- Check every card at the size Product Hunt shows it before shipping:
  open the PNG, read the caption at gallery size, confirm the
  screenshot is recognisable and no text is garbled. Rebuild, don't
  patch, when one fails.
- Known imperfection (not a fail): the session titles in gallery-03
  ("cua-smoke-sessions-check", "Pong reply") are real session names
  from the E2E test run. A re-shoot with human session names is a
  nice-to-have for a future refresh, not a launch blocker.

## Critic verdicts (2026-11-18, growth-design checks)

- KPI alignment (cards serve the launch — the first impression that
  makes a user install): PASS. Each card shows the value that makes a
  user install: the agent in your pocket, one-tap connect, sessions
  anywhere, live work.
- Product alignment (core loop real, tagline kept, no feature shown
  that does not exist): PASS. All four screenshots are real flows;
  the tagline is the Play listing's own promise.
- Brand alignment (`growth/brand.md`: same mark, `#0F172A` / `#3B82F6`,
  same tagline, style "precise"): PASS. Colours sampled from the
  shipped icon; the tagline matches the Play short description.

## Demo video — verdict: GAP RECORDED, no route yet (2026-11-18)

A 30–60 s core-loop clip (connect → ask → file created, hook in the
first 2 s, proof on screen within 5 s) is part of the launch, and no
such video exists.

Investigated: Firebase Test Lab Robo-test video, project
`opencode-mobile-ftl`, free Spark plan.

- What is true: the project was proven working 2026-11-16 — Robo test
  matrix-27319jh3atnis PASSED (10/10 script actions, v0.4.19 APK).
  FTL Robo tests do record a video of the run.
- Why it is not a route today: (a) no `gcloud` CLI on this VM and no
  invocation is documented in the repo — the prior run's trigger path
  is not recorded; (b) a Robo video is an unguided crawl, not the
  scripted core loop — it cannot carry the hook or show the file
  being created on cue; (c) running a new matrix needs Firebase/GCP
  credentials (Den's Google account) — a Den-only gate, not attempted.
- The reliable route is a scripted screen recording on a real device
  or emulator against a live server — the same setup as the repo's E2E
  test (`scripts/android-cua-smoke.py --e2e`). No recording route
  exists on this VM (no KVM, no Android runtime).
- Decision: the launch is NOT blocked on the video — Product Hunt
  accepts a launch with 5 gallery images and no video. Launch with
  the 5 images; pursue the scripted recording as the follow-up, and
  add the video to the listing when it exists. Do NOT fabricate or
  mock up footage.

## Launch timing

- Post Tue–Thu at 12:01am PT. Never launch Fri–Mon.
- The maker posts the first comment immediately after the listing goes
  live (copy above).
- Reply to every commenter the same day. Answer questions, ask one
  follow-up where it fits. Never ask for upvotes — not in the comment,
  not in replies, not anywhere.

## How the post is uploaded

1. Create the Product Hunt account at launch time (maker account — not
   part of this prep).
2. New product: name "OpenCode Mobile", tagline + description from
   "Launch copy" above, links: Google Play listing + GitHub repo +
   docs site.
3. Upload `thumbnail-240x240.png` as the logo, the 5 gallery images in
   order 01–05, and the demo video when it exists (see verdict above).
4. Schedule for the next Tue–Thu 12:01am PT.

## How the post is verified live afterwards

1. After it goes live, open the public Product Hunt page (not the
   dashboard preview) and confirm: name, tagline, description, all
   three links work, all 5 gallery images render, video plays if one
   was uploaded.
2. Confirm the first comment is visible under the listing.
3. Record the public URL in the Work Log row for this launch and in
   the next daily growth-loop report. If any image fails to render,
   re-upload that one image only and re-verify.

## Out of scope for this prep (do not bundle)

- Docs-site version bump: `llms.txt` says 0.4.22, prod is 0.4.23.
  That is a separate pick (tomorrow's), not this PR.
- No Product Hunt account creation, no posting, no launch today.
- No DevHunt, Show HN, or Reddit step in this PR (DevHunt
  UNCONFIRMED — no public page for the Android client exists in
  search, only the upstream OpenCode CLI's page).
