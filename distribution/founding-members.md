# Founding Members — first paid cohort

**Status:** leads qualified, outreach drafted, **send BLOCKED on Stripe test key** (see § Blocker).
**Goal:** OpenCode Mobile's first dollar. Current MRR: **$0**. No Stripe product exists yet.
**Date qualified:** 2026-07-25

---

## Blocker (one-line ask for Den)

> **Den — add a Bitwarden Secure Note named `STRIPE_TEST_SECRET_KEY` (folder `opencode-mobile`) containing the `sk_test_...` key from https://dashboard.stripe.com/test/apikeys; the vault only has `OpenClawBot - STRIPE_SECRET_KEY` which is `sk_live_` and is off-limits.**

Why it's founder-gated: creating the test key requires an interactive login to the Stripe Dashboard on the
VIBE TECHNOLOGIES account (`vibeteaichnologies@gmail.com`). Stripe's login is anti-automation and the
CDP-driven browser session could not complete it.

Once that vault entry exists, everything below is unblocked and scriptable — no further founder input needed.

| Item | State |
|---|---|
| `STRIPE_TEST_SECRET_KEY` in Bitwarden (`opencode-mobile`) | **MISSING — founder-gated** |
| `OpenClawBot - STRIPE_SECRET_KEY` (`sk_live_`) | exists — **must not be used**, live mode |
| Stripe products (Free / $4.99 / $9.99) | not created — needs test key |
| Test checkout link | not created — needs products |
| Outreach message | **ready** (below) |
| Lead list | **ready** (below) |

---

## The 8 leads

Qualified from real repository engagement (issues filed, code contributed, forks, stars) — not scraped.
**None publish a public email**, so the contact channel is a GitHub `@mention` on the specific thread
they already opened. That is warmer than cold email anyway: they get a notification tied to their own words.

Ranked by purchase intent.

| # | Handle | Name / Locale | Contact channel | Evidence of intent | Fit rationale | Tier to pitch |
|---|---|---|---|---|---|---|
| 1 | `PylotLight` | "Light" — DevOps/Go dev | `@PylotLight` on **issue #134** (open) | Asked: *"Any chance at adding support for public hosted instances behind oidc/openid auth?"* | **Asked for the hosted product by name.** Wants a public hosted instance with SSO — that IS OpenCode Connect. DevOps background = pays for infra to not run infra. | **$9.99 Team** |
| 2 | `cloph-dsp` | Pedro Castro — Lisbon, PT | `@cloph-dsp` on **issue #53** | 4 issues (#53, #55, #56, #57), 1 PR (#54), fork, star | Heaviest external contributor. Reported the keyboard bug **and wrote a fix**. His PR was closed but the bug shipped fixed in #148 — owed a "you were right, it shipped" note. Deep daily user. | **$4.99 Pro** |
| 3 | `zFitness` | Shenzhen, CN — works at **@shopee** | `@zFitness` on **issue #150** | 2 issues (#147 keyboard, #150 refresh), fork **2026-07-24** | Active *this week*. Employed at a large tech co (Shopee) — corporate card, low price sensitivity. Blog: `zfitness.me`. | **$9.99 Team** |
| 4 | `2740653660` | "yyxxd" | `@2740653660` on **PR #68** | Shipped 2 features: #68 i18n + Simplified Chinese, #67 group sessions by project dir | Contributed *code*, not complaints. Highest goodwill in the pool. Ideal early advocate + zh-Hans channel. | **$4.99 Pro** (offer free year for contribution) |
| 5 | `e-lie` | Elie Gavoty | `@e-lie` via fork / GitHub profile | Forked **2026-07-25** — freshest signal in the pool | Forked within 24h of qualification — actively evaluating right now. Strike while hot. | **$4.99 Pro** |
| 6 | `SDBdevelopment` | — | `@SDBdevelopment` via fork | Forked 2026-07-18 | Handle implies a dev shop/agency → multi-seat potential. | **$9.99 Team** |
| 7 | `Med-amine0` | — | `@Med-amine0` via fork | Forked 2026-06-12 | Sustained interest (forked >6wk ago, repo still forked). Lower urgency. | **$4.99 Pro** |
| 8 | `mathysIN` | "mathys" — France | `@mathysIN` via fork | Forked 2026-05-20 — earliest external fork | Earliest believer, pre-dates most stars. Nostalgia/OG angle: "you found this before anyone." | **$4.99 Pro** |

