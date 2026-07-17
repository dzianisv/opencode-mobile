# Retention Analysis — opencode-mobile

_Last updated: 2026-07-17_

## The number that matters

- **Installs: 1K+** (Google Play, live listing, package `cc.agentlabs.opencode`).
- **7-day retention: ~0%** (per Notion "Retention Investigation").

Awareness is **not** the bottleneck anymore. Getting people to install works. Getting
them to *stay* does not. Every hour spent on more distribution channels is spent on the
wrong problem until activation is fixed.

## Diagnosis: it's product-shape, not a bug

A brand-new installer's path (traced in code):

1. Launch → **telemetry consent modal first** (`app/_layout.tsx:157-168`) — a privacy
   prompt before the user has seen any value.
2. Land on Sessions tab, empty state: "No Connection / Add a server connection to get
   started" (`app/(tabs)/index.tsx:421-440`, `src/lib/i18n/en.json:258-259`). No hint
   that this needs a *separate computer*.
3. Tap Add → Quick Connect form asking for **IP address + port + password**
   (`app/connection/add.tsx:225-407`), hand-typed on a phone keyboard.
4. To get past this, the user must **already** have, on another machine: Node/npm,
   `opencode-ai` installed, `opencode serve` running, and LAN or Tailscale reachability.
5. A wrong IP hangs the spinner up to **30s** before any feedback
   (`REQUEST_TIMEOUT_MS=30_000`, `src/lib/sdk.ts:175`).

**There is no demo, sample, or try-it mode anywhere in the app.** For any installer
without a self-hosted server already running — almost certainly the majority of casual
Play installs — the app is functionally inert after onboarding: empty state → a form
they can't fill → a "coming soon" mailing-list card (`app/connection/add.tsx:343-397`).
Nothing else to tap.

The store listing makes it worse: the short description
("AI coding agent in your pocket. Stream, diff, approve — free & open source.")
sets **zero** expectation that a self-hosted server is required. People install expecting
a standalone app, hit a wall, and uninstall. That is the ~0% D7 mechanism.

## Fixes, ranked by impact ÷ effort

| # | Change | Impact | Effort | Owner-gated? |
|---|--------|--------|--------|--------------|
| 1 | Set the self-hosting expectation in the empty state + connect screen; fail-fast timeout | High | Low | No — shipping via PR |
| 2 | One-screen "what you need" pre-flight with an "I don't have a server yet" branch | High | Med | No |
| 3 | QR-code pairing (server prints QR of URL+creds; app scans) — kills manual IP/port/password typos | High | Med | No |
| 4 | Local demo/sandbox session — scripted walkthrough of chat/diff/approve, no server needed | High | Med-High | No |
| 5 | **Store-copy honesty**: move the server prerequisite into the short description + first screenshot | High (on D7) | Low | **Yes — Play Console** |
| 6 | Hosted "OpenCode Connect" so users need no server at all (the real fix) | Highest | High | **Yes — strategic/infra** |

Items 1–4 are agent-shippable. Item 1 is in flight (branch
`fix/first-run-onboarding-clarity`).

## The one decision only the owner can make

**Do we optimize for install count or for activated users?**

- Item 5 (put "needs a self-hosted server" in the store's short description) will
  **reduce installs** — it filters out people who can never activate. It will **raise**
  retention and store rating quality. This is a positioning tradeoff, not an engineering
  one, so it is the owner's call, not an agent's. Recommended: yes, be honest up front —
  a 4-star app with 300 real users beats a 2-star app with 1,000 bouncing ones.
- Item 6 (hosted OpenCode Connect) is the only change that removes the server prerequisite
  entirely. The waitlist card already in the app signals intent. This is the actual
  long-term retention fix and deserves a roadmap decision.

## What this loop is doing about it

- Shipping items 1 (and scoping 2) as reviewable PRs.
- Not touching the live Play listing (item 5) or infra (item 6) — surfacing them here for
  the owner instead of acting unilaterally on positioning/strategy.
