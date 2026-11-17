import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Same approach as message-bubble-selection.regression.test.ts: this repo's
// test runtime is node:test with no React Native renderer, so assert on the
// real component source instead of skipping component-level coverage.
//
// The reported regression (#262, Sentry OPENCODE-MOBILE-S/T on v0.4.22):
// react-native-marked's MDImage fetches the image size in an effect with
// NO dependency array, and both the success and the failure callback call
// setImageState with a fresh object — so it refetches and re-renders after
// every render, an unbounded loop. In a harness against React 19.1 (the
// app's version) the exact shape renders 2,573 times in 3s with an async
// getSize, and with a synchronously-resolving getSize it throws React's
// "Maximum update depth exceeded" (its message names this shape: setState
// inside useEffect with no dependency array). The app now renders markdown
// images with its own MarkdownImage, whose fetch is scoped to [uri]
// (exactly two renders per image), and routes .svg to the library's MDSvg,
// whose effect is already scoped to [uri].

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(path.join(here, rel), "utf8")

test("MarkdownImage fetches the size once per URI, not after every render", () => {
  const src = read("MarkdownImage.tsx")
  assert.match(src, /useEffect\(\(\) => \{\s*Image\.getSize\(/, "the size fetch lives in an effect")
  assert.equal((src.match(/^  useEffect\(/gm) || []).length, 1, "exactly one effect in the component")
  assert.match(src, /useEffect\([\s\S]*?\}, \[uri\]\)/, "the effect must be scoped to [uri]")
  assert.match(src, /setImageState\(\{ isLoading: false, aspectRatio: width \/ height \}\)/, "success resolves the ratio")
  assert.match(src, /setImageState\(\(current\) => \(\{\s*\.\.\.current, isLoading: false\s*\}\)\)/, "failure clears loading")
})

test("the markdown renderer routes images to the app's component, not MDImage", () => {
  const src = read("Markdown.tsx")
  assert.match(src, /import \{ MarkdownImage \} from "\.\/MarkdownImage"/, "Markdown uses the app's image component")
  assert.match(src, /image\(uri: string, alt\?: string, style\?: ImageStyle, title\?: string\)/, "CustomRenderer overrides image")
  assert.match(src, /if \(uri\.endsWith\("\.svg"\)\) return super\.image\(uri, alt, style, title\)/, ".svg stays on the library's MDSvg")
  assert.match(src, /return <MarkdownImage key=\{this\.getKey\(\)\} uri=\{uri\} alt=\{alt \|\| title\} style=\{style\} \/>/, "non-SVG images render MarkdownImage")
  assert.doesNotMatch(src, /<MDImage/, "the library's looping MDImage must never be rendered")
})

test("MarkdownImage keeps the library's rendering contract", () => {
  const src = read("MarkdownImage.tsx")
  assert.match(src, /<ImageBackground/, "renders an ImageBackground like MDImage")
  assert.match(src, /aspectRatio: imageState\.aspectRatio/, "sizes from the resolved aspect ratio")
  assert.match(src, /testID="react-native-marked-md-image"/, "keeps the library's testID")
  assert.match(src, /testID="react-native-marked-md-image-activity-indicator"/, "keeps the spinner testID")
  assert.match(src, /export const MarkdownImage = memo\(MarkdownImageInner\)/, "memoized like the library's MDImage")
})
