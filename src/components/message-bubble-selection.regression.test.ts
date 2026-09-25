import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Same approach as wide-content-scroll.regression.test.ts: this repo's test
// runtime is node:test with no React Native renderer, so assert on the real
// component source instead of skipping component-level coverage.
//
// The reported regression: dragging sideways inside a code block selected the
// message instead of scrolling it, and holding a message popped a menu. Both
// came from the bubble being a touchable: upstream long-pressed USER bubbles
// only (for Edit), selection support widened that to every bubble, and a slow
// horizontal drag inside a bubble stays inside its bounds — so the touchable
// keeps the press. Message actions are now buttons in the header row and the
// bubble itself is a plain View with no press handling at all.

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(path.join(here, rel), "utf8")

test("the bubble has no press or long-press of its own", () => {
  const src = read("chat/MessageBubble.tsx")
  assert.match(src, /<View\s+style=\{\[\s+s\.bubble,/)
  assert.doesNotMatch(src, /onLongPress/, "holding a message must not pop anything")
  assert.doesNotMatch(src, /activeOpacity/, "the bubble is not a touchable")
  assert.doesNotMatch(src, /<TouchableOpacity\s+[^>]*style=\{\[\s+s\.bubble/, "the bubble must be a plain View")
  assert.doesNotMatch(src, /onPress=\{onLongPress|handleMessageLongPress/, "no long-press handler left")
})

test("both roles get header buttons, adjacent and right-aligned", () => {
  const src = read("chat/MessageBubble.tsx")
  assert.match(src, /onSelectText\?: \(messageID: string\) => void/)
  assert.match(src, /onEdit\?: \(messageID: string\) => void/)
  assert.match(src, /\{onSelectText && hasSelectableContent\(parts\) && \(/)
  assert.match(src, /\{isUser && onEdit && \(/)
  assert.match(src, /testID=\{`message-select-text-\$\{message\.id\}`\}/)
  assert.match(src, /testID=\{`message-edit-\$\{message\.id\}`\}/)
  assert.match(src, /onPress=\{\(\) => onSelectText\(message\.id\)\}/)
  assert.match(src, /onPress=\{\(\) => onEdit\(message\.id\)\}/)

  // "Select text" sits immediately left of "Edit": source order inside one
  // group, and the group (not each chip) owns the right-alignment.
  assert.ok(
    src.indexOf("message-select-text") < src.indexOf("message-edit"),
    "Select text must precede Edit in the group",
  )
  assert.match(src, /<View style=\{s\.actions\}>/)
  const groupStyle = src.slice(src.indexOf("actions: {"), src.indexOf("selectChip: {"))
  assert.ok(groupStyle.includes('marginLeft: "auto"'), "the group is pushed to the right edge")
  assert.ok(groupStyle.includes('flexDirection: "row"') && groupStyle.includes("gap: 6"), "chips sit in one row")
  assert.ok(groupStyle.includes("flexShrink: 0"), "the chips must not be squeezed out by a long model tag")
  const chipStyle = src.slice(src.indexOf("selectChip: {"), src.indexOf("selectChipDark:"))
  assert.ok(!chipStyle.includes("marginLeft"), "chips stay adjacent; the group aligns them")

  // A button label that is itself selectable text is how a tap turns into a
  // selection instead of an action.
  const chipLabels = src.split("\n").filter((line) => /<Text selectable/.test(line))
  assert.equal(chipLabels.length, 2, "both chips render a label")
  for (const line of chipLabels) {
    assert.ok(line.includes("selectable={false}"), line)
    assert.ok(line.includes("s.selectChipText"), line)
  }
  // Controls belong in the header row: anything competing with a drag is how
  // this bug arrived the first time.
  assert.ok(src.indexOf("message-select-text") < src.indexOf("{/* Image attachments */}"))
})

test("message text is not inline-selectable on Android", () => {
  const src = read("chat/MessageBubble.tsx")
  assert.match(src, /selectable=\{Platform\.OS === "ios"\}/)
  // No always-on selectable anywhere in the bubble body.
  const code = src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX block comments mention selection
    .replaceAll('selectable={Platform.OS === "ios"}', "")
    .replaceAll("selectable={false}", "")
  assert.ok(!code.includes("selectable"), "bubble text selects only through the sheet on Android")
})

test("the session screen wires the buttons to single-implementation handlers", () => {
  const src = readFileSync(path.join(here, "..", "..", "app", "session", "[id].tsx"), "utf8")
  assert.match(src, /onSelectText=\{openSelectTextSheet\}/)
  assert.match(src, /onEdit=\{startEditFlow\}/)
  assert.doesNotMatch(src, /handleMessageLongPress/, "the long-press action sheet is gone")
  assert.doesNotMatch(src, /type AlertButton/, "unused with the sheet removed")
  assert.doesNotMatch(src, /import \{ hasSelectableContent, messagePartsToSelectableText \}/)
  // No half-migrated leftover: the sheet text and the revert flow each live in
  // exactly one place, shared by the buttons.
  assert.doesNotMatch(src, /setTextSheet\(sheetText\)/)
  assert.equal(src.split("revertToMessage(").length - 1, 1, "the revert flow must exist once, in startEditFlow")
})
