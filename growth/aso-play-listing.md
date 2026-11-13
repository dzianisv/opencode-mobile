# ASO — Google Play listing for OpenCode Mobile

Status: DRAFT, prepared 2026-11-14. Not applied: applying it waits on the owner's
Play Console sign-in (Work Log row "Unblock Play reviews — Den's one-time browser sign-in").
Package: cc.agentlabs.opencode. Current live listing verified by reading the Play page 2026-11-13.

## Live listing today (verified)

- Title: "OpenCode: AI Coding Agent" (25 chars). No "Mobile" in the title, no "Android" keyword.
- Short description: "AI coding agent in your pocket. Review diffs, approve tool calls, on your phone." (80 chars, field is full)
- Rating: 4.65 stars from 139 ratings.
- Long description: good structure (what it does, features, connections, who it is for, getting started, open source, privacy).

## Proposed title (30 chars max)

- "OpenCode Mobile: AI Coding" (26 chars) — carries the brand name people search for
  ("OpenCode Mobile") plus the "AI coding" keyword. Replaces "OpenCode: AI Coding Agent".
- Do not use "OpenCode Mobile — AI Coding Agent" (33 chars, over the limit).

## Proposed short description (80 chars max)

- Keep the current one unchanged: "AI coding agent in your pocket. Review diffs, approve tool calls, on your phone."
  It is exactly 80 chars, reads as conversion copy, and already contains "AI coding agent".

## Proposed long description (4000 chars max, all indexed)

Keep the live long description. It already works. Two small changes only:

1. First paragraph: keep as is — it contains opencode, Android, AI coding, self-hosted,
   and phone in the first 200 words.
2. Add one line at the end, under PRIVACY: "Android only. There is no iOS version."

Full text (copy from the live listing, with the added line):

OpenCode Mobile is the AI coding agent companion built for developers who self-host opencode.
Connect your Android phone to your opencode server and run AI-powered coding sessions from
anywhere — watch diffs land, approve tool calls, and guide Claude, GPT-4, or Gemini in real time.

WHAT IT DOES
OpenCode Mobile is a thin client for the opencode CLI (github.com/sst/opencode). It speaks the
opencode HTTP + SSE API, so every AI coding session on your workstation or server is instantly
reachable from your phone. All AI model calls go through your own server — your API keys, your
code, your infrastructure. Nothing passes through our servers.

CORE FEATURES
- Real-time streaming chat — watch your AI coding assistant think and respond token by token, just like a desktop terminal
- File diff viewer — see every code change the agent proposes before you approve it; no surprise rewrites
- Tool-call approval — review and approve or reject file writes, shell commands, and other agent actions from your phone
- Multi-session management — start, resume, and switch between AI coding sessions without losing context
- Biometric unlock — fingerprint or face unlock keeps your sessions private on shared or lost devices

CONNECTION OPTIONS
- Local Wi-Fi — zero config when phone and dev machine are on the same network
- Tailscale — connect securely across networks without opening ports
- Cloudflare Tunnel — public HTTPS endpoint for your opencode server in minutes
- ngrok — quick ad-hoc tunnels for demos or one-off remote sessions

WHO IT IS FOR
- Developers running opencode on their workstation who want to check in from their phone
- Engineers away from their desk who want to review or steer long-running AI coding jobs
- Teams self-hosting AI developer tools who want a polished mobile interface
- Open-source contributors who want an MIT-licensed alternative to proprietary AI coding apps

GETTING STARTED
Install opencode on any machine: npm install -g opencode-ai, then run opencode serve. Open the app,
tap Connect, paste your server URL. Your AI coding agent is now on your phone.

OPEN SOURCE
MIT licensed. Source code at github.com/dzianisv/opencode-mobile. Contributions welcome.

PRIVACY
OpenCode Mobile does not collect your code, prompts, or AI responses. All traffic goes from the app
directly to YOUR opencode server. Optional Sentry crash reporting collects only device model, OS version,
and stack traces. Android only. There is no iOS version.

## Keywords to win (score monthly: relevance, difficulty, volume)

- opencode mobile, opencode android, opencode client, opencode app
- ai coding agent, ai coding, coding agent, mobile coding agent
- claude code android, code from phone, self-hosted ai coding
- ai coding agent android, opencode android client

## Screenshots (first 3 carry search — already live on the site)

1. Connect to your opencode server (biggest promise: your agent, on your phone)
2. Sessions load from your server (core interaction)
3. Send tasks to your AI agent (differentiator: you steer, it codes)
Ship at least 5 screenshots plus the 1024x500 feature graphic. One caption of 5 to 7 words each.

## How to apply (owner step, after sign-in)

1. Play Console > OpenCode: AI Coding Agent > Store presence > Main store listing.
2. Paste the title, short description, and long description above. Save.
3. Record the date and the rating/downloads before and after in this file, so the next
   iteration can tell what moved.
