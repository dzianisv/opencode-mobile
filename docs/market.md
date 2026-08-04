# Go-to-Market + Pricing — opencode-mobile

VIBE TECHNOLOGIES, LLC · app `cc.agentlabs.opencode` · MIT licensed · 2026-05-24.

This doc is the operational answer to **"how do we make money without killing the OSS community."**

---

## TL;DR

| Question | Answer |
|---|---|
| What's free? | The mobile client (Play, App Store, F-Droid, IzzyOnDroid) + the source code (MIT). Forever. |
| What's paid? | **opencode Cloud** — managed hosted opencode server. $10/mo individual, $30/mo team. Separate proprietary product. |
| Why this works | Tailscale ($45M ARR) + Bitwarden + sst's own OpenCode Zen ($Xm ARR) all run this exact model. OSS client, paid hosted service. |
| Why not paid app on Play? | MIT lets anyone repackage. License checks get stripped by community forks within days. F-Droid flags as `Tracking`. Real-world examples (every project that tried this) ended in resentment + zero revenue. |
| Bridge revenue while Cloud is built | GitHub Sponsors (Supporter $5 / Backer $15 / Business $50) → covers Sentry (~$26/mo) + EAS Build (~$30/mo) + CI. Cap: ~$1.5k MRR. |

---

## Customer segments

### Segment A — Self-hosters (free tier, OSS community, F-Droid users)

Runs `opencode serve` on their own machine or server. Wants a polished mobile companion. Will never pay for the app itself. May pay for a managed backend later if life gets busy.

**Revenue path**: $0 directly. Indirect: community contributions, GitHub stars (credibility multiplier), F-Droid presence (privacy-cred signal).

**Acquisition channels**: GitHub README, opencode's own README link (file PR), F-Droid + IzzyOnDroid listing, dev Twitter, r/programming, r/androiddev, Hacker News (release post).

### Segment B — Indie devs / consultants (paid backend, $10/mo)

Wants AI coding agent on phone but doesn't want to keep a laptop awake all day or fiddle with Tailscale + tunnels. Will pay for one-tap connect to a managed opencode instance.

**Revenue path**: $10/mo subscription to opencode Cloud individual.

**Acquisition channels**: in-app upsell during connection-setup wizard ("Don't want to self-host? Try opencode Cloud — 7-day free trial"), App Store listing copy mentioning it, blog posts about "AI coding from your phone."

### Segment C — Small teams (paid team backend, $30/mo)

Engineering team that wants shared opencode infra + audit + per-seat access. Paid backend solves "who's running the server" problem.

**Revenue path**: $30/mo team subscription. 3-5 seats typical.

**Acquisition channels**: outbound to small dev teams via Slack communities, product hunt launch, Tailscale-style "managed coordination" positioning.

### Segment D — Enterprise (custom)

Self-hosted with our support contract, or dedicated managed infra. Six-figure ARR potential per customer but slow sales cycle.

**Revenue path**: support contract ($25k+/year) or dedicated cloud tier ($500+/mo).

**Acquisition channels**: defer until Cloud has 50+ paying customers. Too early.

---

## Pricing — opencode Cloud

| Tier | Price | What's included | Target |
|---|---|---|---|
| Free trial | $0 for 7 days | Full Cloud features, single seat | Funnel — convert to Individual |
| Individual | $10/mo or $96/yr (20% off) | Managed opencode server, persistent sessions, 50 sessions/month, BYO model keys (you pay OpenAI/Anthropic directly) | Indie devs, consultants |
| Team | $30/mo or $288/yr | Up to 5 seats, shared sessions, audit log, SSO via Google/GitHub, 250 sessions/mo team-wide | Small dev teams |
| Enterprise | Custom (start $500/mo) | Dedicated infra, custom regions, SLA, support contract | Pilot only |

**Pricing reasoning**:
- $10/mo anchors to GitHub Copilot ($10/mo), Cursor Pro ($20/mo), ChatGPT Plus ($20/mo). We're cheaper because we don't bundle model API costs — BYO model keys is the differentiator.
- $30/mo team = $6/seat at 5 seats. Below Cursor team ($20/seat). Justified by "managed infra you don't have to babysit."
- BYO model keys: keeps our gross margin high (we sell compute + storage + auth, not tokens). Tailscale's exact play.

**What is explicitly NOT paid**:
- The mobile client (Play, App Store, F-Droid)
- The opencode CLI itself (sst owns that, MIT)
- Connection to user's own self-hosted opencode server
- Reading the source code

