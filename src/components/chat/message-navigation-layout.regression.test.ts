// Docked-strip layout guard for issue #214.
//
// Follow the existing source-level RN regression pattern: node:test cannot
// render native layouts. This guard fails on the floating-controls layout
// PR #215 shipped (controls drawn over message text, QA-rejected
// 2026-10-01) and on the paddingRight:76 gutter remediation: the strip
// must live in-flow below the list, never overlap content, and reuse the
// auto-follow threshold instead of duplicating it. Changed-head
// device/keyboard acceptance is still required.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("../../../app/session/[id].tsx", import.meta.url), "utf8")

test("navigation strip is docked in-flow below the list, above StatusIndicator", () => {
  const strip = source.indexOf("[s.navStrip")
  assert.ok(strip >= 0, "docked navigation strip must exist")
  const listStart = source.indexOf("<FlatList")
  const status = source.indexOf("<StatusIndicator")
  assert.ok(listStart >= 0 && status >= 0, "list and StatusIndicator must exist")
  assert.ok(listStart < strip && strip < status, "strip must sit between the message list and StatusIndicator")
})

test("no floating navigation controls and no content gutter", () => {
  assert.doesNotMatch(source, /scrollBtn/, "floating Latest button (scrollBtn) must be removed")
  assert.doesNotMatch(source, /scrollControls/, "floating control stack must be removed")
  const messageList = source.match(/messageList:\s*\{([^}]+)\}/)?.[1] ?? ""
  assert.doesNotMatch(
    messageList,
    /paddingRight:\s*76|paddingLeft:\s*76/,
    "PR #215 gutter must not narrow messages",
  )
  assert.doesNotMatch(source, /contentOffset\.y\s*>\s*200/, "strip visibility must reuse shouldShowScrollButton, not a hardcoded 200")
  assert.match(source, /shouldShowScrollButton\(contentOffset\.y\)/, "strip visibility must reuse the auto-follow threshold")
})

test("strip is 56pt with a hairline top border and 44pt hit targets", () => {
  const strip = source.match(/navStrip:\s*\{([^}]+)\}/)?.[1] ?? ""
  assert.match(strip, /height:\s*56/, "strip must be 56pt tall")
  assert.match(strip, /borderTopWidth:\s*1/, "strip must have a hairline top border")
  const pill = source.match(/navPill:\s*\{([^}]+)\}/)?.[1] ?? ""
  const height = Number(pill.match(/minHeight:\s*(\d+)/)?.[1])
  assert.ok(height >= 44, "navigation pills must keep 44pt hit targets")
  assert.match(source, /navLatest:/, "Latest must be its own filled pill")
})

test("strip labels come from the string catalog, not hardcoded English", () => {
  for (const key of ["session.nav.previous", "session.nav.next", "session.nav.latest", "session.nav.counter"]) {
    assert.ok(source.includes(`"${key}"`), `strip must use i18n key ${key}`)
  }
  assert.match(source, /accessibilityLabel=\{t\("session\.nav\.\w+Label"\)\}/, "strip buttons must expose TalkBack labels")
})

test("error banners expose the full error with a Copy action (AF-4)", () => {
  assert.match(source, /session\.banners\.lastError/, "reconnect banner must show the last error line")
  assert.match(source, /session\.banners\.errorNextAction/, "session-error banner must show the next action")
  assert.ok(source.includes('"session.actions.copy"'), "both error banners must offer Copy")
  assert.doesNotMatch(source, /numberOfLines=\{3\}/, "session error must not be clamped to 3 lines")
})
