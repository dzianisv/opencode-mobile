# Product Hunt Launch

---

## Tagline (60 chars max)

```
Drive your self-hosted AI coding agent from your phone
```
(55 chars)

---

## Description

OpenCode Mobile is the Android client for [opencode](https://github.com/sst/opencode) — the open-source AI coding agent. Connect to your own opencode server over local Wi-Fi, Cloudflare Tunnel, Tailscale, or ngrok, and control AI-powered coding sessions from anywhere.

You get token-by-token streaming output, a full inline diff viewer for every file change the agent proposes, and an explicit tool call approval UI so you decide what gets written or executed. Your code, your API keys, your server — the app is a pure thin client that never proxies your traffic through any backend of ours.

Free and MIT licensed. No subscription, no ads, no telemetry you didn't opt into.

**Links:**
- Play Store: {{PLAY_URL}}
- F-Droid: {{FDROID_URL}}
- Source: https://github.com/dzianisv/opencode-mobile
- Landing page: https://agentlabs.cc/opencode

---

## First Comment (Maker Comment)

Hey Product Hunt! I'm the developer of OpenCode Mobile.

I built this because I run long opencode sessions on my home server and needed a way to check in from my phone — not just to read output, but to actually approve tool calls and steer the agent. Terminal apps over SSH lose the session structure. Generic AI chat apps have no concept of file diffs or tool calls. So I built a proper native client.

**A few things worth knowing:**

- This is a client for [opencode](https://github.com/sst/opencode) (by the sst team, MIT). You need opencode running somewhere — your laptop, a home server, a VPS. Setup is `npm install -g opencode-ai && opencode serve`. Then paste the URL into the app.
- Supports any connection method you already use to reach home: local network, Tailscale, Cloudflare Tunnel, ngrok.
- Works with any model opencode supports: Claude, GPT-4, Gemini, or local LLMs via any OpenAI-compatible endpoint.
- MIT licensed. Source is public at https://github.com/dzianisv/opencode-mobile. F-Droid submission in progress.

Happy to answer questions about the implementation — particularly the SSE streaming + tool call approval flow, which was the trickiest part to get right. Thanks for hunting it!

---

## Gallery Shot List

Produce these 6 screenshots before PH launch (1080×1920 portrait, dark theme, real app UI — no mockups):

1. **Connection setup screen** — the "Add Connection" wizard with URL and password fields visible. Caption overlay: "Connect to your own opencode server."
2. **Active streaming session** — streaming AI response mid-generation, partial text visible. Caption: "Token-by-token streaming from your server."
3. **Diff viewer** — inline side-by-side diff of a real code change (green/red lines). Caption: "Review every file change before it lands."
4. **Tool call approval dialog** — bottom sheet showing a pending shell command awaiting approval. Caption: "You approve every action the agent takes."
5. **Session list** — list of multiple sessions with names and timestamps. Caption: "All your coding sessions in one place."
6. **Feature graphic / hero** (1270×760 for PH thumbnail) — dark background (#0F172A), app icon left, device mockup right showing streaming chat, headline: "AI Coding Agent. In Your Pocket."
