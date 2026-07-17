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
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native"
import { useLocalSearchParams, Stack, useRouter } from "expo-router"
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
  type SlashCommand,
  type Attachment,
} from "../../src/components/chat"
import { useSessions } from "../../src/stores/sessions"
import { useEvents, refreshPending } from "../../src/stores/events"
import { useConnections } from "../../src/stores/connections"
import { useAuth } from "../../src/stores/auth"
import { useCatalog } from "../../src/stores/catalog"
import { useSpeech } from "../../src/lib/speech"

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

  const {
    currentSession,
    messages,
    parts,
    isLoading,
    loadingMore,
    hasMore,
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

  // SSE reconnect banner
  const reconnectAttempts = useEvents((s) => s.reconnectAttempts)
  const [showConnectedFlash, setShowConnectedFlash] = useState(false)
  const prevReconnecting = useRef(false)

  // Voice input — transcript appends to the text input on completion
  const speech = useSpeech(
    useCallback((text: string) => {
      setInput((prev) => (prev ? prev + " " + text : text))
    }, []),
  )

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

  // Tracks the latest composer text without pulling `input` into
  // handleMessageLongPress's deps — kept as a plain ref assignment (not
  // state) so the callback below stays referentially stable across
  // keystrokes for MessageBubble's custom memo comparator.
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

  // Stable across renders (reads fresh state via getState() rather than
  // closing over props) so MessageBubble's custom memo comparator can bail
  // safely without risking a stale handler.
  const handleMessageLongPress = useCallback((messageID: string) => {
    Alert.alert(t("session.alerts.messageActionsTitle"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("session.actions.editMessage"),
        onPress: () => {
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
      },
    ])
  }, [applyRevertResult, t])

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated })
  }, [])

  useEffect(() => {
    if (!id) return
    selectSession(id, directory).then(() => {
      // Re-fetch pending permissions/questions from the server to recover from
      // missed SSE events or failed optimistic removals
      const connState = useConnections.getState()
      const c = directory ? (connState.clientForDirectory(directory) ?? connState.client) : connState.client
      if (c) refreshPending(c, id)
    })
  }, [id, directory])

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1, // full quality - we compress in manipulator
    })
    if (result.canceled) return
    const items = await Promise.all(result.assets.map((a) => toJpeg(a.uri, a.width, a.height)))
    setAttachments((prev) => [...prev, ...items])
  }, [])

  const pickFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(t("session.alerts.cameraPermissionTitle"), t("session.alerts.cameraPermissionMessage"))
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 })
    if (result.canceled) return
    const a = result.assets[0]
    const item = await toJpeg(a.uri, a.width, a.height)
    setAttachments((prev) => [...prev, item])
  }, [t])

  const pasteFromClipboard = useCallback(async () => {
    // Try image first
    const hasImage = await Clipboard.hasImageAsync()
    if (hasImage) {
      const img = await Clipboard.getImageAsync({ format: "png" })
      if (img?.data) {
        const uri = img.data.startsWith("data:") ? img.data : `data:image/png;base64,${img.data}`
        setAttachments((prev) => [
          ...prev,
          {
            uri,
            mime: "image/png",
            filename: "clipboard.png",
            width: img.size.width,
            height: img.size.height,
          },
        ])
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

  // In inverted mode, offset 0 = bottom. Show scroll button when scrolled away from bottom.
  const handleScroll = useCallback((event: any) => {
    const { contentOffset } = event.nativeEvent
    setShowScrollButton(contentOffset.y > 200)
  }, [])

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

  return (
    <>
      <Stack.Screen
        options={{
          title: currentSession?.title || t("session.titleFallback"),
          headerRight: () => (
            <View style={s.headerRight}>
              {shortDir && (
                <View style={[s.dirBadge, isDark && s.dirBadgeDark]}>
                  <Ionicons name="folder-outline" size={14} color={isDark ? "#888888" : "#666666"} />
                  <Text style={[s.dirText, isDark && s.dirTextDark]}>{shortDir}</Text>
                </View>
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
        }}
      />

      <KeyboardAvoidingView
        style={[s.container, isDark && s.containerDark]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
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
            flatListRef.current?.scrollToEnd({ animated: true })
          }}
          onClose={() => setShowInfo(false)}
        />

        {/* SSE reconnect/connected banner */}
        {reconnectAttempts > 0 && (
          <View style={[s.banner, s.bannerReconnecting]}>
            <Text style={s.bannerText}>{t("session.banners.reconnecting", { attempt: reconnectAttempts })}</Text>
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
            <TouchableOpacity onPress={() => unrevertSession()} hitSlop={8}>
              <Text style={s.bannerAction}>{t("session.banners.undo")}</Text>
            </TouchableOpacity>
          </View>
        )}

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
              keyExtractor={(item) => item.message.id}
              renderItem={({ item }) => (
                <MessageBubble
                  message={item.message}
                  parts={item.parts}
                  isDark={isDark}
                  onLongPress={handleMessageLongPress}
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
            {showScrollButton && (
              <TouchableOpacity style={[s.scrollBtn, isDark && s.scrollBtnDark]} onPress={() => scrollToBottom(true)}>
                <Ionicons name="chevron-down" size={24} color={isDark ? "#ffffff" : "#0a0a0a"} />
              </TouchableOpacity>
            )}
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
              style={[s.input, isDark && s.inputDark, speech.listening && s.inputListening]}
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

  // Scroll button
  scrollBtn: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollBtnDark: { backgroundColor: "#2a2a2a" },

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

  // SSE reconnect/connected banner
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: "center",
  },
  bannerReconnecting: { backgroundColor: "#92400e" },
  bannerConnected: { backgroundColor: "#065f46" },
  bannerText: { color: "#ffffff", fontSize: 13, fontWeight: "500" },

  // Pending revert (edit message) banner
  bannerRevert: {
    backgroundColor: "#1e3a8a",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bannerAction: { color: "#93c5fd", fontSize: 13, fontWeight: "700" },
})