**Reserve pool** (if any of the 8 go cold): stargazers with recent dates —
`Vitalii953`, `wsuff`, `FANATFANATA`, `2gn`, `song19931218`, `iAdanos`, `kiyou`, `heyalucardvania-cmyk`.

---

## Outreach message — ready to send

Post as a **comment on the person's own thread** (or a GitHub issue `@mention` for fork-only leads).
Personalize the `[HOOK]` line per the table above; everything else is fixed.

### Template

> **[HOOK]**
>
> I'm the maintainer of OpenCode Mobile. I'm opening a small **Founding Member** group — 8 people —
> before I turn on billing, and you're one of them.
>
> Here's the deal, plainly:
>
> - **OpenCode Connect** is the hosted version. No server to run, no Tailscale, no port forwarding — you
>   open the app and it works. It's what people ask for most, and it's the thing that costs me money to run.
> - Founding Members get **50% off for life** on whatever tier they pick, and a direct line to me for
>   feature requests. Your issues skip the queue. Permanently.
> - Free tier stays free, forever. Self-hosting stays free, forever. This does not paywall anything that
>   works today.
>
> Planned pricing (Founding Member price in bold):
>
> | | Free | Pro | Team |
> |---|---|---|---|
> | Price | $0 | ~~$4.99~~ **$2.49**/mo | ~~$9.99~~ **$4.99**/mo |
> | Connect to your own server | ✅ | ✅ | ✅ |
> | Hosted OpenCode Connect | — | ✅ 1 workspace | ✅ 5 workspaces |
> | SSO / OIDC | — | — | ✅ |
> | Priority support | — | ✅ | ✅ |
>
> I'm not asking for money in this message. I'm asking one question: **would you pay for this, and at
> which tier?** A one-word answer is a complete answer. If it's "no," tell me why — that's just as useful
> and I'll take it on the chin.
>
> — Den

### Per-lead `[HOOK]` lines

| Lead | `[HOOK]` |
|---|---|
| `PylotLight` | Hey — you asked in #134 about hosted instances behind OIDC. I'm building exactly that, and I want you in the first group. |
| `cloph-dsp` | Pedro — you reported the keyboard bug in #53 *and* sent a fix in #54. I closed your PR and then shipped the same fix myself in #148. That was a bad look on my part; you were right. Thank you for four issues that all made the app better. |
| `zFitness` | 你好 — you filed #147 and #150 this week and forked the repo. You're one of the most active users I have right now. |
| `2740653660` | You shipped Simplified Chinese support (#68) and project-directory grouping (#67) into this app. I owe you one — so this offer comes with a free year on me, no strings. |
| `e-lie` | Elie — you forked this yesterday, so you're evaluating it right now. Let me save you some time. |
| `SDBdevelopment` | You forked OpenCode Mobile last week — if you're deploying this for a team, I want to talk before I set pricing. |
| `Med-amine0` | You forked this back in June and it's still on your account. Curious what you're using it for. |
| `mathysIN` | mathys — you forked this in May. You were the first person outside my own account to do that. |

### Sending rules

- **Do not send until `STRIPE_TEST_SECRET_KEY` exists** — a "would you pay?" message with no way to
  actually pay burns the warmest leads in the list. One shot each.
- Send in **two waves**: leads 1–4 (high intent) first, measure reply rate, then 5–8.
- Stop/continue rule: **if fewer than 2 of the first 4 reply within 72h, stop and rewrite the offer** —
  the problem is the pitch, not the audience.
- Log every reply in this file under a `## Replies` section with date + tier answer.

---

## Success criteria

| Metric | Baseline (verified) | Target | Deadline |
|---|---|---|---|
| MRR | **$0** | > $0 (first dollar) | 14 days after Stripe unblock |
| Founding Member replies | 0 | ≥ 4 of 8 | 7 days after send |
| Stated willingness to pay | unknown | ≥ 2 say Pro or Team | 7 days after send |

Do not report a metric here as moved without a Stripe dashboard or GitHub thread link proving it.
