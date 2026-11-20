// URL handling shared by the markdown renderer (Markdown.tsx) and plain-text
// surfaces (user messages in MessageBubble.tsx) — issue #284.
//
// Agents wrap URLs in backticks, drop the scheme, or leave trailing
// punctuation after them, so GFM autolink alone is not enough: a URL must be
// tappable however it is formatted. splitTextWithUrls / extractSingleUrl are
// pure string functions; only openLink touches React Native.
import { Alert, Linking } from "react-native"
import * as Clipboard from "expo-clipboard"

// A URL-looking run: http(s)://... or www...., up to whitespace or a
// delimiter that cannot be part of a URL. Parens stay in the run — a URL
// like .../wiki/Link_(film) is real — and stripTrailingPunctuation below
// drops only closers with no matching opener.
const URL_RUN = /(https?:\/\/[^\s<>"'\[\]{}]+|www\.[^\s<>"'\[\]{}]+)/g

const CLOSERS = [")", "]", "}"]
const OPENERS = ["(", "[", "{"]

function stripTrailingPunctuation(candidate: string): string {
  let end = candidate.length
  while (end > 0 && ".,;:!?".includes(candidate[end - 1])) end--
  // Drop a trailing closer that has no matching opener in the URL, e.g. the
  // ")" in "(see https://safescript.cc)" — but keep balanced ones.
  for (let i = 0; i < CLOSERS.length; i++) {
    const closer = CLOSERS[i]
    const opener = OPENERS[i]
    let depth = 0
    for (let j = 0; j < end; j++) {
      if (candidate[j] === opener) depth++
      if (candidate[j] === closer) depth--
    }
    while (end > 0 && candidate[end - 1] === closer && depth < 0) {
      end--
      depth++
    }
  }
  return candidate.slice(0, end)
}

function normalizeUrl(raw: string): string {
  return raw.startsWith("www.") ? `https://${raw}` : raw
}

export interface TextSegment {
  text: string
  url?: string
}

// Split plain text into plain and URL segments. A URL segment's text is the
// URL as written (trailing punctuation stripped); its url is what opens.
export function splitTextWithUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(URL_RUN)) {
    const trimmed = stripTrailingPunctuation(match[0])
    if (!trimmed) continue
    const start = match.index ?? 0
    if (start > last) segments.push({ text: text.slice(last, start) })
    segments.push({ text: trimmed, url: normalizeUrl(trimmed) })
    last = start + trimmed.length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments.length > 0 ? segments : [{ text }]
}

// The whole string is one URL (an inline-code span's content, issue #284) —
// return the URL to open, or null for anything else (code stays inert).
export function extractSingleUrl(text: string): string | null {
  const cleaned = stripTrailingPunctuation(text.trim())
  if (!/^(https?:\/\/|www\.)\S+$/.test(cleaned)) return null
  return normalizeUrl(cleaned)
}

function showLinkFallback(url: string): void {
  Alert.alert("Can't open this link", url, [
    { text: "Copy link", onPress: () => void Clipboard.setStringAsync(url) },
    { text: "Cancel", style: "cancel" },
  ])
}

// Open a URL in the device browser; if nothing can open it, offer to copy
// it instead of silently doing nothing (the #284 complaint).
export function openLink(url: string): void {
  void Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) {
        void Linking.openURL(url).catch(() => showLinkFallback(url))
        return
      }
      showLinkFallback(url)
    })
    .catch(() => showLinkFallback(url))
}
