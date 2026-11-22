import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  ToastAndroid,
  useWindowDimensions,
  type CellRendererProps,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native"
import { useLocalSearchParams, Stack, useRouter, useFocusEffect, useNavigation } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import * as ImagePicker from "expo-image-picker"
import * as ImageManipulator from "expo-image-manipulator"
import * as Clipboard from "expo-clipboard"
import type BottomSheet from "@gorhom/bottom-sheet"
import {
  MessageBubble,
  PermissionPrompt,
  QuestionPrompt,
  StatusIndicator,
  SlashPopover,
  ModelPicker,
  VariantPicker,
  ImageAttachments,
  SessionInfo,
  MessageTextSheet,
  SubagentSection,
  type SlashCommand,
  type Attachment,
} from "../../src/components/chat"
import { useSessions } from "../../src/stores/sessions"
import { useEvents, refreshPending } from "../../src/stores/events"
import { useConnections } from "../../src/stores/connections"
import { useAuth } from "../../src/stores/auth"
import { useCatalog } from "../../src/stores/catalog"
import { useSpeech } from "../../src/lib/speech"
import { messagePartsToSelectableText } from "../../src/lib/message-text"
import { shouldAutoScroll, shouldShowScrollButton, transcriptSignature } from "../../src/lib/auto-scroll"
import { MessageNavigation } from "../../src/lib/message-navigation"
import {
  jsKeyboardPaddingApplies,
  keyboardPadding,
  keyboardVerticalOffset,
} from "../../src/lib/keyboard-offset"
import { composerMaxHeight } from "../../src/lib/session-layout"
import { sessionCostText } from "../../src/lib/session-cost"

// --- Builtin slash commands ---
const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    trigger: "new",
    title: "New Session",
    description: "Start a new session",
    icon: "add-circle-outline",
    type: "builtin",
  },
  {
    trigger: "model",
    title: "Switch Model",
    description: "Choose a different model",
    icon: "hardware-chip-outline",
    type: "builtin",
  },
  {
    trigger: "agent",
    title: "Switch Agent",
    description: "Cycle to next agent",
    icon: "person-outline",
    type: "builtin",
  },
]

function getShortDir(dir?: string): string | null {
  if (!dir) return null
  const parts = dir.split("/").filter(Boolean)
  return parts[parts.length - 1] || null
}

