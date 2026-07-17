# Play Store ASO Listing — OpenCode Mobile

**Package:** cc.agentlabs.opencode
**Generated:** 2026-06-20
**Based on:** app v0.4+, ASO audit findings from aso-audit.md

> **Superseded:** this draft was never merged back into the canonical listing doc. `distribution/play-listing.md` is the file actually used to fill Play Console (see `distribution/strategy.md`) and now carries the up-to-date, ASO-polished, model-agnostic copy (including this doc's connection-options section and screenshot captions). This file is kept for historical rationale only — do not copy-paste from here; it also still named a dated model ("GPT-4") until this note was added.

---

## 1. App Title (max 50 chars)

```
OpenCode: AI Coding Agent for Developers
```
(41/50 chars)

**Rationale:** Leads with the brand name, immediately followed by the two highest-value keywords ("AI Coding Agent") and an audience qualifier ("for Developers"). The 50-char Google Play title field (larger than the 30-char limit that applies when the field is shared with subtitle) lets us pack in more signal than the older 30-char title. If the console enforces 30 chars, fall back to:

```
OpenCode: AI Coding Agent
```
(25/30 chars — primary option from aso-audit.md)

---

## 2. Short Description (max 80 chars)

```
AI coding agent in your pocket. Stream, diff, approve — free & open source.
```
(76/80 chars)

**Rationale:** Opens with the primary keyword phrase. The three action verbs ("Stream, diff, approve") map directly to the three headline features without requiring "Read More." "Free & open source" is a strong conversion signal for developer audiences. Avoids the word "free" as the very first word (Play policy) by placing it after the keyword.

---

## 3. Full Description (max 4000 chars)

```
OpenCode Mobile is the AI coding agent companion built for developers who self-host opencode. Connect your Android phone to your opencode server and run AI-powered coding sessions from anywhere — watch diffs land, approve tool calls, and guide Claude, GPT, Gemini, or any other model you configure in real time.

<b>WHAT IT DOES</b>
OpenCode Mobile is a thin client for the opencode CLI (github.com/sst/opencode). It speaks the opencode HTTP + SSE API, so every AI coding session on your workstation or server is instantly reachable from your phone. All AI model calls go through your own server — your API keys, your code, your infrastructure. Nothing passes through our servers.

<b>CORE FEATURES</b>
• Real-time streaming chat — watch your AI coding assistant think and respond token by token, just like a desktop terminal
• File diff viewer — see every code change the agent proposes before you approve it; no surprise rewrites
• Tool-call approval — review and approve or reject file writes, shell commands, and other agent actions from your phone
• Multi-session management — start, resume, and switch between AI coding sessions without losing context
• Biometric unlock — fingerprint or face unlock keeps your sessions private on shared or lost devices

<b>CONNECTION OPTIONS</b>
Connect any way that works for your setup:
• Local Wi-Fi — zero config when phone and dev machine are on the same network
• Tailscale — connect securely across networks without opening ports; ideal for remote work
• Cloudflare Tunnel — public HTTPS endpoint for your opencode server in minutes
• ngrok — quick ad-hoc tunnels for demos or one-off remote sessions
• opencode Cloud — managed hosting coming soon

<b>WHO IT'S FOR</b>
• Developers running opencode on their workstation who want to check in from their phone
• Engineers away from their desk who want to review or steer long-running AI coding jobs
• Teams self-hosting AI developer tools who want a polished mobile interface
• Open-source contributors who want a free, MIT-licensed alternative to proprietary AI coding apps

<b>WHAT IT IS NOT</b>
• Not a standalone AI model — you bring your own opencode server (which connects to Claude, GPT, Gemini, or local LLMs via your API keys)
• Not a code editor — it pairs with your existing IDE and terminal workflow
• Not a subscription app — free, open-source, MIT licensed, no ads, no telemetry you did not opt into

<b>GETTING STARTED</b>
Install opencode on any machine:
  npm install -g opencode-ai
  opencode serve

Then open the app, tap Connect, paste your server URL, and you're in. Your AI coding agent is now on your phone.

<b>OPEN SOURCE</b>
OpenCode Mobile is MIT licensed. Source code, issue tracker, and community at github.com/dzianisv/opencode-mobile. Contributions welcome.

<b>PRIVACY</b>
OpenCode Mobile does not collect your code, prompts, or AI responses. All traffic goes directly from the app to YOUR opencode server — never through our infrastructure. Optional Sentry crash reporting collects only device model, OS version, and stack traces (no message content).

Support: support@agentlabs.cc
Issues: github.com/dzianisv/opencode-mobile/issues
Source: github.com/dzianisv/opencode-mobile
```

(~3050/4000 chars — room to expand with testimonials or changelog highlights as they become available)

---

## 4. Keyword Suggestions

For Google Play metadata fields and to guide copy iteration. Target ~100 chars per submission slot where applicable.

```
AI coding agent, coding assistant, developer tools, opencode, self-hosted AI, code review mobile
```
(97 chars)

**Extended keyword list (prioritized):**

| Keyword | Search intent | Priority |
|---|---|---|
| `AI coding agent` | Primary — maps exactly to what the app is | Critical |
| `coding assistant` | Broad — captures users looking for any AI coding help | Critical |
| `opencode` | Brand — captures existing opencode CLI users | High |
| `developer tools` | Category — broad developer audience | High |
| `self-hosted AI` | Qualifier — filters for our target user (devs who self-host) | High |
| `mobile coding` | Feature — "code from phone" niche | Medium |
| `AI code review` | Feature — maps to diff viewer | Medium |
| `remote development` | Use case — devs working off-device | Medium |
| `LLM client` | Technical — early-adopter / OSS audience | Medium |
| `Claude mobile` | Brand transfer — Anthropic Claude users | Medium |
| `AI terminal` | Technical — CLI-oriented devs | Low |
| `Tailscale developer` | Long-tail — captures Tailscale users looking for dev tools | Low |

**Keywords to avoid (Play policy):**
- `Copilot`, `Cursor`, `Codeium` — competitor brand names
- `#1 AI coding app`, `best AI developer tool` — superlative claims prohibited
- `free AI` as a standalone phrase — policy sensitive in title/short desc
- `ChatGPT` — OpenAI brand mark

---

## 5. Screenshot Captions (5 screenshots)

One caption per screenshot, optimized for the Play Store screenshot carousel. Captions appear as overlay text; keep them short and benefit-led.

### Screenshot 1 — Connection Setup
**Screen to show:** The "Add Connection" / server URL entry screen with connection type options (Wi-Fi, Tailscale, Cloudflare Tunnel, ngrok) visible.

**Caption:**
```
Connect to your opencode server — Wi-Fi, Tailscale, or tunnel
```

### Screenshot 2 — Live Streaming Chat Session
**Screen to show:** Active chat session with an AI response streaming in, showing partial token-by-token output and a code block mid-render.

**Caption:**
```
Watch your AI coding agent think in real time, token by token
```

### Screenshot 3 — File Diff Viewer
**Screen to show:** Diff view for a proposed code change with colored additions/removals and an Approve / Reject button visible.

**Caption:**
```
Review every file change before it lands — approve or reject
```

### Screenshot 4 — Tool-Call Approval Dialog
**Screen to show:** Tool-call approval modal showing a pending shell command or file write with Approve / Reject controls.

**Caption:**
```
Stay in control: approve shell commands and file writes from your phone
```

### Screenshot 5 — Session List
**Screen to show:** Session list tab showing multiple AI coding sessions with timestamps and status indicators.

**Caption:**
```
Manage multiple AI coding sessions — resume any job from anywhere
```

---

## Notes for Play Console entry

- Paste the full description using HTML bold tags (`<b>...</b>`) — Play Console renders these as bold section headers.
- Type `&` as a literal ampersand in Play Console forms, not as `&amp;`.
- Screenshot captions are entered per-screenshot in the "Add captions" field of the Graphics section; they are optional but improve accessibility and carousel CVR.
- Keyword list is not a direct Play Console field — use it to guide copy revisions and A/B tests via Play Store Experiments.
