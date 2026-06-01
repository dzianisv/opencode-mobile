# Reddit Launch Posts

---

## r/androiddev

**Flair:** App Showcase

**Title:** I built a React Native app that connects to a self-hosted AI coding agent — streaming diffs, tool call approval, biometric auth

**Body:**

Hey r/androiddev,

Shipping a new open-source app: OpenCode Mobile, an Android client for the [opencode](https://github.com/sst/opencode) AI coding agent.

**What the app does technically:**

opencode is a CLI tool that runs an AI coding agent (Claude, GPT-4, Gemini — your keys) with a local HTTP + SSE API. The mobile app speaks that API and gives you a proper native UI for sessions running on your workstation or server.

The interesting engineering bits:
- SSE streaming over `EventSource` polyfill (React Native has no native EventSource — the web polyfill works but needs patching for Android's OkHttp redirect behavior)
- Diff viewer is a custom line-level parser rendering into a FlatList, not a WebView — keeps it snappy and allows proper dark-mode theming
- Tool call approval is a bottom sheet that interrupts the stream and waits for user input before the agent proceeds
- Biometric auth (`expo-local-authentication`) gates both app open and individual message sends
- Credentials in Android Keystore via `expo-secure-store`
- Built with Expo SDK 52, TypeScript, signed AAB on every tag via GitHub Actions + EAS

**Stack:** React Native / Expo, TypeScript, React Query for server state, Zustand for local state, Sentry for crash reporting (opt-in, off by default).

MIT licensed, source at https://github.com/dzianisv/opencode-mobile.

Play Store: {{PLAY_URL}}
Landing page: https://agentlabs.cc/opencode

Happy to get into any of the implementation details — the SSE + approval flow coordination was the trickiest part.

---

## r/selfhosted

**Flair:** Project

**Title:** OpenCode Mobile – Android client for your self-hosted opencode AI coding agent (MIT, no backend, your keys)

**Body:**

I run [opencode](https://github.com/sst/opencode) on my home server for AI-assisted coding. It's great at the desk. Away from the desk, I had nothing.

So I built a mobile client.

**What it is:**

OpenCode Mobile connects to your own opencode server over whatever you already use to reach home — local Wi-Fi, Cloudflare Tunnel, Tailscale, ngrok. You type the server URL into the app and that's your entire infrastructure footprint. No cloud service of mine touches your traffic.

- Token-by-token streaming chat from your server
- Inline diff viewer for every file change the agent proposes
- Tool call approval — you explicitly approve file writes and shell commands before they execute
- Multiple saved connections (home server, work VPN, etc.)
- Biometric unlock
- MIT licensed, Android source at https://github.com/dzianisv/opencode-mobile

**What it is not:**

Not a standalone AI model. You need opencode running: `npm install -g opencode-ai && OPENCODE_SERVER_PASSWORD=yourpassword opencode serve --hostname 0.0.0.0 --port 4096`. Your API keys stay on your server.

No accounts, no analytics, no proprietary backend. Sentry crash reporting is opt-in and off by default.

Play Store: {{PLAY_URL}}
F-Droid: {{FDROID_URL}} (submission in progress)
Landing page: https://agentlabs.cc/opencode

---

## r/LocalLLaMA

**Flair:** Project

**Title:** I built an Android app to control opencode from my phone — works with local LLMs via your existing opencode server config

**Body:**

If you run [opencode](https://github.com/sst/opencode) with a local model (ollama, LM Studio, or any OpenAI-compatible endpoint), OpenCode Mobile gives you a mobile client for those sessions.

**The setup:**

opencode supports any OpenAI-compatible API via its provider config. Point it at your local model, run `opencode serve`, and the mobile app connects over Tailscale / local network / tunnel. All inference stays on your hardware — the app is just a UI.

**What you get on the phone:**

- Streaming output as your local model generates (token by token via SSE)
- File diff viewer — see what the agent is changing before approving
- Tool call approval UI — explicitly OK file writes and shell commands
- Works with any model opencode supports: local LLMs, Claude, GPT-4, Gemini, or mixed

**Source / license:** MIT, https://github.com/dzianisv/opencode-mobile

Play Store: {{PLAY_URL}}
Landing page: https://agentlabs.cc/opencode

I'm interested in feedback from anyone running local models — particularly around latency on the SSE stream when the model is slow. Does the streaming UI feel OK when tokens come in at 3–5/sec?
