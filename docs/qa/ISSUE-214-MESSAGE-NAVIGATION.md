# Issue 214: Message Navigation Validation

## Scope

Previous and Next use single carets immediately above double-caret Latest.
Targets are the starts of rendered user/assistant messages in the inverted
FlatList. Layout-only/system rows are not navigation targets.

The change does not modify native keyboard handling, the composer, safe-area
configuration, server code, release metadata, or unrelated IME PR #208.

## Automated Gates

- `npm ci --legacy-peer-deps`: completed using the existing lockfile.
- `npm test`: 348 passed, zero failures (15 navigation regressions).
- `npm run typecheck`: passed.
- `npm run check:versions`: passed, existing 0.4.15 / versionCode 42 unchanged.
- `git diff --check`: passed.
- `npm run lint`: unavailable; package.json has no lint script despite the
  contributing guide naming one. No lint pass is claimed.
- Android `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
  --max-workers=2 --console=plain`: passed under a capacity lease, with SDK/JDK
  environment configured and `SENTRY_DISABLE_AUTO_UPLOAD=true`.

The first build reached signing and failed because the checkout lacked
`android/app/debug.keystore`. Generating the ignored development key using the
same setup as CI allowed the build to pass; no signing material is committed.

## Physical Android Runtime

Device: Pixel 8 Pro. The installed production package had a different signing
certificate, so it was preserved. A temporary external Gradle init script used
the supported `androidComponents.finalizeDsl` API to build a separate
`cc.agentlabs.opencode.navigation214` test package. No tracked Android source or
configuration changed. The JavaScript bundle contains the actual feature diff.

The existing `tests/fixtures/mock-opencode-server.ts` supplied a separate test
connection via ADB reverse. The fixture was seeded through its REST API with
25 numbered user messages and 25 assistant responses, each containing 70 lines.
This is mock protocol coverage, not live AI/backend validation.

Snapshot-driven ADB assertions passed these flows:

1. From the newest response's partially visible end, Previous reaches user
   Message 25 at the viewport top, then the older assistant's line 1, then user
   Message 24. The repeated tap advances at exact message-start boundaries.
2. Next reaches the adjacent assistant's line 1, then user Message 25.
3. Manually scrolling into the middle of the long response discards the tap
   anchor; Previous reaches Message 24 from the new viewport position.
4. With an unsent draft and keyboard open, tapping navigation preserves the
   draft and composer `focused=true`; Android input-method state remains shown.
5. Latest reaches line 70 of the newest response and preserves the draft.
6. Seventeen consecutive Previous taps reach numbered Message 17 through every
   intermediate message start, beyond the initial render window. Latest then
   returns to the newest response end.

The harness first needed two test-only corrections: keyboard capitalization
must be accounted for, and keyboard dismissal must not send a blind Back key
when the keyboard is already closed. Neither required a product change.

Screenshots from the actual physical-device build:

- [Message start and controls](screenshots/issue-214-message-navigation.png)
- [Keyboard, draft and controls](screenshots/issue-214-keyboard-navigation.png)

The keyboard screenshot is not evidence that the composer is fully visible
above this device's IME. Existing keyboard layout work remains outside scope.

## Independent Review

An independent actual-diff code/behavior/UX review initially found three
issues: virtualized estimates could stall, completed targets could repin a
streaming response away from Latest, and resizing could leave a stale anchor.
All three were remediated and regression-tested.

The independent final review ran the 15 focused tests, typecheck and diff check,
inspected installed React Native 0.81.5 list internals, the runtime harness and
both screenshots. Verdict: **PASS code/static compact-control UX; BLOCKED merge
readiness**. No remaining actionable correctness defect was established.

## Blocked Gates

- Mandatory vision CUA was actually attempted with Python 3.12 and the existing
  runner against the isolated installed package. It exited 1 with:
  `Set AZURE_OPENAI_API_KEY, AZURE_DEV_AI_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or GEMINI_API_KEY`.
  The documented `~/.env.d/azure-openai.env` file is absent. Deterministic ADB
  assertions do not substitute for this gate.
- The documented live server's `/global/health` request timed out after 15
  seconds. No server/daemon changes or permission workarounds were attempted.
- Native rapid-tap callback ordering, live streaming/appends, and constrained
  keyboard/composer layout remain incompletely validated. Pure regressions
  cover rapid pending taps, growth/appends, resizing and manual cancellation.

Do not merge or release until the mandatory CUA gate passes and remaining
runtime gaps have been checked. The focused PR remains draft while blocked.