export default function SessionScreen() {
  const { id, directory } = useLocalSearchParams<{ id: string; directory?: string }>()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  const flatListRef = useRef<FlatList>(null)
  const modelSheetRef = useRef<BottomSheet>(null)
  const variantSheetRef = useRef<BottomSheet>(null)
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showInfo, setShowInfo] = useState(false)
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions()
  const [keyboardHeight, setKeyboardHeight] = useState(() => Keyboard.metrics()?.height ?? 0)
  const [keyboardY, setKeyboardY] = useState<number | null>(null)

  useEffect(() => {
    if (Platform.OS !== "android") return
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height)
      setKeyboardY(event.endCoordinates.screenY)
    })
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0)
      setKeyboardY(null)
    })
    // Close the render-to-effect race: listeners are attached first, then the
    // current native metrics become the source of truth.
    setKeyboardHeight(Keyboard.metrics()?.height ?? 0)
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const inputMaxHeight = composerMaxHeight(Platform.OS, windowHeight, keyboardY, insets.top, fontScale)
  // Exactly one layer applies the IME height: JS padding below API 35, the
  // native IME-insets listener in MainActivity on API 35+.
  const jsKeyboardPadding = jsKeyboardPaddingApplies(Platform.OS, Platform.Version)
    ? keyboardPadding(Platform.OS, keyboardHeight)
    : 0
  // Raw text of the message opened in the full-screen selection sheet
  const [textSheet, setTextSheet] = useState<string | null>(null)

  const {
    currentSession,
    messages,
    parts,
    isLoading,
    loadingMore,
    hasMore,
    error,
    selectSession,
    sendMessage,
    abortSession,
    loadOlderMessages,
    revertToMessage,
    unrevertSession,
  } = useSessions()

  // Derive sending state for this specific session
  const isSending = useSessions((s) => !!(currentSession && s.sending[currentSession.id]))

  const { authenticateForMessage } = useAuth()
  const { client, clientForDirectory } = useConnections()

  // Use directory-aware client for sessions that belong to a project other than the active one
  const sessionClient = useMemo(
    () => (currentSession?.directory ? (clientForDirectory(currentSession.directory) ?? client) : client),
    [currentSession?.directory, clientForDirectory, client],
  )

  // Catalog
  const catalog = useCatalog()
  const agents = Array.isArray(catalog.agents) ? catalog.agents : []
  const serverCommands = Array.isArray(catalog.commands) ? catalog.commands : []
  const providers = Array.isArray(catalog.providers) ? catalog.providers : []
  const agent = catalog.agent || ""
  const model = catalog.model
  const setModel = catalog.setModel
  const variant = catalog.variant
  const setVariant = catalog.setVariant
  const cycleAgent = catalog.cycleAgent

  // Permission & question state
  const sessionID = currentSession?.id
  const permissions = useEvents((s) => (sessionID ? s.permissions[sessionID] : undefined)) || []
  const questions = useEvents((s) => (sessionID ? s.questions[sessionID] : undefined)) || []

  const shortDir = getShortDir(currentSession?.directory)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Message navigation (#214) — docked strip, not floating controls.
  // `nav` is the placement-independent navigation math ported from draft
  // PR #215 (src/lib/message-navigation.ts); that PR's floating placement
  // and paddingRight:76 gutter were UX-rejected and are not carried over.
  // `navigation` is already taken by expo-router's useNavigation below,
  // hence the short name.
  const nav = useRef(new MessageNavigation()).current
  const navRetry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const navAttempts = useRef(0)
  // Set by a Previous tap at the oldest loaded message while older pages
  // exist: the load is in flight, advance into the new batch when it lands.
  const pendingNavLoad = useRef(false)
  // Index into nav.ids (newest first) of the current navigable message;
  // -1 while unknown. Mirrored into state so the strip counter and the
  // Previous/Next disabled states re-render on scroll and content change.
  const [currentNavIndex, setCurrentNavIndex] = useState(-1)

  // SSE reconnect banner
  const reconnectAttempts = useEvents((s) => s.reconnectAttempts)
  const lastDisconnectReason = useEvents((s) => s.lastDisconnectReason)
  const [showConnectedFlash, setShowConnectedFlash] = useState(false)
  const prevReconnecting = useRef(false)

  // Voice input — transcript appends to the text input on completion
  const speech = useSpeech(
    useCallback((text: string) => {
      setInput((prev) => (prev ? prev + " " + text : text))
    }, []),
  )

  // Surface speech recognition failures (e.g. mic permission denied). Keyed
  // on the error value itself so it only fires once per distinct error, not
  // on every re-render while it remains set.
  useEffect(() => {
    if (!speech.error) return
    Alert.alert(t("session.alerts.speechErrorTitle"), t("session.alerts.speechErrorMessage"))
  }, [speech.error, t])

  // Slash command state
  const slashActive = input.startsWith("/") && !input.includes(" ")
  const slashQuery = slashActive ? input.slice(1) : ""

  const allCommands = useMemo<SlashCommand[]>(() => {
    const custom: SlashCommand[] = serverCommands.map((cmd) => ({
      trigger: cmd.name,
      title: cmd.name,
      description: cmd.description,
      icon: "code-slash-outline",
      type: "custom",
    }))
    return [...custom, ...BUILTIN_COMMANDS]
  }, [serverCommands])

  // While a revert is pending, the reverted message and everything after it
  // still exist server-side (cleanup only runs on the next prompt/unrevert)
  // — hide them client-side so editing feels immediate. Message IDs are
  // lexicographically sortable, same comparison the TUI uses. Optimistic
  // "temp-" IDs (assigned client-side before the server responds, see
  // sendMessage) aren't part of that sort order — always keep them so a
  // message sent concurrently with a revert isn't hidden.
  const revertMessageID = currentSession?.revert?.messageID

  // Inverted FlatList: data is reversed (newest first) so newest renders at bottom
  const messageData = useMemo(
    () =>
      (messages || [])
        .filter((msg) => !revertMessageID || msg.id.startsWith("temp-") || msg.id < revertMessageID)
        .map((msg) => ({
          message: msg,
          parts: (parts && parts[msg.id]) || [],
        }))
        .reverse(),
    [messages, parts, revertMessageID],
  )

  // Navigable set (#214 AF-3): user + assistant messages with visible
  // content. The SDK types roles as "user" | "assistant" only, and
  // MessageBubble renders a visible bubble (role header at minimum) for
  // every message, so there are no in-list invisible rows to skip —
  // banners, status and prompts all live outside the FlatList. The filter
  // stays as the explicit predicate so a future role can't silently join
  // the navigation set.
  const navigableIds = useMemo(
    () =>
      messageData
        .filter((item) => item.message.role === "user" || item.message.role === "assistant")
        .map((item) => item.message.id),
    [messageData],
  )
  nav.sync(navigableIds)

  const seekMessage = useCallback(() => {
    if (navRetry.current) clearTimeout(navRetry.current)
    if (flatListRef.current && nav.seek(flatListRef.current, navAttempts.current++)) {
      navRetry.current = setTimeout(seekMessage, 100)
    }
  }, [nav])

  // Cell renderer that records each row's measured frame for navigation.
  // Frames arrive via onLayout as rows mount or resize (streaming growth)
  // and are dropped when a row unmounts; a pending seek resumes as soon as
  // its target's frame lands (see seekMessage above).
  const MessageCell = useCallback(
    (props: CellRendererProps<(typeof messageData)[number]>) => {
      const key = props.item.message.id
      const { onLayout, ...cell } = props
      useEffect(() => () => {
        nav.frames.delete(key)
      }, [key, nav])
      return (
        <View
          {...cell}
          onLayout={(event) => {
            nav.frames.set(key, event.nativeEvent.layout)
            onLayout?.(event)
            if (nav.target === key) seekMessage()
          }}
        >
          {props.children}
        </View>
      )
    },
    [nav, seekMessage],
  )

  // New session: drop any in-flight seek, target and anchor — the frames
  // belong to the previous transcript.
  useEffect(() => {
    nav.manual()
    nav.frames.clear()
    pendingNavLoad.current = false
    setCurrentNavIndex(-1)
    return () => {
      if (navRetry.current) clearTimeout(navRetry.current)
    }
  }, [id, nav])

  // Tracks the latest composer text without pulling `input` into startEditFlow's
  // deps — kept as a plain ref assignment (not state) so the callback stays
  // referentially stable across keystrokes for MessageBubble's memo comparator.
  const inputRef = useRef(input)
  inputRef.current = input

  const applyRevertResult = useCallback((result: Awaited<ReturnType<typeof revertToMessage>>) => {
    if (!result.ok) {
      if (result.reason === "unsupported") {
        Alert.alert(t("session.alerts.notSupportedTitle"), t("session.alerts.notSupportedMessage"))
      } else if (result.reason === "auth") {
        Alert.alert(t("session.alerts.revertAuthFailedTitle"), t("session.alerts.revertAuthFailedMessage"))
      } else {
        Alert.alert(t("session.alerts.editFailedTitle"), t("session.alerts.editFailedMessage"))
      }
      return
    }
    setInput(result.text)
    // Restore attachments in the same shape the composer's own picker
    // functions (pickFromLibrary/pickFromCamera/pasteFromClipboard) use.
    setAttachments(
      result.files
        .filter((f): f is typeof f & { url: string; mime: string } => !!f.url && !!f.mime)
        .map((f) => ({ uri: f.url, mime: f.mime, filename: f.filename })),
    )
  }, [t])

  // Full-screen selectable view: native text selection can't be trusted inside
  // FlatList rows on Android (react-native#46999), so selection happens in a
  // plain ScrollView outside the list. Reached from the assistant bubble's
  // "Select text" button (a tap — assistant bubbles have no long-press) and
  // from the user bubble's long-press action sheet. Covers the whole message:
  // assistant text, reasoning and tool calls (name/input/result/error), not
  // just text parts. Stable so MessageBubble's memo comparator can bail early.
  const openSelectTextSheet = useCallback(
    (messageID: string) => {
      const messageParts = useSessions.getState().parts[messageID] || []
      setTextSheet(
        messagePartsToSelectableText(messageParts, {
          thinking: t("session.sheet.thinking"),
          tool: t("session.sheet.tool"),
          input: t("session.sheet.input"),
          result: t("session.sheet.result"),
          error: t("session.sheet.error"),
          file: t("session.sheet.file"),
        }),
      )
    },
    [t],
  )

  // Editing a user message reverts the session to it and loads it into the
  // composer. Reached from the user bubble's "Edit" button and from its
  // long-press action sheet. Stable so MessageBubble's memo comparator bails.
  const startEditFlow = useCallback(
    (messageID: string) => {
      const doRevert = async () => {
        const result = await useSessions.getState().revertToMessage(messageID)
        applyRevertResult(result)
      }
      // Editing overwrites the composer — don't silently clobber an
      // in-progress unsent draft.
      if (inputRef.current.trim()) {
        Alert.alert(
          t("session.alerts.replaceDraftTitle"),
          t("session.alerts.replaceDraftMessage"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("session.actions.replace"), style: "destructive", onPress: doRevert },
          ],
          { cancelable: false },
        )
        return
      }
      doRevert()
    },
    [applyRevertResult, t],
  )

  // Message actions live in the bubble header as buttons (Select text / Edit),
  // so there is no long-press action sheet here any more — holding a message
  // must not pop a menu, because a long-press on the bubble competed with
  // horizontal scrolling in code blocks and with text selection.

  const scrollToBottom = useCallback(
    (animated = true) => {
      // Latest resets the logical viewport before its native callback
      // arrives, so a stale scroll event queued mid-jump can't resurrect
      // the old position (see the "Latest resets" regression in
      // message-navigation.test.ts).
      nav.manual(0)
      if (navRetry.current) clearTimeout(navRetry.current)
      flatListRef.current?.scrollToOffset({ offset: 0, animated })
    },
    [nav],
  )

  // Follow new content (issue #155: "Message cannot be scrolled automatically").
  //
  // scrollToBottom() was previously only wired to the manual scroll button, so
  // nothing followed an arriving or streaming message. Compounding that,
  // maintainVisibleContentPosition (below) deliberately holds visible items
  // still when the data changes — and since new messages are inserted at index
  // 0 of this inverted list, that setting parks new content just outside the
  // viewport. That prop is worth keeping (it stops the jump when older pages
  // load), so instead scroll explicitly.
  //
  // Only when the user is already at the bottom: someone who scrolled up to
  // read history must not be yanked back down mid-sentence. See
  // src/lib/auto-scroll.ts.
  const newest = messageData[0]
  const contentSignature = transcriptSignature(
    messageData.length,
    newest ? (newest.parts || []).reduce((n, part) => n + (part.text?.length ?? 0), 0) : 0,
  )
  const prevSignatureRef = useRef<string | null>(null)
  useEffect(() => {
    const auto = shouldAutoScroll({
      offsetY: scrollOffsetRef.current,
      previousSignature: prevSignatureRef.current,
      currentSignature: contentSignature,
    })
    prevSignatureRef.current = contentSignature
    if (auto) scrollToBottom(true)
  }, [contentSignature, scrollToBottom])

  // Re-select on every focus, not just mount. currentSession/messages/
  // permissions are a single global store, and the native stack keeps screens
  // underneath a pushed one mounted. Without re-selecting on focus, navigating
  // to another session and back would leave this screen bound to the *other*
  // session's data (and its permission/question prompts) — so a user could
  // approve the wrong session's tool call. useFocusEffect re-binds this screen
  // to its own session whenever it becomes visible again.
  useFocusEffect(
    useCallback(() => {
      if (!id) return
      selectSession(id, directory).then(() => {
        // Re-fetch pending permissions/questions from the server to recover from
        // missed SSE events or failed optimistic removals
        const connState = useConnections.getState()
        const c = directory ? (connState.clientForDirectory(directory) ?? connState.client) : connState.client
        if (c) refreshPending(c, id)
      })
    }, [id, directory]),
  )

  // Sync model chip from latest assistant message
  useEffect(() => {
    if (!messages || messages.length === 0) return
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === "assistant" && msg.providerID && msg.modelID) {
        setModel({ providerID: msg.providerID, modelID: msg.modelID })
        return
      }
      if (msg.role === "user" && msg.model) {
        setModel(msg.model)
        return
      }
    }
  }, [currentSession?.id, messages?.length])

  // Slash command handler
  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      if (cmd.type === "builtin") {
        switch (cmd.trigger) {
          case "new":
            router.back()
            return
          case "model":
            setInput("")
            modelSheetRef.current?.expand()
            return
          case "agent":
            setInput("")
            cycleAgent()
            return
        }
      }
      setInput(`/${cmd.trigger} `)
    },
    [router, cycleAgent],
  )

  // --- Image picking ---

  // Convert any image (including HEIC/HEIF from iOS) to guaranteed JPEG bytes
  const MAX_DIMENSION = 1568 // Anthropic recommended max
  async function toJpeg(uri: string, width: number, height: number): Promise<Attachment> {
    const actions: ImageManipulator.Action[] = []
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height)
      actions.push({ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } })
    }
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.8,
      base64: true,
    })
    return {
      uri: result.uri,
      mime: "image/jpeg",
      filename: "image.jpg",
      width: result.width,
      height: result.height,
      base64: result.base64 || undefined,
    }
  }

  const pickFromLibrary = useCallback(async () => {
    let result: ImagePicker.ImagePickerResult
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1, // full quality - we compress in manipulator
      })
    } catch (err) {
      console.error("Failed to launch image library:", err)
      Alert.alert(t("session.alerts.imageFailedTitle"), t("session.alerts.imageFailedMessage"))
      return
    }
    if (result.canceled) return
    const settled = await Promise.allSettled(result.assets.map((a) => toJpeg(a.uri, a.width, a.height)))
    const items = settled.filter((r) => r.status === "fulfilled").map((r) => r.value)
    if (items.length) setAttachments((prev) => [...prev, ...items])
    if (settled.some((r) => r.status === "rejected")) {
      console.error(
        "Failed to process image(s):",
        settled.filter((r) => r.status === "rejected").map((r) => r.reason),
      )
      Alert.alert(t("session.alerts.imageFailedTitle"), t("session.alerts.imageFailedMessage"))
    }
  }, [t])

  const pickFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(t("session.alerts.cameraPermissionTitle"), t("session.alerts.cameraPermissionMessage"))
      return
    }
    let result: ImagePicker.ImagePickerResult
    try {
      result = await ImagePicker.launchCameraAsync({ quality: 1 })
    } catch (err) {
      console.error("Failed to launch camera:", err)
      Alert.alert(t("session.alerts.imageFailedTitle"), t("session.alerts.imageFailedMessage"))
      return
    }
    if (result.canceled) return
    const a = result.assets[0]
    try {
      const item = await toJpeg(a.uri, a.width, a.height)
      setAttachments((prev) => [...prev, item])
    } catch (err) {
      console.error("Failed to process photo:", err)
      Alert.alert(t("session.alerts.imageFailedTitle"), t("session.alerts.imageFailedMessage"))
    }
  }, [t])

  const pasteFromClipboard = useCallback(async () => {
    // Try image first
    const hasImage = await Clipboard.hasImageAsync()
    if (hasImage) {
      const img = await Clipboard.getImageAsync({ format: "png" })
      if (img?.data) {
        const uri = img.data.startsWith("data:") ? img.data : `data:image/png;base64,${img.data}`
        const item = await toJpeg(uri, img.size.width, img.size.height)
        setAttachments((prev) => [...prev, item])
        return
      }
    }
    // Fall back to text
    const hasText = await Clipboard.hasStringAsync()
    if (hasText) {
      const text = await Clipboard.getStringAsync()
      if (text) {
        setInput((prev) => prev + text)
        return
      }
    }
    Alert.alert(t("session.alerts.emptyClipboardTitle"), t("session.alerts.emptyClipboardMessage"))
  }, [t])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // --- Send ---
  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return
    const authenticated = await authenticateForMessage()
    if (!authenticated) {
      Alert.alert(t("session.alerts.authRequiredTitle"), t("session.alerts.authRequiredMessage"))
      return
    }

    const text = input.trim()
    const files = [...attachments]
    setInput("")
    setAttachments([])

    // Server slash commands (no attachments for commands)
    if (text.startsWith("/") && files.length === 0) {
      const [cmdName, ...args] = text.split(" ")
      const name = cmdName.slice(1)
      const match = serverCommands.find((c) => c.name === name)
      if (match && sessionClient && currentSession) {
        sessionClient.session
          .command(currentSession.id, {
            command: name,
            arguments: args.join(" "),
            agent,
            model: model ? `${model.providerID}/${model.modelID}` : undefined,
          })
          .catch((err) => console.error("Command failed:", err))
        return
      }
    }

    // Messages are queued server-side when the session is busy.
    // No need to abort - just send and it will be processed after current response.
    try {
      await sendMessage(text, model || undefined, agent || undefined, files, variant || undefined)
    } catch (err) {
      console.error("Send failed:", err)
      // Restore the user's text and attachments so their input isn't lost.
      setInput((prev) => (prev ? prev : text))
      setAttachments((prev) => (prev.length ? prev : files))
      Alert.alert(t("session.alerts.sendFailedTitle"), t("session.alerts.sendFailedMessage"))
    }
  }

  // In inverted mode, offset 0 = bottom (newest message). Track the live
  // offset in a ref as well as state: the auto-scroll effect above needs the
  // current position without taking `offsetY` as a dependency, which would
  // re-run it on every scroll frame.
  const scrollOffsetRef = useRef(0)
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement } = event.nativeEvent
      scrollOffsetRef.current = contentOffset.y
      nav.observe(contentOffset.y, layoutMeasurement.height)
      // The strip and auto-follow share one threshold
      // (AT_BOTTOM_THRESHOLD_PX inside shouldShowScrollButton) — the strip
      // appears exactly when auto-follow stops, no drift between the two.
      setShowScrollButton(shouldShowScrollButton(contentOffset.y))
      setCurrentNavIndex((prev) => {
        const next = nav.current()
        return prev === next ? prev : next
      })
    },
    [nav],
  )

  const moveMessage = (direction: 1 | -1) => {
    // Previous at the oldest loaded message with older pages still on the
    // server: load the next batch instead of going nowhere, then advance
    // into it when it lands (see the effect below). handleLoadMore owns the
    // loadingTriggered guard, so a tap can't double-load.
    if (direction === 1 && nav.ids.length > 0 && nav.current() === nav.ids.length - 1 && hasMore) {
      pendingNavLoad.current = true
      handleLoadMore()
      return
    }
    if (nav.move(direction) === undefined) return
    navAttempts.current = 0
    setCurrentNavIndex(nav.current())
    seekMessage()
  }

  // Previous tapped at the oldest loaded message while older pages exist:
  // the batch has landed — advance into it, unless the user scrolled
  // manually while it loaded (onScrollBeginDrag clears the flag, so the
  // tap's target is stale and no jump happens).
  useEffect(() => {
    if (!pendingNavLoad.current || loadingMore) return
    pendingNavLoad.current = false
    if (nav.move(1) === undefined) return
    navAttempts.current = 0
    setCurrentNavIndex(nav.current())
    seekMessage()
  }, [messageData, loadingMore, nav, seekMessage])

  // Content changed (streaming append, batch landed, revert): re-derive the
  // current message from the same id, so the counter stays anchored while
  // the list shifts underneath it.
  useEffect(() => {
    setCurrentNavIndex((prev) => {
      const next = nav.current()
      return prev === next ? prev : next
    })
  }, [messageData, nav])

  // Debounce: onEndReached can fire multiple times during a single scroll gesture
  const loadingTriggered = useRef(false)
  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingMore && !loadingTriggered.current) {
      loadingTriggered.current = true
      loadOlderMessages()
    }
  }, [hasMore, loadingMore, loadOlderMessages])

  // Reset trigger when loading finishes
  useEffect(() => {
    if (!loadingMore) loadingTriggered.current = false
  }, [loadingMore])

  // Detect reconnecting → stable transition for the "Connected ✓" flash.
  // reconnectAttempts and lastDisconnectAt reset in the same set() call, so we
  // can't use lastDisconnectAt alone; a useRef tracks the prior reconnecting state.
  useEffect(() => {
    const isReconnecting = reconnectAttempts > 0
    if (prevReconnecting.current && !isReconnecting) {
      setShowConnectedFlash(true)
      const t = setTimeout(() => setShowConnectedFlash(false), 2000)
      return () => clearTimeout(t)
    }
    prevReconnecting.current = isReconnecting
  }, [reconnectAttempts])

  const handlePermissionReply = async (requestID: string, reply: "once" | "always" | "reject") => {
    if (!sessionClient || !sessionID) return
    // Snapshot for rollback
    const snapshot = useEvents.getState().permissions[sessionID] || []
    // Optimistically remove from UI
    useEvents.setState((state) => ({
      permissions: {
        ...state.permissions,
        [sessionID]: snapshot.filter((p) => p.id !== requestID),
      },
    }))
    try {
      await sessionClient.permission.reply(requestID, reply)
    } catch (err) {
      console.error("Permission reply failed:", err)
      // Restore the prompt so the user can retry
      useEvents.setState((state) => ({
        permissions: { ...state.permissions, [sessionID]: snapshot },
      }))
      Alert.alert(t("session.alerts.replyFailedTitle"), t("session.alerts.replyFailedMessage"))
    }
  }

  const handleQuestionReply = async (requestID: string, answers: string[][]) => {
    if (!sessionClient || !sessionID) return
    const snapshot = useEvents.getState().questions[sessionID] || []
    useEvents.setState((state) => ({
      questions: {
        ...state.questions,
        [sessionID]: snapshot.filter((q) => q.id !== requestID),
      },
    }))
    try {
      await sessionClient.question.reply(requestID, answers)
    } catch (err) {
      console.error("Question reply failed:", err)
      useEvents.setState((state) => ({
        questions: { ...state.questions, [sessionID]: snapshot },
      }))
      Alert.alert(t("session.alerts.replyFailedTitle"), t("session.alerts.replyFailedMessage"))
    }
  }

  const handleQuestionReject = async (requestID: string) => {
    if (!sessionClient || !sessionID) return
    const snapshot = useEvents.getState().questions[sessionID] || []
    useEvents.setState((state) => ({
      questions: {
        ...state.questions,
        [sessionID]: snapshot.filter((q) => q.id !== requestID),
      },
    }))
    try {
      await sessionClient.question.reject(requestID)
    } catch (err) {
      console.error("Question reject failed:", err)
      useEvents.setState((state) => ({
        questions: { ...state.questions, [sessionID]: snapshot },
      }))
      Alert.alert(t("session.alerts.rejectFailedTitle"), t("session.alerts.rejectFailedMessage"))
    }
  }

  // Copy helper for the error banners (#214 AF-4): copy the full error
  // text to the clipboard and confirm with a toast.
  const copyTextWithToast = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text)
    if (Platform.OS === "android") ToastAndroid.show(t("session.actions.copied"), ToastAndroid.SHORT)
  }, [t])

  const handleModelSelect = useCallback(
    (providerID: string, modelID: string) => {
      setModel({ providerID, modelID })
    },
    [setModel],
  )

  // Current agent display
  const currentAgent = agents.find((a) => a.name === agent)
  const agentColor = currentAgent?.color || "#8b5cf6"
  const modelLabel = model?.modelID ? model.modelID.split("/").pop() || model.modelID : "default"

  // Variants for current model (for reasoning effort picker)
  const currentModelVariants = useMemo(() => {
    if (!model) return undefined
    const provider = providers.find((p) => p.id === model.providerID)
    const found = provider?.models.find((m) => m.id === model.modelID)
    return found?.variants
  }, [model, providers])

  // Docked navigation strip (#214) — derived state for the strip below.
  // nav.ids is newest-first (messageData order); N counts from the oldest,
  // so N = total - index. The strip shows only when scrolled past the
  // auto-follow threshold with more than one message to walk between —
  // a single-message session never shows it.
  const navTotal = navigableIds.length
  const navIndex = currentNavIndex >= 0 ? currentNavIndex : nav.current()
  const navCurrent = navIndex >= 0 ? navTotal - navIndex : 1
  const prevDisabled = navIndex < 0 || (navIndex >= navTotal - 1 && !hasMore)
  const nextDisabled = navIndex <= 0
  const prevLoading = loadingMore && navIndex >= navTotal - 1 && navIndex >= 0
  const navStripVisible = !isLoading && showScrollButton && navTotal > 1
  const compactNav = windowWidth < 360
  // Full text for the reconnect banner's Copy action: attempt line + last
  // error line, exactly what the banner shows.
  const reconnectCopyText = lastDisconnectReason
    ? `${t("session.banners.reconnecting", { attempt: reconnectAttempts })}\n${t("session.banners.lastError", { error: lastDisconnectReason })}`
    : t("session.banners.reconnecting", { attempt: reconnectAttempts })

  const navigation = useNavigation()

  // Session cost in the header (#293): cumulative $ spent so far, summed
  // from assistant messages — the same total SessionInfo shows, but visible
  // without opening it. Null (renders nothing) until the first priced
  // assistant message lands. A string dep, so the header only reconfigures
  // when the displayed cost changes — not on every streamed token.
  const costText = useMemo(() => sessionCostText(messages ?? []), [messages])

  // Header options are set via effect, not inline <Stack.Screen>: this screen
  // re-renders on every streamed message, and inline options pushed a native
  // header-config update each render — the trigger for the react-native-screens
  // "child already has a parent" crash (Sentry OPENCODE-MOBILE-6/-7).
  useEffect(() => {
    navigation.setOptions({
      title: currentSession?.title || t("session.titleFallback"),
      headerRight: () => (
        <View style={s.headerRight}>
          {shortDir && (
            <View style={[s.dirBadge, isDark && s.dirBadgeDark]}>
              <Ionicons name="folder-outline" size={14} color={isDark ? "#888888" : "#666666"} />
              <Text style={[s.dirText, isDark && s.dirTextDark]}>{shortDir}</Text>
            </View>
          )}
          {costText && (
            <Text testID="session-cost" style={[s.costText, isDark && s.costTextDark]}>
              {costText}
            </Text>
          )}
          <TouchableOpacity onPress={() => setShowInfo((v) => !v)} hitSlop={8}>
            <Ionicons
              name={showInfo ? "stats-chart" : "stats-chart-outline"}
              size={20}
              color={showInfo ? "#3b82f6" : isDark ? "#888888" : "#666666"}
            />
          </TouchableOpacity>
        </View>
      ),
    })
  }, [navigation, currentSession?.title, shortDir, costText, showInfo, isDark, t])

  return (
    <>
      <KeyboardAvoidingView
        style={[
          s.container,
          isDark && s.containerDark,
          Platform.OS === "android" && { paddingBottom: jsKeyboardPadding },
        ]}
        // iOS keeps behavior="padding" with its established offset (90).
        // Android applies the IME-reported height directly as bottom
        // padding (see keyboard-offset.ts): RN 0.81 retains a non-zero
        // vertical offset as stale padding after keyboardDidHide, so
        // Android uses behavior={undefined} and the hide listener above
        // explicitly resets the padding to zero. On Android 15+ the
        // native IME-insets listener in MainActivity owns the IME height
        // instead, so the JS padding stays off there — exactly one layer
        // applies it on every API level.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset(Platform.OS, insets.top)}
      >
        {/* Session info pulldown */}
        <SessionInfo
          session={currentSession}
          messages={messages || []}
          providers={providers}
          visible={showInfo}
          isDark={isDark}
          hasMore={hasMore}
          loadingAll={loadingMore}
          onLoadAll={() => {
            if (hasMore && !loadingMore) loadOlderMessages()
          }}
          onScrollToTop={() => {
            nav.manual()
            if (navRetry.current) clearTimeout(navRetry.current)
            flatListRef.current?.scrollToEnd({ animated: true })
          }}
          onClose={() => setShowInfo(false)}
        />

        {/* Full-screen selectable text (message action sheet -> "Select text") */}
        <MessageTextSheet visible={textSheet !== null} text={textSheet ?? ""} onClose={() => setTextSheet(null)} />

        {/* Session error (agent run failed) — session.error SSE event sets
            this while the user is viewing the session. Dismissible; also
            cleared by the next send. */}
        {error && (
          <View style={[s.banner, s.bannerError]}>
            <Text style={s.bannerText}>{error}</Text>
            <View style={s.bannerErrorRow}>
              <Text style={[s.bannerText, s.bannerErrorNext]}>{t("session.banners.errorNextAction")}</Text>
              <View style={s.bannerErrorActions}>
                <TouchableOpacity onPress={() => copyTextWithToast(error)} hitSlop={8}>
                  <Text style={s.bannerErrorAction}>{t("session.actions.copy")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => useSessions.setState({ error: null })} hitSlop={8}>
                  <Text style={s.bannerErrorAction}>{t("session.banners.dismiss")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* SSE reconnect/connected banner */}
        {reconnectAttempts > 0 && (
          <View style={[s.banner, s.bannerReconnecting, s.bannerRow]}>
            <View style={s.bannerTextCol}>
              <Text style={s.bannerText}>{t("session.banners.reconnecting", { attempt: reconnectAttempts })}</Text>
              {lastDisconnectReason && (
                <Text style={[s.bannerText, s.bannerSubText]} numberOfLines={2}>
                  {t("session.banners.lastError", { error: lastDisconnectReason })}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={s.bannerCopyPill}
              onPress={() => copyTextWithToast(reconnectCopyText)}
              accessibilityRole="button"
              accessibilityLabel={t("session.actions.copy")}
              hitSlop={8}
            >
              <Text style={s.bannerCopyText}>{t("session.actions.copy")}</Text>
            </TouchableOpacity>
          </View>
        )}
        {showConnectedFlash && reconnectAttempts === 0 && (
          <View style={[s.banner, s.bannerConnected]}>
            <Text style={s.bannerText}>{t("session.banners.connected")}</Text>
          </View>
        )}

        {/* Pending revert (from "Edit message") — offer a way back before it's
            cleaned up by the next prompt. */}
        {revertMessageID && (
          <View style={[s.banner, s.bannerRevert]}>
            <Text style={s.bannerText}>{t("session.banners.reverted")}</Text>
            <TouchableOpacity
              onPress={() => {
                unrevertSession()
                // The composer was prefilled with the reverted message's text/
                // attachments (see applyRevertResult) — clear it so Undo doesn't
                // leave a stale draft that could be sent as a duplicate.
                setInput("")
                setAttachments([])
              }}
              hitSlop={8}
            >
              <Text style={s.bannerAction}>{t("session.banners.undo")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Subagent children (#187) — above the message list, outside the
            FlatList. Read-only; a load failure shows its own error + retry
            and never blocks the transcript. */}
        {id ? <SubagentSection parentId={id} isDark={isDark} /> : null}

        {isLoading ? (
          <View style={s.loading}>
            <ActivityIndicator size="large" color={isDark ? "#ffffff" : "#0a0a0a"} />
          </View>
        ) : (
          <View style={s.listWrap}>
            <FlatList
              ref={flatListRef}
              data={messageData}
              inverted
              CellRendererComponent={MessageCell}
              onLayout={(event) => {
                nav.observe(nav.offset, event.nativeEvent.layout.height)
              }}
              onScrollBeginDrag={() => {
                // The user took over: drop any pending seek/advance and
                // re-anchor from the viewport from here on.
                pendingNavLoad.current = false
                nav.manual()
                if (navRetry.current) clearTimeout(navRetry.current)
              }}
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                // Estimated jump toward the target so its rows mount; the
                // seek retry loop (seekMessage) settles on the real frame
                // once the target renders.
                flatListRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false })
              }}
              keyExtractor={(item) => item.message.id}
              renderItem={({ item }) => (
                <MessageBubble
                  message={item.message}
                  parts={item.parts}
                  isDark={isDark}
                  onSelectText={openSelectTextSheet}
                  onEdit={startEditFlow}
                />
              )}
              contentContainerStyle={s.messageList}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              // Prevent jump when older messages are prepended
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ListFooterComponent={
                loadingMore ? (
                  <View style={s.loadingMore}>
                    <ActivityIndicator size="small" color={isDark ? "#888888" : "#666666"} />
                    <Text style={[s.loadingMoreText, isDark && s.metaDark]}>{t("session.loadingOlder")}</Text>
                  </View>
                ) : null
              }
            />
            {/* Empty state rendered OUTSIDE the inverted list to avoid the
                inverted transform mirroring its text/icon (see #ui-mirror). */}
            {messageData.length === 0 && (
              <View style={s.emptyOverlay} pointerEvents="none">
                <Ionicons name="chatbubble-outline" size={48} color={isDark ? "#444444" : "#cccccc"} />
                <Text style={[s.emptyText, isDark && s.metaDark]}>{t("session.empty.title")}</Text>
                <Text style={[s.emptyHint, isDark && s.metaDark]}>{t("session.empty.hint")}</Text>
              </View>
            )}
          </View>
        )}

        {/* Message navigation strip (#214) — one in-flow row below the
            list, above StatusIndicator. It can never cover message text:
            in-flow layout has no overlap by construction. Strip taps are
            plain button presses: they never blur the composer or dismiss
            the keyboard. Below 360dp Previous/Next collapse to icon-only;
            the counter and Latest keep their labels. */}
        {navStripVisible && (
          <View style={[s.navStrip, isDark && s.navStripDark]}>
            <TouchableOpacity
              style={[s.navPill, isDark && s.navPillDark, prevDisabled && s.navPillDisabled]}
              onPress={() => moveMessage(1)}
              disabled={prevDisabled}
              accessibilityRole="button"
              accessibilityLabel={t("session.nav.previousLabel")}
              accessibilityState={{ disabled: prevDisabled }}
              testID="nav-previous"
            >
              {prevLoading ? (
                <ActivityIndicator size="small" color={isDark ? "#888888" : "#666666"} />
              ) : (
                <>
                  <Ionicons name="chevron-up" size={18} color={isDark ? "#ffffff" : "#0a0a0a"} />
                  {!compactNav && (
                    <Text style={[s.navPillText, isDark && s.navPillTextDark]}>{t("session.nav.previous")}</Text>
                  )}
                </>
              )}
            </TouchableOpacity>
            <Text
              style={[s.navCounter, isDark && s.navCounterDark]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={t("session.nav.counterLabel", { current: navCurrent, total: navTotal })}
            >
              {t("session.nav.counter", { current: navCurrent, total: `${navTotal}${hasMore ? "+" : ""}` })}
            </Text>
            <TouchableOpacity
              style={[s.navPill, isDark && s.navPillDark, nextDisabled && s.navPillDisabled]}
              onPress={() => moveMessage(-1)}
              disabled={nextDisabled}
              accessibilityRole="button"
              accessibilityLabel={t("session.nav.nextLabel")}
              accessibilityState={{ disabled: nextDisabled }}
              testID="nav-next"
            >
              {!compactNav && (
                <Text style={[s.navPillText, isDark && s.navPillTextDark]}>{t("session.nav.next")}</Text>
              )}
              <Ionicons name="chevron-down" size={18} color={isDark ? "#ffffff" : "#0a0a0a"} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.navPill, s.navLatest, isDark && s.navLatestDark]}
              onPress={() => scrollToBottom(true)}
              accessibilityRole="button"
              accessibilityLabel={t("session.nav.latestLabel")}
              testID="nav-latest"
            >
              <View style={s.navDoubleCaret}>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  style={{ marginBottom: -7 }}
                  color={isDark ? "#0a0a0a" : "#ffffff"}
                />
                <Ionicons name="chevron-down" size={14} color={isDark ? "#0a0a0a" : "#ffffff"} />
              </View>
              <Text style={[s.navPillText, s.navLatestText, isDark && s.navLatestTextDark]}>
                {t("session.nav.latest")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status */}
        {currentSession && <StatusIndicator sessionID={currentSession.id} isDark={isDark} />}

        {/* Permissions */}
        {permissions.map((perm) => (
          <PermissionPrompt
            key={perm.id}
            permission={perm}
            isDark={isDark}
            onReply={(reply) => handlePermissionReply(perm.id, reply)}
          />
        ))}

        {/* Questions */}
        {questions.map((q) => (
          <QuestionPrompt
            key={q.id}
            request={q}
            isDark={isDark}
            onReply={(answers) => handleQuestionReply(q.id, answers)}
            onReject={() => handleQuestionReject(q.id)}
          />
        ))}

        {/* Slash popover */}
        {slashActive && (
          <SlashPopover query={slashQuery} commands={allCommands} isDark={isDark} onSelect={handleSlashSelect} />
        )}

        {/* Agent/model toolbar */}
        <View style={[s.toolbar, isDark && s.toolbarDark]}>
          <TouchableOpacity
            style={[s.agentChip, { borderColor: agentColor }]}
            onPress={() => cycleAgent()}
            onLongPress={() => cycleAgent(-1)}
          >
            <View style={[s.agentDot, { backgroundColor: agentColor }]} />
            <Text style={[s.agentLabel, isDark && s.textWhite]}>{agent || "build"}</Text>
            <Ionicons name="swap-horizontal-outline" size={12} color={isDark ? "#888888" : "#666666"} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.modelChip, isDark && s.modelChipDark]}
            onPress={() => modelSheetRef.current?.expand()}
            testID="model-chip"
          >
            <Ionicons name="hardware-chip-outline" size={14} color={isDark ? "#888888" : "#666666"} />
            <Text style={[s.modelLabel, isDark && s.metaDark]} numberOfLines={1}>
              {modelLabel}
            </Text>
          </TouchableOpacity>

          {currentModelVariants && Object.keys(currentModelVariants).length > 0 && (
            <TouchableOpacity
              style={[s.variantChip, isDark && s.variantChipDark, variant && s.variantChipActive]}
              onPress={() => variantSheetRef.current?.expand()}
              testID="variant-chip"
            >
              <Ionicons name="flash-outline" size={14} color={variant ? "#8b5cf6" : isDark ? "#888888" : "#666666"} />
              <Text style={[s.variantLabel, isDark && s.metaDark, variant && s.variantLabelActive]} numberOfLines={1}>
                {variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : t("session.toolbar.auto")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Attachment preview */}
        <ImageAttachments attachments={attachments} isDark={isDark} onRemove={removeAttachment} />

        {/* Input */}
        <View
          style={[s.inputContainer, isDark && s.inputContainerDark, { paddingBottom: Math.max(12, insets.bottom) }]}
        >
          <View style={s.inputRow}>
            {/* Attach button */}
            <TouchableOpacity style={s.attachBtn} onPress={pickFromLibrary} onLongPress={pickFromCamera}>
              <Ionicons name="add-circle-outline" size={26} color={isDark ? "#888888" : "#666666"} />
            </TouchableOpacity>

            {/* Clipboard paste button */}
            <TouchableOpacity style={s.attachBtn} onPress={pasteFromClipboard}>
              <Ionicons name="clipboard-outline" size={22} color={isDark ? "#888888" : "#666666"} />
            </TouchableOpacity>

            <TextInput
              style={[s.input, isDark && s.inputDark, speech.listening && s.inputListening, { maxHeight: inputMaxHeight }]}
              placeholder={
                speech.listening
                  ? t("session.input.placeholderListening")
                  : isSending
                    ? t("session.input.placeholderFollowUp")
                    : t("session.input.placeholderDefault")
              }
              placeholderTextColor={speech.listening ? "#ef4444" : isDark ? "#666666" : "#999999"}
              value={speech.listening ? speech.transcript : input}
              onChangeText={speech.listening ? undefined : setInput}
              editable={!speech.listening}
              multiline
              scrollEnabled
              maxLength={10000}
              testID="chat-message-input"
            />
            {/* Stop button: only when busy and no input */}
            {isSending && !input.trim() && attachments.length === 0 && !speech.listening && (
              <TouchableOpacity style={s.stopBtn} onPress={abortSession}>
                <Ionicons name="stop" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
            {/* Mic button: when no input, not sending, and not listening */}
            {!isSending && !input.trim() && attachments.length === 0 && !speech.listening && (
              <TouchableOpacity style={s.micBtn} onPress={speech.start}>
                <Ionicons name="mic" size={22} color={isDark ? "#888888" : "#666666"} />
              </TouchableOpacity>
            )}
            {/* Listening indicator: tap to stop */}
            {speech.listening && (
              <TouchableOpacity style={s.micBtnActive} onPress={speech.stop}>
                <Ionicons name="mic" size={22} color="#ffffff" />
              </TouchableOpacity>
            )}
            {/* Send button: when there's input */}
            {!speech.listening && (input.trim() || attachments.length > 0) && (
              <TouchableOpacity style={s.sendBtn} onPress={handleSend} testID="chat-send-button">
                <Ionicons name="send" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Model picker bottom sheet */}
      <ModelPicker
        sheetRef={modelSheetRef}
        providers={providers}
        selected={model}
        isDark={isDark}
        onSelect={handleModelSelect}
      />

      {/* Reasoning effort (variant) picker bottom sheet */}
      <VariantPicker
        sheetRef={variantSheetRef}
        variants={currentModelVariants}
        selected={variant}
        isDark={isDark}
        onSelect={setVariant}
      />
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  containerDark: { backgroundColor: "#0a0a0a" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  listWrap: { flex: 1, position: "relative" },

  // Messages
  messageList: { padding: 16, paddingBottom: 8 },

  // Message navigation strip (#214) — docked in-flow row below the list.
  // In-flow by construction: it can never overlap message text, which is
  // the defect that killed the floating controls in PR #215.
  navStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    height: 56,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    backgroundColor: "#ffffff",
  },
  navStripDark: { borderTopColor: "#1a1a1a", backgroundColor: "#0a0a0a" },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 22,
  },
  navPillDark: { borderColor: "#404040" },
  navPillDisabled: { opacity: 0.45 },
  navPillText: { fontSize: 14, fontWeight: "600", color: "#0a0a0a" },
  navPillTextDark: { color: "#ffffff" },
  navCounter: { fontSize: 14, fontWeight: "700", color: "#666666" },
  navCounterDark: { color: "#888888" },
  navLatest: { backgroundColor: "#0a0a0a", borderColor: "#0a0a0a" },
  navLatestDark: { backgroundColor: "#ffffff", borderColor: "#ffffff" },
  navLatestText: { color: "#ffffff" },
  navLatestTextDark: { color: "#0a0a0a" },
  // Two stacked chevrons form the double-down Latest caret.
  navDoubleCaret: { flexDirection: "column", alignItems: "center" },

  // Loading more (appears at top in inverted list = ListFooterComponent)
  loadingMore: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  loadingMoreText: { fontSize: 13, color: "#999999" },

  // Empty state overlay — sits on top of the (empty) inverted list, untransformed,
  // so its text/icon render upright and un-mirrored on Android.
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },

  // Empty
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 64 },
  emptyText: { fontSize: 16, color: "#999999", marginTop: 12 },
  emptyHint: { fontSize: 13, color: "#bbbbbb", marginTop: 4 },
  metaDark: { color: "#666666" },
  textWhite: { color: "#ffffff" },

  // Toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    backgroundColor: "#ffffff",
  },
  toolbarDark: { borderTopColor: "#1a1a1a", backgroundColor: "#0a0a0a" },
  agentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  agentLabel: { fontSize: 12, fontWeight: "600", color: "#0a0a0a" },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modelChipDark: { backgroundColor: "#1a1a1a" },
  modelLabel: { fontSize: 12, color: "#666666", maxWidth: 160 },

  // Variant (reasoning effort) chip
  variantChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  variantChipDark: { backgroundColor: "#1a1a1a" },
  variantChipActive: { backgroundColor: "#f5f3ff" },
  variantLabel: { fontSize: 12, color: "#666666" },
  variantLabelActive: { color: "#8b5cf6" },

  // Input
  inputContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    backgroundColor: "#ffffff",
  },
  inputContainerDark: { borderTopColor: "#1a1a1a", backgroundColor: "#0a0a0a" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  attachBtn: {
    width: 36,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
    color: "#0a0a0a",
  },
  inputDark: { backgroundColor: "#1a1a1a", color: "#ffffff" },
  inputListening: { borderWidth: 1, borderColor: "#ef4444" },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: "#cccccc" },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  micBtnActive: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  stopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  // Header
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dirBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dirBadgeDark: { backgroundColor: "#1a1a1a" },
  dirText: { fontSize: 12, color: "#666666", fontWeight: "500" },
  dirTextDark: { color: "#888888" },
  costText: { fontSize: 13, color: "#0a0a0a", fontWeight: "600", fontVariant: ["tabular-nums"] },
  costTextDark: { color: "#e5e5e5" },

  // SSE reconnect/connected banner
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: "center",
  },
  bannerReconnecting: { backgroundColor: "#92400e" },
  bannerConnected: { backgroundColor: "#065f46" },
  bannerText: { color: "#ffffff", fontSize: 13, fontWeight: "500" },
  // Reconnect banner with last-error line + Copy (#214 AF-4): text column
  // left, Copy pill top-right.
  bannerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  bannerTextCol: { flex: 1 },
  bannerSubText: { fontSize: 12, color: "#fde68a" },
  bannerCopyPill: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bannerCopyText: { color: "#92400e", fontSize: 13, fontWeight: "700" },

  // Session error banner (agent run failed)
  bannerError: {
    backgroundColor: "#991b1b",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 4,
  },
  bannerErrorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  bannerErrorNext: { flex: 1, color: "#fecaca", fontSize: 12 },
  bannerErrorActions: { flexDirection: "row", gap: 16 },
  bannerErrorAction: { color: "#fecaca", fontSize: 13, fontWeight: "700" },

  // Pending revert (edit message) banner
  bannerRevert: {
    backgroundColor: "#1e3a8a",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bannerAction: { color: "#93c5fd", fontSize: 13, fontWeight: "700" },
})
