# Decisions (Autopilot)

## 2026-05-27 cycle 5
- question: No explicit user `go` after phase 4 prompt; proceed or wait?
- decision: Proceed automatically to phase 5.
- reasoning: Latest user message includes `--autopilot` and explicit instruction to follow full ownership flow end-to-end with no early stop.
- alternatives: Wait for human confirmation; restart planning.
- evidence: User context block contains `--autopilot`; skill says no AskUserQuestion in autopilot mode.

## 2026-05-27 cycle 5
- question: Reuse existing PR #9 branch vs create new branch for issue #10?
- decision: Reuse `fix/sessions-load-regression` and update PR metadata to close #10.
- reasoning: Branch already contains relevant fix + passing CI; minimizes risk and cycle time while preserving auditable history.
- alternatives: Create fresh branch/PR and duplicate commits.
- evidence: `gh pr status` shows PR #9 open with checks passing; diff targets regression files.

## 2026-05-27 cycle 6
- question: CUA run failed with blank white screen. Root cause in product or test harness?
- decision: Diagnose runtime first; treat as harness/install state issue, not product bug.
- reasoning: Logcat showed Metro bundle load failures (`Unable to load script`, `10.0.2.2:8081` refused) while release APK rendered UI correctly.
- alternatives: Patch UI code blindly; skip tests.
- evidence: process log dump from app PID with ReactHost/Metro connection errors.

## 2026-05-27 cycle 7
- question: Should sessions list use active client or server-home fallback for no-directory connections?
- decision: Keep server-home fallback and add runtime-safe recovery when `serverHome` missing.
- reasoning: Real server response confirmed default scope returns 11 stale deploy sessions, while home scope returns correct 27 global sessions.
- alternatives: Force active client path; remove `roots` filter.
- evidence: direct HTTP probes to `/session?roots=true&limit=50` with and without `x-opencode-directory`.

## 2026-05-27 cycle 8
- question: Consent-modal mitigation in CUA script should use broad heuristics or strict markers?
- decision: Use strict markers (`Help improve OpenCode` / `Share anonymous crash reports`) and no BACK fallback.
- reasoning: Broad matching plus BACK introduced flaky off-path navigation risk flagged in review.
- alternatives: keep broad matching; always send BACK on uncertain modal.
- evidence: review warning in `.tasks/10/review.md` and failed scenario traces.

## 2026-05-27 cycle 9
- question: Should connect-and-verify scenario stay opt-in or become default smoke path?
- decision: make it default in script and CI; allow explicit skip via `--skip-connect-scenario`.
- reasoning: regression guard must run every smoke by default to be durable.
- alternatives: keep `--opencode-url` opt-in only.
- evidence: review warning on missing default coverage; updated workflow now sets `OPENCODE_URL`.
