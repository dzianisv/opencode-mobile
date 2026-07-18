// Pure derivation logic for the offline demo funnel's analytics properties
// (app/demo.tsx). Kept free of RN/PostHog imports — same pattern as
// analytics-classify.ts — so it is unit-testable with plain `node --test`
// and safe to import from the fully-offline demo screen.
import type { AnalyticsProps } from "./analytics"

/** Mirrors PermissionPrompt's `onReply` reply values (see
 *  src/components/chat/PermissionPrompt.tsx). */
export type DemoPermissionReply = "once" | "always" | "reject"

/** The demo funnel currently has exactly one step that "advances" past the
 *  initial script view: replying to the scripted permission prompt. Kept as
 *  a named constant (rather than inlined) so a future step can be added
 *  without hunting for magic numbers at each call site. */
export const DEMO_STEP_PERMISSION_REPLIED = { index: 1, name: "permission_replied" } as const

/** Properties for `demo_step_advanced` when the user replies to the
 *  scripted permission prompt. `reply` is a flat enum, not free text. */
export function demoStepAdvancedProps(reply: DemoPermissionReply): AnalyticsProps {
  return {
    step_index: DEMO_STEP_PERMISSION_REPLIED.index,
    step_name: DEMO_STEP_PERMISSION_REPLIED.name,
    reply,
  }
}

/** Outcome bucket for `demo_completed` — never the raw completion/denial
 *  text, just whether the scripted permission was allowed or denied. */
export function demoCompletedOutcome(reply: DemoPermissionReply): "completed" | "denied" {
  return reply === "reject" ? "denied" : "completed"
}

/** Properties for `demo_exited_to_connect`. The Connect CTA is reachable
 *  before the user has replied to the permission prompt, so this records
 *  whether they'd reached the end of the scripted flow first. */
export function demoExitedToConnectProps(reachedCompletion: boolean): AnalyticsProps {
  return { reached_completion: reachedCompletion }
}
