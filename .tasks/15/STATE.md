# Task 15 — STATE
- phase: 3-design
- issue: #15 (CUA smoke can't reach opencode server in CI)
- branch: fix/cua-smoke-local-opencode-server
- supervisor: opus 4.8 (solo-founder loop)

## Success metric (R1)
GitHub Actions `CUA Smoke Test` workflow run on the branch ends with
`All N scenarios passed.` (exit 0), where the connect-and-verify-sessions
scenario connected the app to a real opencode server running on the runner
and saw a non-empty session list. Observable in the Actions run log.

## Approach
- Run real `opencode serve` on runner; app (emulator) reaches it via 10.0.2.2.
- Add `--only-connect-scenario` to smoke script; enhance connect goal to
  create a session so a fresh empty server still yields a non-empty list.
- This also gives E2E verification for #10 (sessions list after connect).

## Local de-risk (2026-06-01)
- opencode-ai@1.15.13 installs; `opencode serve` healthy in 1s.
- GET /global/health -> {"healthy":true}; /project/current 200; /path 200.
- POST /session then GET /session returns the created session. Flow validated.
- phase: 5-implemented, ready for CI verify.

## CI verify round 1 (FAILED -> fixed)
- run 26750362939: build OK, opencode server step healthy, but emulator
  script died with dash syntax error on `|| { ...; }` brace group before smoke ran.
- Fix 42e60db: emulator script: block runs under /usr/bin/sh; replaced brace
  group with non-fatal one-line re-check.
- Re-dispatched: run 26751422570.
