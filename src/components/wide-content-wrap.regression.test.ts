import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// GitHub issue #21 ("QA: verify DiffView + CodeBlock horizontal-scroll on-device
// with a populated diff") was about wide lines being TRUNCATED. The original fix
// was a horizontal ScrollView, which on a phone became a gesture fight against the
// vertical message list (see src/lib/scroll-config.ts); both components now wrap
// wide lines instead. What has to stay true is the original requirement plus the
// copy guarantee:
//   (a) no numberOfLines / ellipsizeMode truncation in either component
//   (b) no horizontal scroll container reintroduced — that is the gesture bug
//   (c) CodeBlock copies the raw `code`, never the wrapped rendering
//
// This repo's runtime is React Native, so these components can't be rendered with
// node:test (no react-test-renderer / RN jest preset — package.json's "test" script
// only globs plain .test.ts files). Instead of skipping component-level coverage,
// this test reads the actual .tsx source and asserts on the markers that would
// prove a regression.

const here = path.dirname(fileURLToPath(import.meta.url))
const readComponent = (rel: string) => readFileSync(path.join(here, rel), "utf8")

const WIDE_COMPONENTS = ["chat/DiffView.tsx", "markdown/CodeBlock.tsx"]

// The rationale lives in comments, so comments must not be mistaken for code:
// "numberOfLines", "horizontal" and "selectable" all appear in prose here.
function codeOnly(src: string) {
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
}

test("wide content is never truncated", () => {
  for (const rel of WIDE_COMPONENTS) {
    const code = codeOnly(readComponent(rel))
    assert.doesNotMatch(code, /numberOfLines/, `${rel} must not truncate wide lines (issue #21)`)
    assert.doesNotMatch(code, /ellipsizeMode/, `${rel} must not ellipsize wide lines (issue #21)`)
  }
})

test("wide content wraps instead of scrolling sideways", () => {
  for (const rel of WIDE_COMPONENTS) {
    const code = codeOnly(readComponent(rel))
    assert.doesNotMatch(code, /ScrollView/, `${rel} must wrap wide lines, not scroll them sideways`)
    assert.doesNotMatch(code, /horizontal/, `${rel} must not reintroduce a horizontal scroll container`)
  }
})

test("every logical line is rendered, so indentation and blank lines survive", () => {
  const codeBlock = readComponent("markdown/CodeBlock.tsx")
  assert.ok(codeBlock.includes('code.split("\\n")'), "CodeBlock must render one Text per logical line")
  assert.ok(codeBlock.includes('line.length > 0 ? line : " "'), "CodeBlock must keep blank lines visible")

  const diffView = readComponent("chat/DiffView.tsx")
  assert.ok(diffView.includes('line.text.length > 0 ? line.text : " "'), "DiffView must keep blank diff lines visible")
  const textStyle = diffView.slice(diffView.indexOf("  text: {"))
  assert.ok(textStyle.slice(0, 240).includes("flex: 1"), "DiffView text must be flex:1 so the fold happens inside the row")
})

test("copying a code block copies the raw string, not the wrapped rendering", () => {
  const src = readComponent("markdown/CodeBlock.tsx")
  assert.ok(src.includes("Clipboard.setStringAsync(code)"), "Copy must hand the clipboard the untouched code")
  const code = codeOnly(src)
  const writes = code.match(/setStringAsync\([^)]*\)/g) || []
  assert.equal(writes.length, 1, "exactly one clipboard write, from the Copy button")
  assert.equal(writes[0], "setStringAsync(code)", "the clipboard must receive the untouched string")
})

test("both components gate selection through the shared, unit-tested helper", () => {
  for (const rel of WIDE_COMPONENTS) {
    const src = readComponent(rel)
    assert.ok(src.includes("wideTextSelection(Platform.OS)"), rel)
    assert.ok(src.includes("selectable={sel.selectable}"), rel)
    const code = codeOnly(src).replaceAll("selectable={sel.selectable}", "").replaceAll("sel.selectable", "")
    assert.ok(!code.includes("selectable"), `${rel} must not enable selection outside wideTextSelection`)
  }
})
