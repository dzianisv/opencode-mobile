# Handoff: OpenCode Mobile App

## Status: CUA E2E Tests Working, v0.2.0 Release Triggered

## What Was Done

### 1. CUA (Computer-Use Agent) E2E Test Infrastructure
- Built `scripts/android-cua-smoke.py` — a vision-LLM-powered Android E2E test that drives the app via ADB screenshots + AI actions
- Two scenarios pass reliably: `send_message` (7 steps) and `multi_turn` (13 steps)
- Added custom `{"type": "send"}` action that auto-locates the send button via uiautomator XML (solves coordinate accuracy issues with vision models)
- Uses **Azure AI Services gpt-5.4** for vision inference

### 2. CI/CD
- `.github/workflows/cua-smoke.yml` — GitHub Actions workflow for emulator + CUA test
- `.github/workflows/build.yml` — Builds APK, creates GitHub Release on tag push
- `.github/workflows/publish-play-store.yml` — Fastlane Play Store publish
- GitHub secrets set: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`
- Tagged `v0.2.0` — CI build + release workflow triggered

### 3. App Features (prior sessions)
- SSE reconnect with exponential backoff
- Notification support
- Message deduplication
- Biometric auth gate (disabled on emulator)
- Server connection management UI

## Key Technical Details

### Azure AI Services (LLM API)
- **Correct endpoint**: `https://info-mjnxtt51-eastus2.cognitiveservices.azure.com`
- **DO NOT USE**: `vibe-dev-ai.cognitiveservices.azure.com` (has no deployments, only model catalog)
- **Env file**: `~/.env.d/azure-openai.env`
- **Available models**: gpt-5.4, gpt-5.2, gpt-5.1, gpt-4.1, grok-4, deepseek-r1, kimi-k2.5
- **API quirk**: Use `max_completion_tokens` (NOT `max_tokens`) for gpt-5.x models

### Android Emulator
- SDK at `/tmp/android-sdk/` (may need reinstall if /tmp is cleared)
- AVD name: `test`, API 34 x86_64, KVM required
- Start: `emulator -avd test -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot`
- Package: `ai.opencode.mobile`

### CUA Script Learnings
- Vision models (gpt-5.4) consistently mis-estimate Y coordinates by ~80px for bottom-of-screen elements
- Solution: `{"type": "send"}` action uses uiautomator XML to find the rightmost clickable element in the bottom bar
- Enter key inserts newline in this app (doesn't send) — model must dismiss keyboard + tap send button
- Screen resolution (1080x2400) included in prompt context helps coordinate accuracy
- Screenshot retry (3 attempts, 30s timeout) needed for emulator under load

### Server Connection
- OpenCode server: `100.108.64.76:4096` (Tailscale, hostname `openclaw-dev-1`)
- Must dismiss keyboard before tapping Connect button (keyboard obscures it)
- Model: `gpt-5.3-chat-latest` (via GitHub Copilot provider)

## What's Next

1. **Verify v0.2.0 release** — check CI at https://github.com/dzianisv/opencode-mobile/actions
2. **Run CUA in CI** — the `cua-smoke.yml` workflow needs a running opencode server to connect to (currently targets Tailscale IP which won't be reachable from GitHub runners). Options:
   - Mock server in CI
   - Use a public opencode server endpoint
   - Run as self-hosted runner on the dev VM
3. **Add accessibility labels** — add `content-desc="Send"` to the send button in the app for better CUA reliability
4. **More scenarios** — settings toggle, reconnect after server restart, slash commands

## Connection Diagnostics (added in feat/connection-diagnostics-sentry)

When a connect attempt fails, the app now runs an **active triage probe** instead of
showing a generic error. It classifies the cause: `malformed-url`, `no-internet`,
`server-unreachable`, `health-failed`, `tls-error`, `timeout`. The dialog shows a
plain-English summary plus a **Share report** button (copies a full report —
target URL, per-probe results, device/app info, recent logs — to clipboard + share sheet).

- Code: `src/lib/diagnostics.ts` (probe + report), `src/lib/logbuffer.ts` (ring buffer),
  `src/lib/sentry.ts` (auto-upload wrapper).
- **Sentry auto-upload** is opt-in via env var: set `EXPO_PUBLIC_SENTRY_DSN` at build time.
  Without it, Sentry is a no-op and only the in-app Share report works (fully offline).
  For source-map upload at build, also set `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`.
- The probe runs on-device, so it reports the *phone's* real network reality —
  unlike the co-located emulator, it can distinguish a true remote-peer tailnet failure.

## Repo & Auth
- Repo: `dzianisv/opencode-mobile`
- GitHub auth: `source ~/.env.d/github-dzianisv.env`
- Upstream issue: `anomalyco/opencode#10288`
