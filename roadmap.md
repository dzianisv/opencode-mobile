# Roadmap — OpenCode Mobile (`cc.agentlabs.opencode`)

Canonical project roadmap. Owner: VIBE TECHNOLOGIES, LLC. Repo: `dzianisv/opencode-mobile`.
Goal contract: `goal.md` (solo-founder growth loop). Historical log: `context.md`, `HANDOFF.md`.

## Current state (2026-10-16)

- **App:** v0.4.15 shipped — sideloaded installs get update notices (#179), release versionCode discipline (#180), Play publishes release tags straight to production (#177).
- **Install channels live:** GitHub Release APK, self-hosted F-Droid repo, Google Play production listing.
- **Growth loop (scheduled CI):** Daily Product Intelligence (06:00 UTC, green), Play Store Review Triage (07:00 UTC), Sentry noise-gate report — these funnels user signal into issues.
- **Last code push:** 2026-08-18 (AGE-497 Sentry probes + retro). Code side idle since; scheduled workflows kept running.
- **Local verification floor:** `npm run typecheck`, `npm test`, CUA smoke for changes touching `src/`/`app/`.

## P1 — restore the review-feedback funnel (2026-10-16, in review)

`scripts/triage-reviews.py` crashed on `gh issue create --label user-feedback` (the label never existed in the repo), so every run with actionable ≤3★ reviews failed and real Play feedback was dropped (2026-10-13/15, runs 38416717810 / 38734963328). Fix (branch `fix/triage-feedback-label`):

- `ensure_label()` creates the label best-effort — never fatal.
- `create_issue()` falls back to an unlabeled issue when the label is unavailable, so label/permission problems can never drop feedback; genuine gh failures still fail the run red.
- Verified: `py_compile`, an 18/18 stubbed-gh scenario suite (healthy / already-exists / forbidden→unlabeled fallback / unrelated-401→red / edit path), ast-grep rules gate PASS.

**After merge:** `gh label create user-feedback --color d4c5f9 --description "Play Store review feedback"` (or the script creates it in CI), then dispatch `Play Store Review Triage` and confirm the triage issue appears.

## P2 — owner gates (exact steps, agent cannot do them)

1. **Play package registration deadline passed (issue #162).** Deadline was 2026-09-30. Confirm both live packages show *Registered* at Play Console → Android developer verification (developer account 8842655543970815326). App still live + reviews flowing → likely auto-registered; confirm to close the risk.
2. **Stale `SENTRY_ORG` repo secret (AGE-497).** Root cause recorded in `.agents/retro.md`. Fix = update the Actions secret (needs secrets-write); until then org-scoped Sentry API calls from CI 403.
3. **Scheduled-workflow inactivity clock.** GitHub disables cron workflows after 60 days without commits; last push was 2026-08-18. Any merge (e.g. P1) resets the clock and keeps the growth loop alive.

## P3 — growth surface (standing, from `goal.md`)

ASO listing refresh · long-tail SEO pages + IndexNow · F-Droid mainline MR #39530 (maintainer-gated) · IzzyOnDroid inclusion · launch kit in `distribution/launch/` (owner accounts) · retention fixes driven by triage signal (#194 chat input hidden behind keyboard, #198 lost messages, #214 message navigation).

## Verification commands

```bash
npm run typecheck && npm test
python3 -m py_compile scripts/triage-reviews.py
gh run list --workflow=triage-reviews.yml --limit 3
gh issue list --search "Play Store Review Triage" --state open
```
