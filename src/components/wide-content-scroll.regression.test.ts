import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// GitHub issue #21 ("QA: verify DiffView + CodeBlock horizontal-scroll
// on-device with a populated diff"). The underlying fixes were:
//   - src/components/chat/DiffView.tsx: wrap diff lines in a horizontal
//     ScrollView (previously truncated with numberOfLines={1}).
//   - src/components/markdown/CodeBlock.tsx: wrap code in a horizontal
//     ScrollView (previously long lines wrapped/mangled).
//
// This repo's runtime is React Native, so these components can't be rendered
// with node:test (no react-test-renderer / RN jest preset is set up here —
// see package.json's "test" script, which only globs plain .test.ts files).
// Instead of skipping component-level coverage, this test reads the actual
// .tsx source and asserts on its structure: it's a plain-text/regex check,
// but it directly targets the two markers that would prove a regression —
// (a) the ScrollView wiring, (b) reintroducing line-truncation — so it can't
// pass on a source file where the fix was reverted.

function readComponent(relativePath: string): string {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  return readFileSync(path.join(dir, relativePath), "utf8")
}

// The shared container is now WideScroll, which is horizontal by
// construction (see src/components/WideScroll.tsx) and adds the forgiving
// gesture claim on top. The invariant these tests guard is unchanged: wide
// content must live in a horizontal scroller and must not be truncated.
test("DiffView wraps diff lines in the shared horizontal scroller", () => {
  const src = readComponent("chat/DiffView.tsx")
  assert.match(src, /<WideScroll/)
  assert.doesNotMatch(src, /numberOfLines/, "DiffView must not truncate diff line text with numberOfLines")
})

test("CodeBlock wraps code in the shared horizontal scroller", () => {
  const src = readComponent("markdown/CodeBlock.tsx")
  assert.match(src, /<WideScroll/)
  assert.doesNotMatch(src, /numberOfLines/, "CodeBlock must not truncate code text with numberOfLines")
})

test("markdown tables use the shared horizontal scroller too", () => {
  const src = readComponent("markdown/Markdown.tsx")
  assert.match(src, /<WideScroll/)
})

test("all three source the scroller from the one shared component", () => {
  for (const rel of ["chat/DiffView.tsx", "markdown/CodeBlock.tsx", "markdown/Markdown.tsx"]) {
    assert.match(readComponent(rel), /from ["']\.\.\/WideScroll["']/, rel)
  }
})
