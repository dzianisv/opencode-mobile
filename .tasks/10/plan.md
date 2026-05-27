## Approach Summary
Verify existing regression fix on real emulator and real server, then align code/tests/CI with validated behavior. Ship smallest safe diff that satisfies connect-then-sessions success metric and keeps coverage durable.

## Tradeoff: Speed vs Quality
- chosen: balanced
- rationale: bug already has partial fix and open PR context; need fast closure with strong real-feature verification and review loop.

## Tasks
| # | Title | Files | Depends on | Parallel group | Suggested model |
|---|-------|-------|------------|----------------|-----------------|
| 1 | Validate runtime behavior on emulator | .tasks/10/test-plan.md, .tasks/10/test-report.md | - | A | sonnet |
| 2 | Reconcile sessions/client logic to match verified behavior | src/stores/connections.ts, src/stores/sessions.ts | 1 | B | gpt-5.1-codex |
| 3 | Ensure UI trigger path remains deterministic | app/(tabs)/index.tsx | 2 | C | sonnet |
| 4 | Update smoke script/CI coverage if gap remains | scripts/android-cua-smoke.py, .github/workflows/cua-smoke.yml | 1 | B | gpt-5.1-codex |
| 5 | Owner integration pass, docs artifacts, and commit prep | .tasks/10/* | 2,3,4 | D | haiku |

## Parallel Groups
- **A**: task 1 (runtime verification baseline)
- **B** (after A): tasks 2 and 4 in parallel (independent files)
- **C** (after B): task 3
- **D** (after C): task 5

## Done Criteria
- Task 1: report includes explicit pass/fail for connect-then-sessions with screenshots or logs.
- Task 2: store logic reflects validated client-selection behavior; no TypeScript errors.
- Task 3: sessions tab reliably triggers loading after connect/focus without duplicate side effects.
- Task 4: smoke path covers regression in CI/local scenario form; script parses and executes.
- Task 5: artifacts updated (`review.md`, `test-report.md`, `STATE.md`, `worklog.md`) and branch ready for PR.

## Rollback Plan
- Revert ownership commits on feature branch (`git revert <sha>`).
- Keep issue open with failed evidence attached.
- Restore previous merged behavior by cherry-picking last known good commit if needed.
