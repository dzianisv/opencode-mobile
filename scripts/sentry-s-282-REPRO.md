# #282 repro notes — Sentry S "Maximum update depth exceeded" (2026-11-20)

Result: **NOT REPRODUCED** on device (blocked — see §1) and **NOT REPRODUCED**
in the JS harness (ran clean — see §2). The harness is proven sensitive: its
positive control throws the exact Sentry error. No code was fixed, no PR opened.

Branch: `fix/sentry-s-282-repro` @ `ee52ab144632889b37b8b3ffda02640716640b04`
(main HEAD at branch creation, v0.4.25 release commit — v0.4.25 does not touch
the S path, per the #282 context pack).

## 1. Device repro (Firebase Test Lab) — BLOCKED, exact blocker

FTL route provenance (corrects the #282 citation): "#219 proven route" does
not resolve as written — #219 in this repo is the closed opentunnel issue
("Doesn't work with opentunnel.xyz"). The route itself IS real and proven,
but its record lives elsewhere: `~/workspace/opencode-mobile-ftl-219/NOTES.md`,
`growth/product-hunt.md:155-172`, and memory 2026-11-15/16. Matrix
`matrix-27319jh3atnis` PASSED 2026-11-16 (physical Pixel 7, API 33, 10/10
guided Robo actions, v0.4.19 APK, project `opencode-mobile-ftl`, Spark $0).

Why it cannot run from this session — three stacked gates, all verified live:

1. **No gcloud auth on this machine.** `~/google-cloud-sdk/bin/gcloud`
   exists (SDK 593.0.0) but `gcloud auth list` = "No credentialed accounts";
   `gcloud projects list` errors "You do not currently have an active account
   selected." The 2026-11-15 run authenticated through the Firebase Console
   in the cloud browser, never through the gcloud CLI. A fresh
   `gcloud auth login` needs an interactive Google sign-in — a Den-only step
   this subagent cannot do (no live browser; no fresh Google logins per Den's
   standing rule).
2. **Firebase Console route now requires MFA.** Per memory 2026-11-17: every
   Firebase Console route for project `opencode-mobile-ftl` redirects to
   `/mfa` — "Multi-factor authentication is now required." Enabling MFA is
   Den-only and was never asked for. (Note: repo AGENTS.md says all Google
   ops use `vibeteaichnologies@gmail.com`; the FTL project was driven under
   `dzianisvv@gmail.com` in the Nov 15 run — account ownership to confirm
   before any future run.)
3. **Backend is down and would die at turn end.** The opencode server +
   opentunnel tunnel from the Nov 15 run were stopped afterwards (NOTES.md).
   Binaries/identity persist on disk
   (`~/workspace/opencode-mobile-e2e-219/server-v2/opencode`,
   `~/.config/opentunnel`, public URL
   `https://a5e8bdc26b1bc842.66tujaxfxwj3.opentunnel.xyz`), and the
   `robo-script.json` (10 actions, Quick-mode testIDs) is reusable — but
   background processes started from this session do not survive the turn,
   so a recreated backend would die before a parent-driven FTL run starts.

Also verified non-viable on this VM: local emulator (no `/dev/kvm`, 409 MB
free RAM, no AVD, no Java; `~/Android/Sdk` exists but cannot boot a usable
emulator here) and the dev opencode server (`100.108.64.76:4096` unreachable
from this VM — curl 000, no Tailscale).

What the parent needs to run the device repro: (a) a fresh gcloud auth or a
browser task in the cloud browser against console.firebase.google.com
(project `opencode-mobile-ftl`, Spark, physical Pixel, 0.4.24 CI APK below);
(b) the backend recreated in the same turn as the run (server + tunnel per
NOTES.md, then re-verify `/api/info` + `/api/session` through the public URL);
(c) a Robo script extended beyond the Nov 15 connect-only script — the #282
recipe needs a streaming session + scroll/focus/Previous-Next navigation,
which a Robo crawl cannot drive deterministically; expect low hit rate on a
4-in-thousands crash and consider a scripted run instead. The MFA gate (2)
is the one that may need Den; auth (1) may be satisfiable from the saved
cloud-browser login as in Nov 15.

## 2. JS harness — ran clean (alternate acceptance path attempted)

Harness: `scripts/sentry-s-282-harness.mjs` (this branch).
Prereq (not a repo dep): `npm install --no-save react-test-renderer@19.1.0`.
Run: `node scripts/sentry-s-282-harness.mjs [--scenario A|B|C|D|E|all]
[--tokens N] [--items N]`.

It renders the REAL VirtualizedList from the installed RN 0.81.5 tree
(`node_modules/react-native/node_modules/@react-native/virtualized-lists`,
Flow stripped + CJS via @babel/core with hermes-parser — @babel/parser
cannot parse Flow `as` casts, 15x in VirtualizedList.js) under
react-test-renderer 19.1.0, `__DEV__=false` (release build, like the CI APK),
with the session screen's exact props (inverted +
maintainVisibleContentPosition `{minIndexForVisible: 0}`, no getItemLayout,
no onViewableItemsChanged) and drives it per the #282 recipe: streaming row
growing per token (cell onLayout with a new height), scroll events while
tokens stream, focus-capture taps, scrollToIndex Previous/Next retries with
the app's onScrollToIndexFailed estimated jump, and a new message unshifted
at index 0 mid-stream (MVCP shift). FlatList is skipped deliberately —
thin wrapper, same props; the S stack names VirtualizedList.

Final run (200 tokens, 200 items — window is a strict subset):

| Scenario | Result | List renders | setStates | _updateCellsToRender |
|---|---|---|---|---|
| A streaming + scroll | no-throw | 222 | 24 | 24 |
| B A + focus capture | no-throw | 236 | 103 | 103 |
| C B + nav + MVCP prepend | no-throw | 235 | 108 | 107 |
| D worst case (re-layout all cells per token + nav) | no-throw | 296 | 138 | 138 |
| E positive control (unconditional setState in CDU) | **THREW** | — | — | — |

E throws the exact Sentry error with the exact stack shape
(`getRootForUpdatedFiber` ← `enqueueUpdate` ← `enqueueSetState` ←
`Component.setState` ← `componentDidUpdate`) — so A–D no-throw is evidence,
not a harness blind spot. Counts stay linear in tokens; the window
stabilizes (updater returns null) whenever heights stop changing.

## 3. Mechanism finding (why the harness cannot throw with these ingredients)

Read against React 19.1's reconciler (`react-test-renderer/.../development.js`):
`getRootForUpdatedFiber` throws only when `nestedUpdateCount > 50`, and that
counter increments only across consecutive sync passes inside ONE
`flushSyncWorkAcrossRoots` cascade — i.e. 50 setStates scheduled from within
commit (componentDidUpdate / layout effects / render) without yielding.
VirtualizedList's only in-commit setState source is `componentDidUpdate` →
`_scheduleCellsToRenderUpdate` → hiPri → `_updateCellsToRender` → setState,
and the `_hiPriInProgress` guard caps that chain at ~2 passes (the second CDU
takes the 50 ms timeout branch). Every other list setState (`_onScroll`
pending-scroll decrement, `_onCellLayout`, `_onContentSizeChange`, focus
capture) is driven by discrete native events or timers, each starting a fresh
cascade with the counter reset. App-side audit: no `useLayoutEffect` anywhere
in `app/`/`src/`; `handleScroll`'s setStates are per-scroll-event (discrete);
`seekMessage` retries are 100 ms timers (max 20); `scrollToIndex`/
`scrollToOffset` are native-only. So with the modeled ingredients the loop
cannot nest 50 deep — the device trigger needs an unmodeled ingredient.
Candidates for the fix lead: (a) the Animated arithmetic node in the
symbolicated S frames (app code uses no Animated — check the full app tree /
navigation stack); (b) native event bursts interleaving with the 50 ms
batching timer while the JS thread is busy on a large list; (c) a second
sync-update source in the full app tree (MessageBubble/Markdown/Expo Router)
scheduling setState during the same commit cascade as the list.

## 4. APK identification (verified)

0.4.24 CI APK = GitHub Actions run **44205840647** (run_number **629**,
head `e2729965e956ce264e722c9f7514afc8176ddac2`, success, 2026-11-18T00:12:01Z),
artifact **`app-release`** (40,095,534 bytes zipped, not expired).
Downloaded artifact APK sha256:
`ae319f041e172f0f7fc20b8b907334e8b818856f4859441a584181e573e19a83`
(92,900,715 bytes) — **byte-identical to the v0.4.24 release asset**
`app-release.apk`. v0.4.24 tag `app.json`: version `0.4.24`, versionCode 51.
This is the build the S events came from (`0.4.24-ci.629`, debug id a6156e21
per #282). Local copy: `/tmp/s282/ci-apk/app-release.apk` (ephemeral; re-pull
with `gh run download 44205840647 --name app-release`).

## 5. Repo state

- `npm test`: 465 pass, 0 fail (after harness added; harness is a `.mjs`
  script, not in the `node --test` globs).
- `react-test-renderer@19.1.0` installed `--no-save`: `package.json` and
  `package-lock.json` untouched (verified by `git status`).
- Branch contains only: `scripts/sentry-s-282-harness.mjs` + this file.

## 6. Recommended next step (for the fix lead)

Device repro still needed for acceptance, but do not re-run the harness
ingredients expecting a different result — the guard analysis says they
cannot throw. Next: (1) parent arranges the FTL run per §1 (auth + backend in
one turn); (2) in parallel, investigate the Animated node in the S frames and
any full-tree sync-update source during the list's commit cascade — that is
where a 50-deep nesting can actually come from; (3) if the device repro also
fails to throw, treat S as a rare native-timing race and fix defensively at
the most plausible seam (e.g. cap `maintainVisibleContentPosition` churn
during streaming) with the harness as the regression guard for the
non-throw + counts behavior.