---

## What needs to exist before charging anyone

opencode Cloud is **not built yet**. Order of operations:

1. **Ship free client on Play + App Store + F-Droid** — get to 1000 active users on self-hosted.
2. **Build cloud MVP** — managed opencode instance, Stripe billing, basic auth (Google/GitHub OAuth), single-region (us-west).
3. **Add "Connect to opencode Cloud" option** in app connection wizard.
4. **Launch with 50-person waitlist** sourced from existing free users.
5. **Iterate to 50 paying customers** before opening publicly.

Estimated build time for Cloud MVP: **6-10 weeks** of focused work after client ships. Sequence Cloud MVP **after** the first 1000 client users — otherwise selling infrastructure to an empty room.

---

## Donations layer (bridge revenue)

GitHub Sponsors profile under VIBE TECHNOLOGIES, LLC org.

| Tier | Price | Perk |
|---|---|---|
| Supporter | $5/mo | Name in `SUPPORTERS.md` |
| Backer | $15/mo | Name + early access to Cloud beta + private Discord channel |
| Business | $50/mo | Company logo on agentlabs.cc/opencode footer + 30-min support call once per quarter |

**Realistic ceiling**: $500-1500/month based on comparable OSS dev-tool projects (Aves Gallery, AntennaPod). Pays Sentry + CI + 1-2 servers. Does **not** fund a salary.

**Action**: enable GitHub Sponsors on the VIBE TECHNOLOGIES, LLC GitHub org. Link from README + Play/App Store listing.

---

## Launch sequence (12-week plan)

### Week 0-2 (now): Pre-launch

- [x] Play Console account created
- [x] Apple Developer enrollment started
- [ ] Identity verification approved (user task)
- [ ] App icons + screenshots + privacy policy live (agents working)
- [ ] agentlabs.cc/opencode subdomain live (agent working)

### Week 3-4: Soft launch — Play Internal Testing

- Internal track release with 5-10 hand-picked testers from opencode community.
- Sentry crash reporting opt-in by default. Gather first crash reports.
- Iterate on bugs.

### Week 5-6: Closed Testing

- Recruit 12+ testers (Google requires 12 unique for 14 days before Production).
- Source: dev Twitter, r/androiddev, opencode Discord (if any), GitHub Issues opt-in.
- TestFlight equivalent for iOS.

### Week 7-8: Production launches + initial PR

- Play Production + App Store Production go live.
- Hacker News "Show HN: OpenCode Mobile — open-source mobile client for the opencode AI coding agent" launch post on Monday morning Pacific.
- File PR on `sst/opencode` README to mention the official-community mobile client.
- Post on r/programming, r/androiddev, r/MachineLearning, dev Twitter.
- Submit to IzzyOnDroid.

### Week 9-10: F-Droid mainline + content marketing

