# Show HN: OpenCode Mobile – Android client for the opencode AI coding agent

**Title:** Show HN: OpenCode Mobile – drive your self-hosted AI coding agent from your phone

---

Hey HN,

I built a React Native / Expo Android app that lets you control a running [opencode](https://github.com/sst/opencode) session from your phone.

**What it does**

opencode (sst/opencode, MIT) is a terminal-based AI coding agent — you run it on your laptop or a server, it talks to Claude / GPT-4 / Gemini via your own API keys, and it writes, edits, and runs code through tool calls. The mobile app is a thin HTTP + SSE client that connects to the opencode server process. From your phone you can:

- Watch token-by-token streaming output as the agent reasons and codes
- Review inline file diffs before they're committed
- Approve or reject tool calls (file writes, shell commands) in real time
- Start, resume, and switch between sessions
- Connect over local Wi-Fi, Cloudflare Tunnel, ngrok, or Tailscale

**Why I built it**

I run long opencode sessions that outlast my desk time. I wanted to check in from the couch, approve a tool call, and let the agent keep going. Every alternative — SSH + terminal app, plain Claude/GPT apps — loses the structured session state. The opencode HTTP API is already there; the phone just needed a proper client.

**How it's built**

- React Native + Expo SDK 52, TypeScript throughout
- SSE streaming via `EventSource` polyfill (React Native lacks a native one)
- Diff rendering with a custom line-level parser; no WebView
- Biometric auth via `expo-local-authentication` gates the app and individual sends
- Credentials in iOS Keychain / Android Keystore via `expo-secure-store`
- CI builds a signed AAB on every tag via GitHub Actions + EAS

**What it is not**

It's not a standalone AI model and not a code editor. You need a running opencode server. If you already use opencode, setup is: `npm install -g opencode-ai && opencode serve`, then paste the URL in the app.

**Status**

Stable on Android. MIT licensed. Play Store listing live (internal track, working toward production). F-Droid submission in progress.

Source: https://github.com/dzianisv/opencode-mobile
Landing page: https://agentlabs.cc/opencode
Play Store: {{PLAY_URL}}

Happy to answer questions about the SSE streaming implementation, the Expo build pipeline, or the opencode API surface.
