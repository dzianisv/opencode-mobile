# Plan — OpenCode Mobile

Owner: Dzianis Vashchuk (VIBE TECHNOLOGIES, LLC).
Repo: `dzianisv/opencode-mobile` · Android app `cc.agentlabs.opencode` · MIT.
Last updated: Oct 26, 2026. This file replaces the closed $10k MRR plan.
Execution rule (owner, Oct 26): work in one batch via `gh` CLI, one push.
Source of truth: this file in git. The Notion "Plan — OpenCode Mobile"
page mirrors it; if they differ, git wins.

## Goal

Ship a free, reliable, open-source Android client that works against
**opencode v1 AND v2**, maintained through community PRs with a regular
owner merge cadence — with no paid relay, no ads, and no iOS promise.

### Explicitly NOT the goal (closed, do not re-litigate)
- $10k MRR via OpenCode Connect ($4.99/$9.99 relay, ~1,541 subs / ~51k MAU).
  Never validated: MRR $0, no Stripe product, no founding offer sent,
  no Connect code in the repo.
- Zeekend ads ($200/mo x 2). Declined in principle: breaks the README's
  no-ad-network promise and sends user questions to match sponsors.
- iOS / TestFlight (#65). Not planned. Do not count it as a KPI.

## KPIs (baseline Oct 26, 2026 — target = done, not "more")
- v2 compat: #205, #219 closed, #209 merged.
- One release shipped: Play + GitHub APK + self-hosted F-Droid.
  (Users are on v0.4.15; README still says v0.4.7.)
- PR queue triaged: 18 open PRs (Oct 26) → every pre-Oct PR decided,
  none older than 30 days undecided.
- Gates green on main after every merge; 0 Play reviews dropped.
- Docs honest: README version = shipped version; waitlist told Connect
  will not ship.
- Merge cadence: at least one merge every 60 days (GitHub disables cron
  workflows after 60 days without commits).
- Non-KPIs, on purpose: MRR, download growth, stars, iOS, Connect signups.

## NOW — fix v2 compatibility (do this first, nothing else blocks it)

| Priority | Item | Issue / PR | Done when |
|----------|------|------------|-----------|
| P0 | Rebase #209 onto current main, resolve conflicts (keyboard/events overlap with #216), run typecheck + full test suite, merge with `--squash` | PR #209, fixes #205, #194, #156 | #209 merged; tests recorded in the merge commit; #205, #194, #156 closed |
| P0 | Verify opentunnel.xyz against the merged v2 build | Issue #219 | #219 closed, or kept open with a written reason (tunnel-specific, not API) |
| P0 | Decide #218, do not merge it as-is | PR #218 | #218 closed in favour of #209, OR author reverts the `.test` app ID, rebases, and drops duplicated #216 work — then it is re-reviewed |
| P0 | Verify the v2 build live, if possible | #209 (author verified v2 2.0.16 + v1 1.18.32) | Live v1 + v2 check recorded, or release notes explicitly say it was not live-tested |
| P0 | Confirm the Play feedback funnel stays green after the v2 merge | Triage workflow, #217 | Next scheduled triage run green; `user-feedback` label exists; 0 reviews dropped |
| P0 | Ship the next release (version per PUBLISHING.md, not invented) | Release | GitHub APK + Play production + self-hosted F-Droid all verified live; README version updated to the shipped version |

Notes on NOW:
- #209 merge attempt, Oct 26: `gh pr merge 209 --squash` failed with
  merge conflicts, despite the API reporting `mergeable=true` / behind
  beforehand. That field was stale. A real rebase is required — do not
  merge #209 (or #218) on the API field alone.
- #218 is `mergeable=false` / dirty after #216 merged, 59 files,
  +4736/-568, no device / no live v2 testing, and it changes
  `applicationId` to `cc.agentlabs.opencode.test` — a Play identity
  breaker. Never merge it as-is.
- #216's "PermissionV2" is the permission protocol inside opencode
  1.18, not opencode 2.0. Do not count #216 as v2 support.

## LATER — address after v2 ships (do not let these delay NOW)

| Priority | Item | Issue / PR | Done when |
|----------|------|------------|-----------|
| P1 | Deduplicate the keyboard queue: pick the merged fix, close the rest with a link to it | PRs #206, #203, #201, #193, #208; #215 (draft, message navigation for #214) | Each PR merged or closed with a reason; no duplicate keyboard PRs left open |
| P1 | Messages silently lost + agent cycling dead | Issue #198 | Root causes (directory-scoping, invisible async errors) fixed and verified, or issue updated with a scoped fix plan |
| P1 | Phantom "Voice input failed" alert on back-navigation | Issue #197 | Alert no longer fires when voice was never used |
| P1 | SSE startup blocked behind metadata fetches; SSE recovery on network change | Issues #189, #186 | SSE starts without waiting on `/project/current` + `/path`; reconnects promptly after network transitions |
| P1 | Subagent sessions in the UI | Issue #187 | Subagent sessions, status, and results visible in the app |
| P1 | Honesty cleanup (founder gate: exact-text approval only) | Zeekend decline; waitlist note; #152 | Zeekend declined (sent); waitlist told Connect will not ship (sent); #152 closed with that explanation, not deleted |
| P2 | Play package registration | Issue #162 (deadline Sep 30 passed) | Play Console shows "Registered" for both live packages, or the risk is written down |
| P2 | Stale Sentry secret (AGE-497) | Repo secret `SENTRY_ORG` | Org-scoped Sentry API calls stop 403ing, or the workflow is retired |
| P2 | F-Droid mainline + reproducible-build parity | Issue #95; F-Droid MR !39530 (maintainer-gated) | Mainline package live, or maintainer response recorded |
| P2 | OIDC support | Issue #134 | Scoped decision: build, or close as out of scope |
| P2 | iOS / TestFlight | Issue #65 | Explicitly out of scope for this plan; do not let it read as a promise |
| P2 | Growth / ASO / SEO pages | Launch kit, docs-site | Only after a v2 release ships — never before it |

## DONE (Oct 26, 2026)
- Merged #217: triage never loses Play feedback to a missing label
  (commit `7d2acc86`, verified on main). The label crash dropped
  actionable ≤3★ reviews on Oct 13/15; the fix adds `ensure_label()`
  + an unlabeled fallback.
- Merged #216: PermissionV2 + keyboard avoidance (commit `c980c9e8`,
  10 files, +246/-21, no app-ID change).
- Sunset paused: branch `docs/status-not-maintained-oct26` created but
  NOT merged — do not merge it.
- Plan created in git (`plan.md`, commit `a262857e`) and mirrored to
  Notion ("Plan — OpenCode Mobile").

## Risks
- Fork rebase permission (403, maintainer edits not enabled) and stale
  `mergeable` flags — verify by an actual rebase/merge attempt, never
  by the API field alone.
- No device / no live-server testing on several PRs — label it, do not
  hide it.
- Upstream v2 API drift continues — #209's probe classifier
  (`/api/info` vs `/global/health` by content type, never status code)
  and `docs/v2-api-map.md` are the mitigation; keep the map updated.
- Play/Sentry founder gates (#162, AGE-497) can block a release even
  when the code is ready — surface them early.

## Done = all of these, or an explicit owner decision to stop
- NOW table fully done (v2 shipped), LATER table triaged (not
  necessarily all done), KPIs met, or
- The owner explicitly closes the project with a sunset note on the repo
  and Play listing, the waitlist told, and the code left up under MIT.
- Drifting (no merge, no note, no decision for 60+ days) is not a third
  option. That is how the Aug–Oct stall happened.