- File F-Droid mainline MR (https://gitlab.com/fdroid/fdroiddata).
- Blog post on agentlabs.cc/opencode: "Building OpenCode Mobile in 12 weeks."
- Reach out to dev YouTubers / podcast hosts for a demo.

### Week 11-12: opencode Cloud waitlist + first paying customers

- Cloud MVP in beta with 20 hand-picked users from free-tier waitlist.
- Stripe billing live.
- First $1k MRR target.

---

## North-star metrics

Track these weekly in a simple dashboard (Vercel Analytics + Stripe + Play Console + App Store Connect + Sentry).

| Metric | Week 4 target | Week 12 target | Month 6 target |
|---|---|---|---|
| Play Store installs | 50 | 1,000 | 10,000 |
| App Store installs | 0 (not live) | 500 | 5,000 |
| F-Droid + IzzyOnDroid installs | 0 | 200 | 2,000 |
| GitHub stars | 100 | 500 | 3,000 |
| Sentry crash-free sessions | >95% | >99% | >99.5% |
| Cloud waitlist signups | 0 | 100 | 500 |
| Cloud paying customers | 0 | 5 | 100 |
| Cloud MRR | $0 | $50 | $1,500 |
| GitHub Sponsors MRR | $0 | $100 | $500 |

---

## Competitive positioning

(From earlier market research — see consolidated agent reports.)

Direct mobile opencode clients today: ~12 attempts, mostly hobby. Best Android: P4OC (Kotlin, single-dev, terminal-aesthetic, 44 stars on Play). Best iOS: 2.8★ App Store app + various TestFlight betas.

Adjacent multi-agent platforms: **Paseo** (6.6k stars beta, biggest threat), **Vibe Pocket** (production iOS+Android, 18+ agents), **Termly** (encrypted bridge).

**Our differentiation**:
1. **Cross-platform parity** — iOS + Android + F-Droid same brand, same UX, same signing key. None of the existing clients have full Play + App Store + F-Droid presence.
2. **Tunnel wizard** — built-in Cloudflare / ngrok / Tailscale setup wizard. Closest competitor leaves this manual.
3. **Polished UX** — not terminal-aesthetic. Mainstream dev appeal.
4. **Native auth** — biometric unlock, encrypted server creds in OS keystore. Gap explicitly noted in the #1 iOS competitor's 2.8★ reviews.
5. **Open-source, paid-cloud model** — clean OSS story for community, real revenue path for the LLC. Differentiator from hobby clients (no money flowing) and proprietary platforms (Vibe Pocket).

**What we're NOT**:
- Not a new AI agent (opencode owns that, MIT)
- Not a code editor (pairs with terminal/IDE)
- Not a multi-agent shopping cart (Paseo's niche)

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| sst (opencode authors) ships their own official mobile client | Medium | High | We are first, we have F-Droid + cross-platform. Pivot to "the polished community client" if they do. Could merge under their banner if they want. |
| Paseo ships polished multi-agent release first | Medium | Medium | Our opencode-only focus is a feature, not a bug, for opencode power-users. Compete on depth not breadth. |
| Apple/Google policy change blocks AI client apps | Low | High | Already an established category (Cursor, Codex, Claude mobile). Stay clean on Data Safety + ATS. |
| Identity verification (Play) or Apple enrollment rejected | Low | High | We have D-U-N-S + legal entity. Resolve case-by-case. |
| Cloud MVP delayed, free users churn before revenue starts | High | Medium | Bridge with GitHub Sponsors. Sequence carefully — don't promise Cloud before it ships. |
| Sentry / Vercel / EAS pricing increases | Low | Low | All have free tiers covering 1000s of users. Self-host alternatives exist (Sentry self-hosted, Coolify for site). |
| LLC liability around AI agent code execution | Medium | Medium | Terms of Service makes user responsible for their own opencode server + code changes. Don't run code on our infra in v1. |

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-24 | Free client everywhere; opencode Cloud separate paid product | Monetization research: Tailscale model has $45M ARR; "paid Play / free F-Droid" never works for MIT apps |
| 2026-05-24 | Default monetization = "Subscriptions" in Play Console | Optimistic for opencode Cloud; not enforced in client |
| 2026-05-24 | "Yes — earning money" + "Subscriptions" in Play Console signup | Future-proof for Cloud upsell |
| 2026-05-24 | Apple ID = support@agentlabs.cc (not Gmail) | Apple recommends domain-matched email for org accounts |
| 2026-05-24 | EAS Build for iOS CI | Zero Mac infra; managed certs; $0 free tier |
| 2026-05-24 | Sentry opt-in default OFF | F-Droid parity + cleaner data safety form |
| 2026-05-24 | `agentlabs.cc/opencode` subdomain (not path) | Cleaner URLs, separate Vercel project, dedicated landing |

---

## Open questions (for follow-up)

1. What gross margin do we need for opencode Cloud to be worth running? Estimate at $10/mo × 100 users = $1k MRR vs hosting cost ~$300/mo = 70% gross margin. Reasonable.
2. Do we want a "lifetime" purchase option ($100 one-time) as a vanity/donation tier? Probably yes for the OSS-friendly crowd.
3. Should we offer the LLC's "VIBE TECHNOLOGIES, LLC" branding for the cloud product, or rebrand opencode Cloud under a sub-brand? **Recommendation**: rebrand "opencode Cloud" as a sub-product. Keep the LLC name backstage.
4. EU users + GDPR: we collect Sentry data (with opt-in) — need a DPA with Sentry. Free on their side. Action item.

---

## Action items (this week)

1. ✅ Decide pricing model (done — this doc)
2. ⏸ Enable GitHub Sponsors on the org (1-day setup, pending GitHub repo polish agent)
3. ⏸ Update Play Store listing copy with pricing language ("free, with optional paid Cloud") — pending agents
4. ⏸ Domain `agentlabs.cc/opencode` live with landing + /privacy + /terms — agent running
5. ⏸ Write "How we're funded" page at agentlabs.cc/opencode/funding — covers free vs paid breakdown
6. Defer: opencode Cloud MVP build (start after first 1000 free-client users)
