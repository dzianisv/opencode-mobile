import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import Module, { createRequire } from "node:module"
import ts from "typescript"
import { lexer } from "marked"

// Regression tests for issue #284: links in chat messages were not tappable
// on Android. A URL in backticks lexes as a codespan, rendered as an inert
// code box; plain-text and markdown links relied on the library default's
// selectable-Text onPress.
//
// These tests run the REAL rendering pipeline — the real marked lexer
// (gfm:true, as useMarkdown passes), the real react-native-marked Parser +
// base Renderer, and the REAL CustomRenderer loaded from Markdown.tsx —
// not a mirror of it. node --test cannot load .tsx, so Markdown.tsx (and
// the .ts/.tsx modules it imports) is transpiled on the fly with the
// TypeScript compiler and loaded through a Module._load patch. Only
// react-native / expo-clipboard / react-native-svg / @expo/vector-icons are
// stubbed, because there is no RN renderer here; the stubs record
// Linking.openURL calls instead of opening a browser.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..")
const read = (rel: string) => readFileSync(path.join(here, rel), "utf8")

const opened: string[] = []
const copied: string[] = []
const alerted: Array<{ title: string; message: string }> = []

function stubComponent(displayName: string) {
  function Component() {
    return null
  }
  Component.displayName = displayName
  return Component
}

const svgStub = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (typeof prop === "symbol") return undefined
      if (prop === "__esModule") return true
      return stubComponent(`Svg.${String(prop)}`)
    },
  },
)

const RN = {
  View: stubComponent("View"),
  Text: stubComponent("Text"),
  ScrollView: stubComponent("ScrollView"),
  TouchableOpacity: stubComponent("TouchableOpacity"),
  FlatList: stubComponent("FlatList"),
  Image: stubComponent("Image"),
  ImageBackground: stubComponent("ImageBackground"),
  ActivityIndicator: stubComponent("ActivityIndicator"),
  StyleSheet: {
    create: (o: unknown) => o,
    flatten: (a: unknown) => (Array.isArray(a) ? Object.assign({}, ...a.filter(Boolean)) : a),
  },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
  useColorScheme: () => "light",
  Linking: {
    canOpenURL: async () => true,
    openURL: async (url: string) => {
      opened.push(url)
    },
  },
  Alert: {
    alert: (title: string, message: string) => {
      alerted.push({ title, message })
    },
  },
}

// Transpile-and-load for .ts/.tsx modules under the repo root, so the test
// exercises the real source files instead of copies of them.
const tsCache = new Map<string, unknown>()
function loadTsModule(resolved: string): unknown {
  const cached = tsCache.get(resolved)
  if (cached !== undefined) return cached
  const { outputText } = ts.transpileModule(readFileSync(resolved, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: resolved,
  })
  const m = new Module(resolved)
  m.filename = resolved
  m.paths = Module._nodeModulePaths(path.dirname(resolved))
  m._compile(outputText, resolved)
  tsCache.set(resolved, m.exports)
  return m.exports
}

function resolveTsSibling(req: string, parent?: Module): string | null {
  if (!req.startsWith(".")) return null
  const base = path.resolve(path.dirname(parent?.filename ?? here), req)
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]
  for (const candidate of candidates) {
    if (candidate.startsWith(repoRoot) && existsSync(candidate)) return candidate
  }
  return null
}

const origLoad = Module._load
Module._load = function (req: string, parent?: Module, isMain?: boolean) {
  if (req === "react-native") return RN
  if (req === "expo-clipboard") return { setStringAsync: async (s: string) => void copied.push(s) }
  if (req === "react-native-svg" || req.endsWith("react-native-svg")) return svgStub
  if (req === "@expo/vector-icons") return { Ionicons: stubComponent("Ionicons") }
  const resolved = resolveTsSibling(req, parent)
  if (resolved && (resolved.endsWith(".tsx") || resolved.endsWith(".ts"))) return loadTsModule(resolved)
  return origLoad.call(this, req, parent, isMain)
}

const require = createRequire(import.meta.url)
const React = require("react")
const Parser = require("react-native-marked/dist/commonjs/lib/Parser").default

interface RendererCtor {
  new (linkStyle?: { color: string }): { text(text: unknown, styles?: unknown): unknown }
}
interface MarkdownTheme {
  link: { color: string }
  text: Record<string, unknown>
  [key: string]: unknown
}
const { CustomRenderer, lightTheme, darkTheme } = loadTsModule(path.join(here, "Markdown.tsx")) as {
  CustomRenderer: RendererCtor
  lightTheme: MarkdownTheme
  darkTheme: MarkdownTheme
}

// The tests render through the REAL themes exported from Markdown.tsx, not
// a hardcoded copy — a style regression must fail here, not drift silently
// past a mirror (issue #292 changed the codespan fill to a subtle gray).

function renderMarkdown(md: string, theme: MarkdownTheme = lightTheme) {
  const tokens = lexer(md, { gfm: true })
  const renderer = new CustomRenderer(theme.link)
  const parser = new Parser({ styles: theme, baseUrl: "", renderer })
  return { elements: parser.parse(tokens) as unknown[], renderer }
}

function collectElements(node: unknown, out: unknown[] = []): unknown[] {
  if (node == null || typeof node !== "object") return out
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out))
    return out
  }
  if (!React.isValidElement(node)) return out
  out.push(node)
  collectElements((node.props as { children?: unknown }).children, out)
  return out
}

interface ElementProps {
  onPress?: () => void
  accessibilityRole?: string
  style?: unknown
  children?: unknown
}

