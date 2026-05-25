# Contributing to OpenCode Mobile

Thank you for your interest in contributing. This document covers how to set up the dev environment, run the app, connect to a local opencode server for testing, code style, and the contribution process.

---

## Table of Contents

1. [Dev environment setup](#dev-environment-setup)
2. [Running on an emulator or device](#running-on-an-emulator-or-device)
3. [Connecting to a local opencode server](#connecting-to-a-local-opencode-server)
4. [Code style and linting](#code-style-and-linting)
5. [Filing a bug](#filing-a-bug)
6. [Proposing a feature](#proposing-a-feature)
7. [Submitting a pull request](#submitting-a-pull-request)
8. [Developer Certificate of Origin](#developer-certificate-of-origin)
9. [Code of Conduct](#code-of-conduct)

---

## Dev environment setup

**Prerequisites**

- Node.js 18 or 20 (check with `node --version`)
- npm 9+ or bun (bun is faster — install via `npm install -g bun`)
- Expo CLI: `npm install -g expo-cli` (optional — `npx expo` works too)
- For Android: Android Studio + an AVD or a physical device with USB debugging
- For iOS: macOS + Xcode 15+

**Clone and install**

```bash
git clone https://github.com/dzianisv/opencode-mobile.git
cd opencode-mobile
npm install       # or: bun install
```

**Environment variables**

Copy the example env file and fill in optional values (Sentry DSN is only needed for crash testing):

```bash
cp .env.example .env   # if the example doesn't exist yet, skip this
```

---

## Running on an emulator or device

**Android**

```bash
# Start an Android emulator from Android Studio first, then:
npx expo start --android

# Or run the dev build directly:
npm run android
```

**iOS (macOS only)**

```bash
npx expo start --ios

# Or:
npm run ios
```

**Expo Go (fastest for quick experiments)**

```bash
npx expo start
# Scan the QR code with Expo Go on your phone
```

> Note: Some native modules (biometric auth, secure store) require a development build and will not work in Expo Go. Use `npx expo run:android` / `npx expo run:ios` for a full dev build.

---

## Connecting to a local opencode server

You need a running [opencode](https://github.com/sst/opencode) server to test the app end-to-end.

```bash
# Install opencode
npm install -g opencode

# Start it in server mode on all interfaces
OPENCODE_SERVER_PASSWORD=devpassword opencode serve --hostname 0.0.0.0 --port 4096
```

In the app, add a connection:
- **Emulator on same machine**: `http://10.0.2.2:4096` (Android AVD) or `http://localhost:4096` (iOS Simulator)
- **Physical device on same LAN**: `http://<your-machine-LAN-IP>:4096`
- **Tunnel for remote testing**: run `npx cloudflared tunnel --url http://localhost:4096` and use the provided HTTPS URL

---

## Code style and linting

The project uses ESLint and TypeScript strict mode. Run before committing:

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript type check (tsc --noEmit)
```

There is no auto-formatter enforced by CI yet (Prettier is configured but optional). Keeping existing style consistent is more important than personal preference.

Key conventions:
- Components: functional, with typed props via TypeScript `interface`
- State: Zustand stores in `src/stores/`
- API calls: through the SDK client in `src/lib/`
- Screens: file-based routing via Expo Router under `app/`

---

## Filing a bug

Use the [Bug Report template](https://github.com/dzianisv/opencode-mobile/issues/new?template=bug_report.md).

Please include:
- App version (visible in Settings screen)
- opencode server version (`opencode --version`)
- OS and version (e.g. Android 14, iOS 17.4)
- Steps to reproduce
- What you expected vs. what happened
- Crash logs or screenshots if available

**Security vulnerabilities**: do NOT file public issues. See [SECURITY.md](SECURITY.md).

---

## Proposing a feature

Use the [Feature Request template](https://github.com/dzianisv/opencode-mobile/issues/new?template=feature_request.md) or start a [GitHub Discussion](https://github.com/dzianisv/opencode-mobile/discussions) if you want to explore the idea before opening a formal issue.

---

## Submitting a pull request

1. Fork the repo and create a branch off `main`: `git checkout -b feat/my-feature`
2. Make your changes. Keep commits focused — one logical change per commit.
3. Ensure `npm run lint` and `npm run typecheck` pass.
4. If you changed UI, include a screenshot in the PR description.
5. Open the PR against `dzianisv/opencode-mobile main`. Fill in the PR template.
6. A maintainer will review within a few business days.

PRs that add new npm dependencies will receive extra scrutiny — keep the bundle lean.

---

## Developer Certificate of Origin

This project does not require a formal Contributor License Agreement (CLA). By submitting a pull request you confirm that:

- You wrote the contribution yourself, or have the right to submit it under the MIT License.
- You grant VIBE TECHNOLOGIES, LLC and the project's users a perpetual, worldwide, royalty-free license under the MIT License terms.

That's it — no paperwork.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect. Report issues to [support@vibebrowser.app](mailto:support@vibebrowser.app).
