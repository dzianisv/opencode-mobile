// Pure, hardcoded data for the offline "Try a demo" flow (app/demo.tsx).
// No React Native imports, no store access, no network — unit-testable with
// node --test, and safe to import from a screen that must never touch a
// real connection. The shapes match src/lib/sdk.ts's Message/Part exactly
// so the demo can render through the SAME presentational components
// (MessageBubble, ToolCallCard, DiffView, PermissionPrompt) real sessions
// use, instead of a parallel fake UI.
import type { Message, Part } from "./sdk"

export const DEMO_SESSION_ID = "demo-session"

const USER_MESSAGE_ID = "demo-msg-user"
const ASSISTANT_MESSAGE_ID = "demo-msg-assistant"
const COMPLETION_MESSAGE_ID = "demo-msg-completion"
const DENIAL_MESSAGE_ID = "demo-msg-denial"

export interface DemoPermission {
  id: string
  permission: string
  patterns: string[]
}

export interface DemoScript {
  messages: [Message, Message]
  parts: Record<string, Part[]>
  permission: DemoPermission
}

/**
 * Builds the scripted user->assistant exchange shown on first render:
 * a user bug report, brief assistant reasoning, a search tool call, and an
 * edit tool call whose diff renders via ToolCallCard -> EditDetail ->
 * DiffView once expanded. `now` is injectable for deterministic tests.
 */
export function buildDemoScript(now: number = Date.now()): DemoScript {
  const userMessage: Message = {
    id: USER_MESSAGE_ID,
    sessionID: DEMO_SESSION_ID,
    role: "user",
    time: { created: now - 9000 },
  }

  const assistantMessage: Message = {
    id: ASSISTANT_MESSAGE_ID,
    sessionID: DEMO_SESSION_ID,
    role: "assistant",
    time: { created: now - 8000, completed: now - 1000 },
    modelID: "claude-opus-4-6",
    providerID: "anthropic",
    tokens: { input: 812, output: 246 },
    cost: 0.0143,
  }

  const parts: Record<string, Part[]> = {
    [USER_MESSAGE_ID]: [
      {
        id: "demo-part-user-text",
        messageID: USER_MESSAGE_ID,
        type: "text",
        text: "The login button doesn't respond on Android when the keyboard is open — can you fix it?",
      },
    ],
    [ASSISTANT_MESSAGE_ID]: [
      {
        id: "demo-part-reasoning",
        messageID: ASSISTANT_MESSAGE_ID,
        type: "reasoning",
        text: "The tap handler on the login button isn't firing while the Android keyboard is open — likely the surrounding scroll view is swallowing the first tap to dismiss the keyboard instead of forwarding it to the button. Let me check the handler and confirm.",
      },
      {
        id: "demo-part-text-search",
        messageID: ASSISTANT_MESSAGE_ID,
        type: "text",
        text: "Found it — keyboardShouldPersistTaps isn't set on the form's scroll view, so Android eats the first tap. Searching for the file...",
      },
      {
        id: "demo-part-tool-search",
        messageID: ASSISTANT_MESSAGE_ID,
        type: "tool",
        tool: "grep",
        callID: "demo-call-search",
        state: {
          status: "completed",
          title: "Search: onPress in LoginButton",
          input: { pattern: "onPress", path: "src/components/LoginButton.tsx" },
          output: "12: onPress={handleLogin}",
          time: { start: now - 6500, end: now - 6200 },
        },
      },
      {
        id: "demo-part-text-edit",
        messageID: ASSISTANT_MESSAGE_ID,
        type: "text",
        text: 'Adding keyboardShouldPersistTaps="handled" so taps reach the button even while the keyboard is up.',
      },
      {
        id: "demo-part-tool-edit",
        messageID: ASSISTANT_MESSAGE_ID,
        type: "tool",
        tool: "edit",
        callID: "demo-call-edit",
        state: {
          status: "completed",
          title: "Edit src/components/LoginButton.tsx",
          input: {
            filePath: "src/components/LoginButton.tsx",
            oldString: "<ScrollView contentContainerStyle={styles.form}>",
            newString: '<ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">',
          },
          time: { start: now - 5000, end: now - 4700 },
        },
      },
    ],
  }

  const permission: DemoPermission = {
    id: "demo-permission-1",
    permission: "bash",
    patterns: ["npm test -- LoginButton"],
  }

  return { messages: [userMessage, assistantMessage], parts, permission }
}

/** Follow-up assistant message shown after the demo permission is allowed. */
export function buildDemoCompletionMessage(now: number = Date.now()): { message: Message; parts: Part[] } {
  return {
    message: {
      id: COMPLETION_MESSAGE_ID,
      sessionID: DEMO_SESSION_ID,
      role: "assistant",
      time: { created: now, completed: now },
      modelID: "claude-opus-4-6",
      providerID: "anthropic",
    },
    parts: [
      {
        id: "demo-part-completion",
        messageID: COMPLETION_MESSAGE_ID,
        type: "text",
        text: "Tests passed — the login button now responds correctly with the keyboard open. Try it yourself with your own server.",
      },
    ],
  }
}

/** Follow-up assistant message shown after the demo permission is denied. */
export function buildDemoDenialMessage(now: number = Date.now()): { message: Message; parts: Part[] } {
  return {
    message: {
      id: DENIAL_MESSAGE_ID,
      sessionID: DEMO_SESSION_ID,
      role: "assistant",
      time: { created: now, completed: now },
      modelID: "claude-opus-4-6",
      providerID: "anthropic",
    },
    parts: [
      {
        id: "demo-part-denial",
        messageID: DENIAL_MESSAGE_ID,
        type: "text",
        text: "No changes were made — permission was denied. You're always in control on your own server too.",
      },
    ],
  }
}
