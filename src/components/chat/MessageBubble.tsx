import { memo } from "react"
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Markdown } from "../markdown"
import { ToolCallCard } from "./ToolCallCard"
import { ReasoningBlock } from "./ReasoningBlock"
import type { Message, Part } from "../../lib/sdk"
import { hasSelectableContent } from "../../lib/message-text"

const SCREEN_WIDTH = Dimensions.get("window").width

function isImageMime(mime?: string): boolean {
  return !!mime && mime.startsWith("image/")
}

interface Props {
  message: Message
  parts: Part[]
  isDark: boolean
  // Message actions arrive as buttons in the bubble header (see the header
  // comment in the render). There is deliberately no bubble-wide press or
  // long-press: it competed with horizontal scrolling in code blocks and with
  // text selection, and holding a message no longer pops anything. Handlers are
  // identified by messageID (not a closure over parts) so they stay correct even
  // if the memo below bails on a stale render.
  onSelectText?: (messageID: string) => void
  onEdit?: (messageID: string) => void
}

// TODO: Replace with streamdown-rn once React 19 types PR lands - it has
// built-in block-level memoization that eliminates re-renders for stable blocks
export const MessageBubble = memo(
  function MessageBubble({ message, parts, isDark, onSelectText, onEdit }: Props) {
    const isUser = message.role === "user"

    const textParts = parts.filter((p) => p.type === "text")
    const reasoningParts = parts.filter((p) => p.type === "reasoning")
    const toolParts = parts.filter((p) => p.type === "tool")
    const fileParts = parts.filter((p) => p.type === "file" && isImageMime(p.mime))
    const text = textParts.map((p) => p.text).join("\n") || ""
    const reasoning = reasoningParts.map((p) => p.text).join("\n") || ""

    return (
      <View
        style={[
          s.bubble,
          isUser ? s.user : s.assistant,
          isUser && isDark && s.userDark,
          !isUser && isDark && s.assistantDark,
        ]}
        testID={`chat-bubble-${message.role}`}
      >
        {/* Role indicator */}
        <View style={s.header}>
          <Ionicons
            name={isUser ? "person" : "sparkles"}
            size={14}
            color={isUser ? (isDark ? "#ffffff" : "#0a0a0a") : "#8b5cf6"}
          />
          <Text style={[s.role, isUser && s.roleUser, isDark && s.textWhite]}>{isUser ? "You" : "Assistant"}</Text>
          {message.model && <Text style={[s.modelTag, isDark && s.modelTagDark]}>{message.model.modelID}</Text>}
          {!isUser && message.modelID && <Text style={[s.modelTag, isDark && s.modelTagDark]}>{message.modelID}</Text>}
          {/* Message actions are taps in a right-aligned group at the end of the
              header row — "Select text" sits immediately left of "Edit". Nothing
              here is a bubble-wide gesture: a long-press on the bubble competed
              with horizontal scrolling in code blocks and with text selection.
              Labels are explicitly non-selectable so a tap can't be swallowed. */}
          {(onSelectText || onEdit) && (
            <View style={s.actions}>
              {onSelectText && hasSelectableContent(parts) && (
                <TouchableOpacity
                  style={[s.selectChip, isDark && s.selectChipDark]}
                  hitSlop={8}
                  onPress={() => onSelectText(message.id)}
                  testID={`message-select-text-${message.id}`}
                >
                  <Text selectable={false} style={[s.selectChipText, isDark && s.selectChipTextDark]}>
                    Select text
                  </Text>
                </TouchableOpacity>
              )}
              {isUser && onEdit && (
                <TouchableOpacity
                  style={[s.selectChip, isDark && s.selectChipDark]}
                  hitSlop={8}
                  onPress={() => onEdit(message.id)}
                  testID={`message-edit-${message.id}`}
                >
                  <Text selectable={false} style={[s.selectChipText, isDark && s.selectChipTextDark]}>
                    Edit
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Image attachments */}
        {fileParts.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.imageRow}
            style={s.imageScroll}
          >
            {fileParts.map((fp) => (
              <View key={fp.id} style={s.imageWrap}>
                <Image source={{ uri: fp.url }} style={s.attachedImage} resizeMode="cover" />
                {fp.filename && (
                  <Text style={[s.imageLabel, isDark && s.imageLabelDark]} numberOfLines={1}>
                    {fp.filename}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {/* Reasoning (collapsible) */}
        {reasoning.length > 0 && <ReasoningBlock text={reasoning} isDark={isDark} />}

        {/* Message text */}
        {text.length > 0 &&
          (isUser ? (
            // Android: inline selection in a list row is unreliable (RN#46999)
            // and competes with the bubble's long-press, so user text selects
            // through the "Select text" sheet. iOS has no such conflict.
            <Text style={[s.messageText, isDark && s.textWhite]} selectable={Platform.OS === "ios"}>
              {text}
            </Text>
          ) : (
            <View style={s.markdownWrap}>
              <Markdown>{text}</Markdown>
            </View>
          ))}

        {/* Tool calls */}
        {toolParts.map((tool) => (
          <ToolCallCard key={tool.id} tool={tool} isDark={isDark} />
        ))}

        {/* Run-level failure (assistant message carries `error` when the agent
            errored out — provider failure, aborted stream, etc.). Without this
            an errored run looked identical to a successful one when reading
            history; the live case is covered by the session error banner. */}
        {message.error?.message && (
          <View style={[s.errorBlock, isDark && s.errorBlockDark]}>
            <Text style={[s.errorBlockText, isDark && s.errorBlockTextDark]} selectable={Platform.OS === "ios"}>
              {message.error.message}
            </Text>
          </View>
        )}

        {/* Tokens/cost for assistant messages */}
        {!isUser && message.tokens && (
          <Text style={[s.tokens, isDark && s.tokensDark]}>
            {message.tokens.input + message.tokens.output} tokens
            {message.cost ? ` · $${message.cost.toFixed(4)}` : ""}
          </Text>
        )}
      </View>
    )
  },
  (prev, next) => {
    // Only re-render if message content actually changed
    // This prevents completed messages from re-rendering during streaming.
    // The store replaces changed parts/messages with NEW object references,
    // so a reference-equality sweep over every part catches every real change
    // (including tool parts, which have no `.text`) while still skipping
    // unchanged (completed) messages during other messages' streaming.
    if (prev.message !== next.message) return false
    if (prev.isDark !== next.isDark) return false
    if (prev.onSelectText !== next.onSelectText) return false
    if (prev.onEdit !== next.onEdit) return false
    if (prev.parts.length !== next.parts.length) return false
    for (let i = 0; i < prev.parts.length; i++) {
      if (prev.parts[i] !== next.parts[i]) return false
    }
    return true
  },
)

const s = StyleSheet.create({
  bubble: { marginBottom: 16, padding: 12, borderRadius: 12, maxWidth: "100%" },
  user: { backgroundColor: "#f5f5f5", marginLeft: 32 },
  userDark: { backgroundColor: "#1a1a1a" },
  assistant: { backgroundColor: "#f0f0ff" },
  assistantDark: { backgroundColor: "#1a1a2e" },

  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  role: { fontSize: 13, fontWeight: "600", color: "#666666" },
  roleUser: { color: "#0a0a0a" },
  textWhite: { color: "#ffffff" },

  actions: {
    // Pushes the group to the right edge of the header row; the chips inside it
    // stay adjacent in source order (Select text, then Edit).
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  selectChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    flexShrink: 0,
  },
  selectChipDark: { borderColor: "#404040" },
  selectChipText: { fontSize: 11, color: "#525252" },
  selectChipTextDark: { color: "#d4d4d4" },

  modelTag: {
    fontSize: 11,
    color: "#999999",
    backgroundColor: "#e5e5e5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  modelTagDark: { backgroundColor: "#2a2a2a", color: "#888888" },

  messageText: { fontSize: 15, lineHeight: 22, color: "#0a0a0a" },
  markdownWrap: { marginHorizontal: -4 },

  tokens: { fontSize: 11, color: "#999999", marginTop: 8 },
  tokensDark: { color: "#666666" },

  // Run-level error block inside an assistant bubble
  errorBlock: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorBlockDark: { backgroundColor: "#3b1212", borderColor: "#7f1d1d" },
  errorBlockText: { color: "#b91c1c", fontSize: 13 },
  errorBlockTextDark: { color: "#fca5a5" },

  // Images
  imageScroll: { marginBottom: 8 },
  imageRow: { gap: 8 },
  imageWrap: { alignItems: "center" },
  attachedImage: {
    width: Math.min(200, SCREEN_WIDTH * 0.5),
    height: Math.min(200, SCREEN_WIDTH * 0.5),
    borderRadius: 8,
    backgroundColor: "#e5e5e5",
  },
  imageLabel: { fontSize: 10, color: "#666666", marginTop: 2, maxWidth: 200 },
  imageLabelDark: { color: "#888888" },
})