function findLinks(tree: unknown) {
  return collectElements(tree).filter((el) => {
    const props = (el as { props: ElementProps }).props
    return typeof props.onPress === "function" && props.accessibilityRole === "link"
  })
}

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map((s) => flatStyle(s)))
  if (style && typeof style === "object") return style as Record<string, unknown>
  return {}
}

async function pressAndGetOpened(linkEl: unknown): Promise<string[]> {
  opened.length = 0
  alerted.length = 0
  ;(linkEl as { props: ElementProps }).props.onPress?.()
  await new Promise((resolve) => setTimeout(resolve, 10))
  return [...opened]
}

test("bare URL in plain text yields a link node whose onPress opens the URL", async () => {
  const cases: Array<[string, string]> = [
    ["Visit https://safescript.cc for more", "https://safescript.cc"],
    // GFM autolink gives www. an http:// href, same as the library did.
    ["Visit www.safescript.cc for more", "http://www.safescript.cc"],
    // Trailing sentence punctuation is not part of the URL.
    ["See https://safescript.cc.", "https://safescript.cc"],
  ]
  for (const [md, expectedUrl] of cases) {
    const { elements } = renderMarkdown(md)
    const links = findLinks(elements)
    assert.equal(links.length, 1, `${JSON.stringify(md)} must yield exactly one link node, got ${links.length}`)
    assert.equal(flatStyle((links[0] as { props: ElementProps }).props.style).color, "#8b5cf6", "link keeps the purple link style")
    assert.deepEqual(await pressAndGetOpened(links[0]), [expectedUrl], "pressing the link opens the URL")
  }

  // The linkify safety net in text(): marked's autolink already catches the
  // shapes above, so drive the entry point the Parser calls directly with a
  // www. URL in a raw text run — it must still yield a link node.
  const { renderer } = renderMarkdown("x")
  const textNode = renderer.text("go to www.safescript.cc now", lightTheme.text)
  const links = findLinks(textNode)
  assert.equal(links.length, 1, "linkify must split a www. URL out of raw text")
  assert.deepEqual(await pressAndGetOpened(links[0]), ["https://www.safescript.cc"], "www. opens with an https:// scheme")
})

test("backticked URL (the #284 screenshot case) yields a link node whose onPress opens the URL", async () => {
  const { elements } = renderMarkdown("Visit `https://safescript.cc` for more")
  const links = findLinks(elements)
  assert.equal(links.length, 1, "a backticked URL must yield exactly one link node")
  const props = (links[0] as { props: ElementProps }).props
  assert.equal(props.children, "https://safescript.cc", "the link shows the URL text")
  assert.equal(flatStyle(props.style).color, "#8b5cf6", "a backticked URL renders with the link style")
  assert.equal(flatStyle(props.style).backgroundColor, undefined, "a backticked URL must not keep the code-box background")
  assert.deepEqual(await pressAndGetOpened(links[0]), ["https://safescript.cc"], "pressing the backticked URL opens it")
})

test("markdown link still works", async () => {
  const { elements } = renderMarkdown("Visit [safescript](https://safescript.cc) for more")
  const links = findLinks(elements)
  assert.equal(links.length, 1, "a markdown link must yield exactly one link node")
  assert.equal((links[0] as { props: ElementProps }).props.children, "safescript", "the link shows the link text")
  assert.deepEqual(await pressAndGetOpened(links[0]), ["https://safescript.cc"], "pressing the markdown link opens its href")
})

test("non-URL codespan stays inert and code-styled", () => {
  // #292: subtle gray fill, no outline — in both themes.
  const cases: Array<[MarkdownTheme, string]> = [
    [lightTheme, "#e8e8e8"],
    [darkTheme, "#333333"],
  ]
  for (const [theme, expectedBackground] of cases) {
    const { elements } = renderMarkdown("Run `npm install` now", theme)
    assert.equal(findLinks(elements).length, 0, "a non-URL codespan must not yield a link node")
    const codeSpan = collectElements(elements).find(
      (el) => (el as { props: ElementProps }).props.children === "npm install",
    )
    assert.ok(codeSpan, "the codespan text still renders")
    const props = (codeSpan as { props: ElementProps }).props
    assert.equal(props.onPress, undefined, "a non-URL codespan has no press handler")
    assert.equal(flatStyle(props.style).backgroundColor, expectedBackground, "a non-URL codespan keeps the code background")
    assert.equal(flatStyle(props.style).fontFamily, "monospace", "a non-URL codespan keeps the mono font")
    assert.equal(flatStyle(props.style).borderWidth, 0, "a non-URL codespan has no outline/border")
  }
})

test("URL inside a fenced code block stays inert (Copy-only)", () => {
  const { elements } = renderMarkdown("```\nhttps://safescript.cc\n```")
  assert.equal(findLinks(elements).length, 0, "a fenced code block must not yield a link node")
  assert.equal(
    collectElements(elements).filter((el) => typeof (el as { props: ElementProps }).props.onPress === "function").length,
    0,
    "a fenced code block must have no press handler at all",
  )
})

test("user messages render through LinkifiedText, not a bare Text", () => {
  const src = read("../chat/MessageBubble.tsx")
  assert.match(src, /import \{ Markdown, LinkifiedText \} from "\.\.\/markdown"/, "MessageBubble imports LinkifiedText")
  assert.match(src, /<LinkifiedText text=\{text\}/, "user messages render through LinkifiedText")
  assert.doesNotMatch(src, /<Text style=\{\[s\.messageText/, "user messages no longer render as a bare Text")
})
