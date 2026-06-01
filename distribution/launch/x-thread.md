# X (Twitter) Launch Thread

Post as a thread. Tweet 1 is the hook — quote-tweet or reply chain for 2–7.

---

**Tweet 1 (hook)**
```
I built an Android app that connects to your self-hosted AI coding agent.

Token-by-token streaming. Inline diff viewer. Tool call approval from your phone.

OpenCode Mobile — MIT, free, no backend of mine.

🧵
```
(228 chars)

---

**Tweet 2 (the problem)**
```
The problem: opencode runs a long coding session on my server. I leave my desk.

SSH + terminal loses the session UX. Generic AI chat apps have no concept of file diffs or tool call approval.

I needed a real client, not a workaround.
```
(238 chars)

---

**Tweet 3 (how it works)**
```
How it works:

opencode exposes an HTTP + SSE API. The app speaks that — streaming output, session state, diffs, tool calls.

Your code stays on your server. Your AI provider keys stay on your server. The app is a thin client. No proxy, no middleman.
```
(252 chars)

---

**Tweet 4 (features)**
```
What you get:

→ Watch your AI agent generate code token by token
→ See every file diff before it's written
→ Approve or reject shell commands and file writes
→ Manage multiple sessions
→ Connect via Tailscale, Cloudflare Tunnel, ngrok, or local network
```
(255 chars)

---

**Tweet 5 (technical credibility)**
```
Works with any model opencode supports: Claude, GPT-4, Gemini, or local LLMs via any OpenAI-compatible endpoint.

Your keys. Your hardware. Your inference budget.
```
(163 chars)

---

**Tweet 6 (OSS / trust)**
```
MIT licensed. Source at github.com/dzianisv/opencode-mobile

No subscription. No ads. Sentry crash reporting is opt-in and off by default. Credentials live in Android Keystore.

F-Droid submission in progress.
```
(209 chars)

---

**Tweet 7 (CTA)**
```
Now on Android.

Play Store: {{PLAY_URL}}
Source + docs: github.com/dzianisv/opencode-mobile
Landing page: https://agentlabs.cc/opencode

If you run opencode, give it a try. Issues and PRs welcome.
```
(196 chars — adjust after filling {{PLAY_URL}})
