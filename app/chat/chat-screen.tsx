import UniversalForwardModal, { type ForwardSource } from "../../components/UniversalForwardModal";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import ChatMediaViewer, {
  type ChatMediaViewerItem,
} from "../../components/ChatMediaViewer";
import Avatar from "../../components/Avatar";
import ChatMediaAttachment from "../../components/ChatMediaAttachment";
import VoiceMessageBubble from "../../components/VoiceMessageBubble";
import VoiceMessageRecorderButton from "../../components/VoiceMessageRecorderButton";
import SharedPostCard from "../../components/SharedPostCard";
import MessageActionSurface from "../../components/MessageActionSurface";
import { Alert } from "../../lib/alert";
import { useAuth } from "../../lib/auth";
import {
  getChatMediaUrl,
  getChatMediaDownloadUrl,
  pickChatFile,
  pickChatMedia,
  uploadChatMedia,
  VOICE_MESSAGE_MAX_BYTES,
  type PickedChatMedia,
} from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { Message, MessageReaction, MessageType } from "../../lib/types";
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";
import { colors } from '../../lib/theme';
import { useDirectCalls } from '../../lib/direct-calls';


const MESSAGE_SELECT =
  "id, sender_id, receiver_id, body, created_at, read_at, edited_at, reply_to, forwarded_from, forwarded_from_type, forwarded_from_id, forwarded_from_sender, forwarded_from_chat, message_type, media_path, media_mime_type, message_reactions(user_id, reaction)";
const MESSAGE_SELECT_WITH_FILE_NAME =
  "id, sender_id, receiver_id, body, created_at, read_at, edited_at, reply_to, forwarded_from, forwarded_from_type, forwarded_from_id, forwarded_from_sender, forwarded_from_chat, message_type, media_path, media_mime_type, media_file_name, message_reactions(user_id, reaction)";
const BASIC_MESSAGE_SELECT = "id, sender_id, receiver_id, body, created_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissingMessagingUpgrade(error: { code?: string } | null): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST200"
  );
}

const palette = {
  get canvas() { return colors.bg; },
  get surface() { return colors.surface; },
  get surfaceRaised() { return colors.surfaceRaised; },
  get surfaceSoft() { return colors.surfaceSoft; },
  get ink() { return colors.text; },
  get muted() { return colors.muted; },
  get mutedDim() { return colors.dim; },
  get line() { return colors.border; },
  get accent() { return colors.accent; },
  get accentStrong() { return colors.accentStrong; },
  get accentTint() { return colors.accentDark; },
  get lime() { return colors.accent; },
  get incoming() { return colors.chatIncoming; },
  get danger() { return colors.danger; },
};

const STICKER_CATEGORIES = [
  {
    id: "popular",
    title: "Popular",
    icon: "sparkles-outline" as const,
    stickers: [
      { emoji: "🥹", label: "Cute" },
      { emoji: "😂", label: "LOL" },
      { emoji: "😍", label: "Love" },
      { emoji: "😭", label: "Crying" },
      { emoji: "😎", label: "Cool" },
      { emoji: "🤔", label: "Thinking" },
      { emoji: "🥰", label: "Lovely" },
      { emoji: "😴", label: "Sleepy" },
      { emoji: "🤯", label: "Wow" },
      { emoji: "😡", label: "Angry" },
      { emoji: "🤗", label: "Hug" },
      { emoji: "🥳", label: "Party" },
    ],
  },
  {
    id: "love",
    title: "Love",
    icon: "heart-outline" as const,
    stickers: [
      { emoji: "❤️", label: "Heart" },
      { emoji: "💖", label: "Sparkling heart" },
      { emoji: "💗", label: "Growing heart" },
      { emoji: "💕", label: "Two hearts" },
      { emoji: "💘", label: "Cupid" },
      { emoji: "😘", label: "Kiss" },
      { emoji: "🥰", label: "Love" },
      { emoji: "😍", label: "Adore" },
    ],
  },
  {
    id: "reactions",
    title: "Reactions",
    icon: "happy-outline" as const,
    stickers: [
      { emoji: "👍", label: "Like" },
      { emoji: "👎", label: "Dislike" },
      { emoji: "👏", label: "Clap" },
      { emoji: "🙏", label: "Thanks" },
      { emoji: "🔥", label: "Fire" },
      { emoji: "💯", label: "Perfect" },
      { emoji: "🎉", label: "Celebrate" },
      { emoji: "✨", label: "Shine" },
    ],
  },
];

function getMessageType(message: Message): MessageType {
  return message.message_type ?? "text";
}

async function attachSignedUrl(message: Message): Promise<Message> {
  const normalizedMessage = {
    ...message,
    reactions: message.reactions ?? message.message_reactions ?? [],
  };

  if (!message.media_path) {
    return { ...normalizedMessage, media_url: null };
  }

  try {
    return {
      ...normalizedMessage,
      media_url: await getChatMediaUrl(message.media_path),
    };
  } catch {
    return { ...normalizedMessage, media_url: null };
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number | null): string {
  if (value == null || value <= 0) return "Attachment ready";

  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function DecorativeOrb({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View
      pointerEvents="none"
      style={[
        lumoStyles.decorativeOrb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export default function Chat() {
  const lumoStyles = useThemedStyles(styles);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const otherId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { session } = useAuth();
  const router = useRouter();
  const me = session?.user.id;
  const { startCall, starting: callStarting, call: activeCall } = useDirectCalls();
  const listRef = useRef<FlatList<Message>>(null);

  const [profile, setProfile] = useState<{
    username: string;
    avatar_url: string | null;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [chatFeaturesAvailable, setChatFeaturesAvailable] = useState(true);
  const [chatFileNamesAvailable, setChatFileNamesAvailable] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [universalForwardSource, setUniversalForwardSource] =
    useState<ForwardSource | null>(null);
  const [confirmingMessageDelete, setConfirmingMessageDelete] = useState(false);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<
    { id: string; username: string }[]
  >([]);
  const [loadingForwardTargets, setLoadingForwardTargets] = useState(false);
  const [messageActionLoading, setMessageActionLoading] = useState(false);
  const [messageActionError, setMessageActionError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [callType, setCallType] = useState<"audio" | "video" | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  useEffect(() => {
    if (!callType) {
      setCallDuration(0);
      return;
    }
    const timer = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [callType]);

  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PickedChatMedia | null>(
    null,
  );
  const [showAttachmentUpgradeNotice, setShowAttachmentUpgradeNotice] =
    useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [activeStickerCategory, setActiveStickerCategory] = useState("popular");

  const activeCategory =
    STICKER_CATEGORIES.find(
      (category) => category.id === activeStickerCategory,
    ) ?? STICKER_CATEGORIES[0];
  const mediaViewerItems = useMemo<ChatMediaViewerItem[]>(() => {
    return messages
      .filter((message) => {
        const type = getMessageType(message);

        return (
          (type === "image" || type === "video") && Boolean(message.media_url)
        );
      })
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      )
      .map((message) => ({
        id: message.id,
        url: message.media_url!,
        type: getMessageType(message) as "image" | "video",
        senderLabel:
          message.sender_id === me ? "You" : (profile?.username ?? "Lumo user"),
        createdAt: message.created_at,
        fileName: message.media_file_name ?? null,
      }));
  }, [messages, me, profile?.username]);

  const selectedMediaIndex = selectedMediaId
    ? mediaViewerItems.findIndex((item) => item.id === selectedMediaId)
    : -1;
  const canSend = useMemo(
    () => Boolean(text.trim() || pendingMedia) && !sending,
    [text, pendingMedia, sending],
  );

  const markConversationRead = useCallback(
    async (otherUserId: string) => {
      if (!chatFeaturesAvailable) return;
      const { error } = await supabase.rpc("mark_messages_read", {
        p_other_user_id: otherUserId,
      });
      if (error) throw error;

      const readAt = new Date().toISOString();
      setMessages((current) =>
        current.map((message) =>
          message.sender_id === otherUserId &&
          message.receiver_id === me &&
          !message.read_at
            ? { ...message, read_at: readAt }
            : message,
        ),
      );
    },
    [chatFeaturesAvailable, me],
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !me ||
      !otherId ||
      !UUID_PATTERN.test(otherId) ||
      otherId === me ||
      !hasMoreMessages ||
      loadingOlderMessages ||
      searchText.trim()
    )
      return;
    const oldest = messages[messages.length - 1];
    if (!oldest) return;

    setLoadingOlderMessages(true);
    try {
      const conversationFilter =
        `and(sender_id.eq.${me},receiver_id.eq.${otherId}),` +
        `and(sender_id.eq.${otherId},receiver_id.eq.${me})`;
      const createQuery = () => {
        const query = supabase.from("messages");
        return chatFeaturesAvailable
          ? query
              .select(
                chatFileNamesAvailable
                  ? MESSAGE_SELECT_WITH_FILE_NAME
                  : MESSAGE_SELECT,
              )
              .or(conversationFilter)
          : query.select(BASIC_MESSAGE_SELECT).or(conversationFilter);
      };

      const [olderResult, sameTimeResult] = await Promise.all([
        createQuery()
          .lt("created_at", oldest.created_at)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(200)
          .returns<Message[]>(),
        createQuery()
          .eq("created_at", oldest.created_at)
          .lt("id", oldest.id)
          .order("id", { ascending: false })
          .limit(200)
          .returns<Message[]>(),
      ]);

      if (olderResult.error) throw olderResult.error;
      if (sameTimeResult.error) throw sameTimeResult.error;

      const uniqueRows = new Map<string, Message>();
      for (const row of [
        ...(olderResult.data ?? []),
        ...(sameTimeResult.data ?? []),
      ]) {
        uniqueRows.set(row.id, row as Message);
      }
      const page = [...uniqueRows.values()]
        .sort(
          (left, right) =>
            right.created_at.localeCompare(left.created_at) ||
            right.id.localeCompare(left.id),
        )
        .slice(0, 200);
      const enriched = await Promise.all(page.map(attachSignedUrl));

      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        return [
          ...current,
          ...enriched.filter((message) => !existingIds.has(message.id)),
        ];
      });
      setHasMoreMessages(page.length === 200);
      setErrorText(null);
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? `Older messages could not be loaded: ${error.message}`
          : "Older messages could not be loaded.",
      );
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [
    chatFeaturesAvailable,
    chatFileNamesAvailable,
    hasMoreMessages,
    loadingOlderMessages,
    me,
    messages,
    otherId,
    searchText,
  ]);

  const loadChat = useCallback(
    async (stillActive: () => boolean) => {
      if (!me || !otherId || !UUID_PATTERN.test(otherId) || otherId === me) {
        setErrorText("This conversation could not be opened.");
        setLoading(false);
        return;
      }

      try {
        setErrorText(null);

        const [profileResult, initialMessagesResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", otherId)
            .maybeSingle(),
          supabase
            .from("messages")
            .select(MESSAGE_SELECT_WITH_FILE_NAME)
            .or(
              `and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`,
            )
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(200)
            .returns<Message[]>(),
        ]);

        if (!stillActive()) return;
        if (profileResult.error) throw profileResult.error;

        setProfile({
          username: profileResult.data?.username ?? "Lumo user",
          avatar_url: profileResult.data?.avatar_url ?? null,
        });

        let hasExtendedSchema = true;
        let hasFileNameColumn = true;
        let rows: Message[];
        let messagesResult = initialMessagesResult;
        if (isMissingMessagingUpgrade(messagesResult.error)) {
          hasFileNameColumn = false;
          messagesResult = await supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .or(
              `and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`,
            )
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(200)
            .returns<Message[]>();
        }
        if (isMissingMessagingUpgrade(messagesResult.error)) {
          hasExtendedSchema = false;
          messagesResult = await supabase
            .from("messages")
            .select(BASIC_MESSAGE_SELECT)
            .or(
              `and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`,
            )
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(200)
            .returns<Message[]>();
        }
        if (messagesResult.error) throw messagesResult.error;
        rows = (messagesResult.data ?? []) as Message[];

        const enriched = await Promise.all(rows.map(attachSignedUrl));

        if (!stillActive()) return;
        setChatFeaturesAvailable(hasExtendedSchema);
        setChatFileNamesAvailable(hasFileNameColumn && hasExtendedSchema);
        setMessages(enriched);
        setHasMoreMessages(rows.length === 200);

        if (
          hasExtendedSchema &&
          rows.some(
            (message) => message.sender_id === otherId && !message.read_at,
          )
        ) {
          try {
            await markConversationRead(otherId);
          } catch (error) {
            if (stillActive()) {
              setErrorText(
                error instanceof Error
                  ? `Messages loaded, but read receipts could not be updated: ${error.message}`
                  : "Messages loaded, but read receipts could not be updated.",
              );
            }
          }
        }
      } catch (error: unknown) {
        console.error("LUMO CHAT LOAD ERROR:", error);

        if (stillActive()) {
          setErrorText(
            error instanceof Error
              ? error.message
              : JSON.stringify(error) || "Unknown Supabase error",
          );
        }
      } finally {
        if (stillActive()) setLoading(false);
      }
    },
    [markConversationRead, me, otherId],
  );

  useEffect(() => {
    let active = true;
    void loadChat(() => active);

    if (!me || !otherId || !UUID_PATTERN.test(otherId) || otherId === me) {
      return () => {
        active = false;
      };
    }

    const channel = supabase.channel(`chat-${me}-${otherId}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${me}`,
      },
      (payload) => {
        const incoming = payload.new as Message;
        if (incoming.sender_id !== otherId) return;

        void attachSignedUrl(incoming).then((message) => {
          if (!active) return;
          setMessages((current) =>
            current.some((item) => item.id === message.id)
              ? current
              : [message, ...current],
          );
          void markConversationRead(otherId).catch((error: unknown) => {
            if (!active) return;
            setErrorText(
              error instanceof Error
                ? `Read receipts could not be updated: ${error.message}`
                : "Read receipts could not be updated.",
            );
          });
        });
      },
    );

    if (chatFeaturesAvailable) {
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `sender_id=eq.${me}`,
          },
          (payload) => {
            const updated = payload.new as Message;
            if (updated.receiver_id !== otherId) return;
            setMessages((current) =>
              current.map((message) =>
                message.id === updated.id
                  ? { ...message, read_at: updated.read_at }
                  : message,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
            filter: `sender_id=eq.${otherId}`,
          },
          (payload) => {
            const removed = payload.old as { id?: string };
            if (!removed.id) return;
            setMessages((current) =>
              current.filter((message) => message.id !== removed.id),
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "message_reactions",
          },
          (payload) => {
            const reaction = (
              payload.eventType === "DELETE" ? payload.old : payload.new
            ) as MessageReaction & { message_id: string };
            if (!reaction.message_id) return;
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== reaction.message_id) return message;
                const reactions = message.reactions ?? [];
                const alreadyExists = reactions.some(
                  (item) =>
                    item.user_id === reaction.user_id &&
                    item.reaction === reaction.reaction,
                );
                if (payload.eventType === "DELETE") {
                  return {
                    ...message,
                    reactions: reactions.filter(
                      (item) =>
                        !(
                          item.user_id === reaction.user_id &&
                          item.reaction === reaction.reaction
                        ),
                    ),
                  };
                }
                return alreadyExists
                  ? message
                  : { ...message, reactions: [...reactions, reaction] };
              }),
            );
          },
        );
    }

    channel.subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [chatFeaturesAvailable, loadChat, markConversationRead, me, otherId]);

  useEffect(() => {
    const query = searchText.trim();
    if (
      !showSearch ||
      !query ||
      !me ||
      !otherId ||
      !UUID_PATTERN.test(otherId) ||
      otherId === me
    ) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    let active = true;
    const timeout = setTimeout(() => {
      setSearchLoading(true);
      void (async () => {
        try {
          if (!chatFeaturesAvailable) {
            const matches = messages.filter((message) =>
              message.body
                ?.toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            );
            if (active) {
              setSearchResults(matches);
              setSearchError("");
            }
            return;
          }

          const { data, error } = await supabase
            .from("messages")
            .select(
              chatFileNamesAvailable
                ? MESSAGE_SELECT_WITH_FILE_NAME
                : MESSAGE_SELECT,
            )
            .or(
              `and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`,
            )
            .ilike("body", `%${query}%`)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(100)
            .returns<Message[]>();

          if (error) throw error;
          const enriched = await Promise.all(
            ((data ?? []) as Message[]).map(attachSignedUrl),
          );
          if (active) {
            setSearchResults(enriched);
            setSearchError("");
          }
        } catch (error) {
          if (active) {
            setSearchError(
              error instanceof Error
                ? error.message
                : "Could not search this conversation.",
            );
            setSearchResults([]);
          }
        } finally {
          if (active) setSearchLoading(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [
    chatFeaturesAvailable,
    chatFileNamesAvailable,
    me,
    messages,
    otherId,
    searchText,
    showSearch,
  ]);

  const toggleMessageReaction = useCallback(
    async (message: Message, reaction: string) => {
      if (!me || !chatFeaturesAvailable) return;
      const alreadyReacted = (message.reactions ?? []).some(
        (item) => item.user_id === me && item.reaction === reaction,
      );
      const previous = message.reactions ?? [];
      const next: MessageReaction[] = alreadyReacted
        ? previous.filter(
            (item) => !(item.user_id === me && item.reaction === reaction),
          )
        : [...previous, { user_id: me, reaction }];
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, reactions: next } : item,
        ),
      );
      setSelectedMessage(null);

      try {
        const result = alreadyReacted
          ? await supabase
              .from("message_reactions")
              .delete()
              .eq("message_id", message.id)
              .eq("user_id", me)
              .eq("reaction", reaction)
          : await supabase
              .from("message_reactions")
              .insert({ message_id: message.id, user_id: me, reaction });
        if (result.error) throw result.error;
      } catch (error) {
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, reactions: previous } : item,
          ),
        );
        Alert.alert(
          "Reaction not saved",
          error instanceof Error ? error.message : "Please try again.",
        );
      }
    },
    [chatFeaturesAvailable, me],
  );

  const loadForwardTargets = useCallback(async () => {
    if (!me || messageActionLoading) return;
    setLoadingForwardTargets(true);
    setMessageActionError("");
    try {
      const { data: recentMessages, error: messagesError } = await supabase
        .from("messages")
        .select("sender_id, receiver_id, created_at")
        .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (messagesError) throw messagesError;

      const targetIds = [
        ...new Set(
          (recentMessages ?? [])
            .map((message) =>
              message.sender_id === me
                ? message.receiver_id
                : message.sender_id,
            )
            .filter((id) => id !== me && UUID_PATTERN.test(id)),
        ),
      ];

      if (targetIds.length === 0) {
        setForwardTargets([]);
      } else {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", targetIds);
        if (profilesError) throw profilesError;
        const names = new Map(
          (profiles ?? []).map((profile) => [profile.id, profile.username]),
        );
        setForwardTargets(
          targetIds.map((id) => ({
            id,
            username: names.get(id) || "Lumo user",
          })),
        );
      }
      setShowForwardPicker(true);
    } catch (error) {
      setMessageActionError(
        error instanceof Error
          ? error.message
          : "Could not load your conversations.",
      );
    } finally {
      setLoadingForwardTargets(false);
    }
  }, [me, messageActionLoading]);

  const forwardSelectedMessage = useCallback(
    async (receiverId: string) => {
      if (
        !selectedMessage ||
        !me ||
        !UUID_PATTERN.test(receiverId) ||
        receiverId === me ||
        messageActionLoading
      )
        return;
      setMessageActionLoading(true);
      setMessageActionError("");
      try {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            sender_id: me,
            receiver_id: receiverId,
            body: selectedMessage.body,
            message_type: selectedMessage.message_type ?? "text",
            media_path: selectedMessage.media_path,
            media_mime_type: selectedMessage.media_mime_type,
            ...(chatFileNamesAvailable
              ? { media_file_name: selectedMessage.media_file_name ?? null }
              : {}),
            forwarded_from: selectedMessage.id,
          })
          .select(
            chatFileNamesAvailable
              ? MESSAGE_SELECT_WITH_FILE_NAME
              : MESSAGE_SELECT,
          )
          .returns<Message[]>()
          .single();
        if (error) throw error;

        const forwarded = await attachSignedUrl(data as Message);
        if (receiverId === otherId) {
          setMessages((current) =>
            current.some((message) => message.id === forwarded.id)
              ? current
              : [forwarded, ...current],
          );
        }
        const recipient = forwardTargets.find(
          (target) => target.id === receiverId,
        );
        setSelectedMessage(null);
        setShowForwardPicker(false);
        if (receiverId !== otherId) {
          Alert.alert(
            "Message forwarded",
            `Forwarded to ${recipient?.username ?? "your conversation"}.`,
          );
        }
      } catch (error) {
        setMessageActionError(
          error instanceof Error
            ? error.message
            : "Could not forward this message.",
        );
      } finally {
        setMessageActionLoading(false);
      }
    },
    [
      chatFileNamesAvailable,
      forwardTargets,
      me,
      messageActionLoading,
      otherId,
      selectedMessage,
    ],
  );

  const deleteSelectedMessage = useCallback(async () => {
    if (
      !selectedMessage ||
      !me ||
      selectedMessage.sender_id !== me ||
      messageActionLoading
    )
      return;
    setMessageActionLoading(true);
    setMessageActionError("");
    try {
      const { data, error } = await supabase
        .from("messages")
        .delete()
        .eq("id", selectedMessage.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error("Message was not found or could not be deleted.");

      setMessages((current) =>
        current.filter((message) => message.id !== selectedMessage.id),
      );
      setSelectedMessage(null);
      setConfirmingMessageDelete(false);
      if (selectedMessage.media_path?.startsWith(`${me}/`)) {
        const { data: remainingReference, error: referenceError } =
          await supabase
            .from("messages")
            .select("id")
            .eq("media_path", selectedMessage.media_path)
            .limit(1)
            .maybeSingle();

        if (referenceError) {
          Alert.alert(
            "Message deleted",
            `The attachment was kept because its references could not be checked: ${referenceError.message}`,
          );
        } else if (!remainingReference) {
          const { error: storageError } = await supabase.storage
            .from("chat-media")
            .remove([selectedMessage.media_path]);
          if (storageError) {
            Alert.alert(
              "Message deleted",
              `The attachment could not be removed: ${storageError.message}`,
            );
          }
        }
      }
    } catch (error) {
      setMessageActionError(
        error instanceof Error
          ? error.message
          : "Could not delete this message.",
      );
    } finally {
      setMessageActionLoading(false);
    }
  }, [me, messageActionLoading, selectedMessage]);

  const chooseMedia = useCallback(async () => {
    if (sending) return;

    try {
      const picked = await pickChatMedia();
      if (picked) {
        setPendingMedia(picked);
        setShowStickerPanel(false);
      }
    } catch (error) {
      Alert.alert(
        "Could not attach media",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }, [sending]);

  const chooseFile = useCallback(async () => {
    if (sending) return;

    try {
      const picked = await pickChatFile();
      if (picked) {
        setPendingMedia(picked);
        setShowStickerPanel(false);
      }
    } catch (error) {
      Alert.alert(
        "Could not attach file",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }, [sending]);

  const send = useCallback(async () => {
    if (
      !me ||
      !otherId ||
      !UUID_PATTERN.test(otherId) ||
      otherId === me ||
      !canSend
    )
      return;

    const body = text.trim();
    if (pendingMedia && !chatFeaturesAvailable) {
      setShowAttachmentUpgradeNotice(true);
      return;
    }
    if (
      pendingMedia &&
      (pendingMedia.type === "audio" || pendingMedia.type === "file") &&
      !chatFileNamesAvailable
    ) {
      setShowAttachmentUpgradeNotice(true);
      return;
    }

    setSending(true);
    setErrorText(null);

    let uploadedPath: string | null = null;

    try {
      if (editingMessage) {
        const { data: editedAt, error } = await supabase.rpc(
          "edit_own_message",
          {
            p_message_id: editingMessage.id,
            p_body: body,
          },
        );
        if (error) throw error;

        setMessages((current) =>
          current.map((message) =>
            message.id === editingMessage.id
              ? { ...message, body, edited_at: editedAt }
              : message,
          ),
        );
        setEditingMessage(null);
        setText("");
        Keyboard.dismiss();
        return;
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user || user.id !== me) {
        throw new Error(
          "Your session is out of date. Sign out and sign in again.",
        );
      }

      if (pendingMedia) {
        uploadedPath = await uploadChatMedia(pendingMedia, me);
      }

      const result = chatFeaturesAvailable
        ? await supabase
            .from("messages")
            .insert({
              sender_id: user.id,
              receiver_id: otherId,
              body,
              message_type: pendingMedia?.type ?? "text",
              media_path: uploadedPath,
              media_mime_type: pendingMedia?.mimeType ?? null,
              ...(chatFileNamesAvailable
                ? { media_file_name: pendingMedia?.fileName ?? null }
                : {}),
              reply_to: replyTo?.id ?? null,
            })
            .select(
              chatFileNamesAvailable
                ? MESSAGE_SELECT_WITH_FILE_NAME
                : MESSAGE_SELECT,
            )
            .returns<Message[]>()
            .single()
        : await supabase
            .from("messages")
            .insert({
              sender_id: user.id,
              receiver_id: otherId,
              body,
            })
            .select(BASIC_MESSAGE_SELECT)
            .returns<Message[]>()
            .single();

      if (result.error) {
        console.error("LUMO MESSAGE INSERT ERROR:", {
          message: result.error.message,
          code: result.error.code,
          details: result.error.details,
          hint: result.error.hint,
        });
        throw result.error;
      }

      const complete = await attachSignedUrl(result.data as Message);
      setMessages((current) =>
        current.some((item) => item.id === complete.id)
          ? current
          : [complete, ...current],
      );

      setText("");
      setReplyTo(null);
      setPendingMedia(null);
      setShowStickerPanel(false);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      Keyboard.dismiss();
    } catch (error) {
      console.error("LUMO SEND ERROR:", error);

      if (uploadedPath) {
        try {
          await supabase.storage.from("chat-media").remove([uploadedPath]);
        } catch (cleanupError) {
          console.error("MEDIA CLEANUP ERROR:", cleanupError);
        }
      }

      Alert.alert(
        "Message not sent",
        error instanceof Error
          ? error.message
          : JSON.stringify(error) || "Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    chatFeaturesAvailable,
    chatFileNamesAvailable,
    editingMessage,
    me,
    otherId,
    pendingMedia,
    replyTo,
    text,
  ]);

  const sendVoiceMessage = useCallback(
    async (uri: string, durationMs: number) => {
      if (
        !me ||
        !otherId ||
        !UUID_PATTERN.test(otherId) ||
        otherId === me ||
        durationMs < 650
      ) return;

      if (!chatFeaturesAvailable) {
        Alert.alert(
          "Voice messages unavailable",
          "The chat messaging upgrade is not enabled yet.",
        );
        return;
      }

      setSending(true);
      setErrorText(null);
      let uploadedPath: string | null = null;

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user || user.id !== me) {
          throw new Error("Your session is out of date. Sign in again.");
        }

        const sourceUri = uri.split(/[?#]/)[0];
        const rawExtension = sourceUri.split(".").pop()?.toLowerCase() ?? "";
        const extension = ["m4a", "3gp", "webm", "aac"].includes(rawExtension)
          ? rawExtension
          : "m4a";
        const mimeType =
          extension === "3gp"
            ? "audio/3gpp"
            : extension === "webm"
              ? "audio/webm"
              : extension === "aac"
                ? "audio/aac"
                : "audio/mp4";
        const fileName = `voice-${Date.now()}.${extension}`;
        const media: PickedChatMedia = {
          uri,
          type: "audio",
          mimeType,
          fileName,
          fileSize: null,
        };

        uploadedPath = await uploadChatMedia(
          media,
          me,
          VOICE_MESSAGE_MAX_BYTES,
        );

        const result = await supabase
          .from("messages")
          .insert({
            sender_id: user.id,
            receiver_id: otherId,
            body: null,
            message_type: "audio",
            media_path: uploadedPath,
            media_mime_type: mimeType,
            ...(chatFileNamesAvailable ? { media_file_name: fileName } : {}),
            reply_to: replyTo?.id ?? null,
          })
          .select(
            chatFileNamesAvailable
              ? MESSAGE_SELECT_WITH_FILE_NAME
              : MESSAGE_SELECT,
          )
          .returns<Message[]>()
          .single();

        if (result.error) throw result.error;

        const complete = await attachSignedUrl(result.data as Message);
        setMessages((current) =>
          current.some((item) => item.id === complete.id)
            ? current
            : [complete, ...current],
        );
        setReplyTo(null);
        setShowStickerPanel(false);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
        Keyboard.dismiss();
      } catch (error) {
        console.error("LUMO VOICE SEND ERROR:", error);

        if (uploadedPath) {
          try {
            await supabase.storage.from("chat-media").remove([uploadedPath]);
          } catch (cleanupError) {
            console.error("VOICE MEDIA CLEANUP ERROR:", cleanupError);
          }
        }

        Alert.alert(
          "Voice message not sent",
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
        );
      } finally {
        setSending(false);
      }
    },
    [chatFeaturesAvailable, chatFileNamesAvailable, me, otherId, replyTo],
  );

  const openMedia = useCallback((message: Message) => {
    if (!message.media_url) {
      Alert.alert(
        "Media unavailable",
        "This attachment is currently unavailable.",
      );
      return;
    }

    setSelectedMediaId(message.id);
  }, []);
  const downloadViewerMedia = useCallback(
    async (item: ChatMediaViewerItem) => {
      const message = messages.find((entry) => entry.id === item.id);

      if (!message?.media_path) return;

      try {
        const url = await getChatMediaDownloadUrl(
          message.media_path,
          item.fileName || "attachment",
        );

        await Linking.openURL(url);
      } catch {
        Alert.alert(
          "Download unavailable",
          "This attachment could not be downloaded right now.",
        );
      }
    },
    [messages],
  );
  const openAttachment = useCallback(async (message: Message) => {
    if (!message.media_path) return;
    try {
      const fileName =
        message.media_file_name ||
        (getMessageType(message) === "audio"
          ? "audio-attachment"
          : "attachment");
      const url = await getChatMediaDownloadUrl(message.media_path, fileName);
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        "Attachment unavailable",
        error instanceof Error ? error.message : "Could not open this file.",
      );
    }
  }, []);

  const selectSticker = useCallback((sticker: string) => {
    setText((current) => `${current}${sticker}`);
    setShowStickerPanel(false);
  }, []);

  const toggleStickerPanel = useCallback(() => {
    Keyboard.dismiss();
    setShowStickerPanel((current) => !current);
  }, []);

  const retryLoad = useCallback(() => {
    setLoading(true);
    void loadChat(() => true);
  }, [loadChat]);

  const visibleMessages = searchText.trim() ? (searchResults ?? []) : messages;

  const jumpToMessage = useCallback((messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;

    setHighlightedMessageId(messageId);

    const scroll = () => {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    };

    if (searchText.trim()) {
      setSearchText("");
      setSearchResults(null);
      requestAnimationFrame(() => requestAnimationFrame(scroll));
    } else {
      requestAnimationFrame(scroll);
    }
  }, [messages, searchText]);

  useEffect(() => {
    if (!highlightedMessageId) return;

    const timeout = setTimeout(
      () => setHighlightedMessageId(null),
      1800,
    );

    return () => clearTimeout(timeout);
  }, [highlightedMessageId]);

  return (
    <SafeAreaView style={lumoStyles.safeArea} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: profile?.username ?? "Chat",
        }}
      />
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={lumoStyles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
      >
        <View style={lumoStyles.header}>
          <DecorativeOrb
            size={120}
            color={resolveThemeColor("rgba(216,255,114,0.10)", "color")}
            style={lumoStyles.headerOrbOne}
          />
          <DecorativeOrb
            size={74}
            color={resolveThemeColor("rgba(216,255,114,0.06)", "color")}
            style={lumoStyles.headerOrbTwo}
          />

          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={({ pressed }) => [
              lumoStyles.backButton,
              pressed && lumoStyles.pressed,
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={palette.ink} />
          </Pressable>

          <Pressable
            style={lumoStyles.profilePressable}
            onPress={() => otherId && router.push(`/user/${otherId}`)}
            accessibilityRole="button"
            accessibilityLabel="View profile"
          >
            <View style={lumoStyles.avatarRing}>
              <Avatar
                uri={profile?.avatar_url}
                name={profile?.username}
                size={43}
              />
              <View style={lumoStyles.avatarSpark}>
                <Ionicons name="sparkles" size={9} color={palette.canvas} />
              </View>
            </View>

            <View style={lumoStyles.headerText}>
              <Text style={lumoStyles.headerName} numberOfLines={1}>
                {profile?.username ?? "Lumo user"}
              </Text>
              <View style={lumoStyles.headerSubline}>
                <View
                  style={[
                    lumoStyles.headerMiniDot,
                    { backgroundColor: palette.lime },
                  ]}
                />
                <Text style={[lumoStyles.headerSubtitle, { color: palette.lime }]}>
                  Online
                </Text>
              </View>
            </View>
          </Pressable>

          <View style={lumoStyles.headerActionsGroup}>
            <Pressable
              onPress={() => otherId && void startCall(otherId, "audio")}
              disabled={!otherId || callStarting || !!activeCall}
              accessibilityRole="button"
              accessibilityLabel="Start voice call"
              hitSlop={8}
              style={({ pressed }) => [
                lumoStyles.headerAction,
                pressed && lumoStyles.pressed,
              ]}
            >
              <Ionicons name="call-outline" size={20} color={palette.ink} />
            </Pressable>

            <Pressable
              onPress={() => otherId && void startCall(otherId, "video")}
              disabled={!otherId || callStarting || !!activeCall}
              accessibilityRole="button"
              accessibilityLabel="Start video call"
              hitSlop={8}
              style={({ pressed }) => [
                lumoStyles.headerAction,
                pressed && lumoStyles.pressed,
              ]}
            >
              <Ionicons name="videocam-outline" size={22} color={palette.ink} />
            </Pressable>

            <Pressable
              onPress={() => {
                setShowSearch((current) => !current);
                setSearchText("");
                setSearchError("");
              }}
              accessibilityRole="button"
              accessibilityLabel={
                showSearch ? "Close conversation search" : "Search conversation"
              }
              hitSlop={8}
              style={({ pressed }) => [
                lumoStyles.headerAction,
                pressed && lumoStyles.pressed,
              ]}
            >
              <Ionicons
                name={showSearch ? "close" : "search"}
                size={20}
                color={palette.ink}
              />
            </Pressable>
          </View>
        </View>

        {showSearch && (
          <View style={lumoStyles.searchBar}>
            <Ionicons name="search" size={17} color={palette.muted} />
            <TextInput
              style={lumoStyles.searchInput}
              placeholder="Search messages"
              placeholderTextColor={palette.mutedDim}
              value={searchText}
              onChangeText={(value) => {
                setSearchText(value);
                setSearchResults(null);
                setSearchError("");
              }}
              accessibilityLabel="Search messages in this conversation"
              returnKeyType="search"
            />
            {searchLoading && (
              <ActivityIndicator size="small" color={palette.accent} />
            )}
          </View>
        )}
        {!!searchError && showSearch && (
          <Text style={lumoStyles.searchError}>{searchError}</Text>
        )}

        <View style={lumoStyles.conversationCanvas}>
          <DecorativeOrb
            size={230}
            color={resolveThemeColor("rgba(216,255,114,0.035)", "color")}
            style={lumoStyles.chatOrbOne}
          />
          <DecorativeOrb
            size={170}
            color={resolveThemeColor("rgba(216,255,114,0.025)", "color")}
            style={lumoStyles.chatOrbTwo}
          />

          {loading ? (
            <View style={lumoStyles.centerState}>
              <View style={lumoStyles.loadingOrb}>
                <ActivityIndicator color={palette.lime} size="large" />
              </View>
              <Text style={lumoStyles.stateKicker}>LUMO CONNECTION</Text>
              <Text style={lumoStyles.stateTitle}>Setting the scene</Text>
              <Text style={lumoStyles.stateHint}>
                Your conversation is on its way.
              </Text>
            </View>
          ) : errorText && messages.length === 0 ? (
            <View style={lumoStyles.centerState}>
              <View style={lumoStyles.stateIcon}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={27}
                  color={palette.accent}
                />
              </View>
              <Text style={lumoStyles.stateKicker}>CONNECTION PAUSED</Text>
              <Text style={lumoStyles.stateTitle}>Couldn’t load chat</Text>
              <Text style={lumoStyles.stateHint}>{errorText}</Text>
              <Pressable
                style={({ pressed }) => [
                  lumoStyles.retryButton,
                  pressed && lumoStyles.pressed,
                ]}
                onPress={retryLoad}
              >
                <Ionicons name="refresh" size={16} color={palette.canvas} />
                <Text style={lumoStyles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {!!errorText && messages.length > 0 && (
                <Pressable style={lumoStyles.inlineError} onPress={retryLoad}>
                  <Text style={lumoStyles.inlineErrorText} numberOfLines={2}>
                    {errorText}
                  </Text>
                  <Text style={lumoStyles.inlineErrorAction}>Retry</Text>
                </Pressable>
              )}
              <FlatList
                ref={listRef}
                data={visibleMessages}
                inverted
                keyExtractor={(message) => message.id}
                onScrollToIndexFailed={({ index, averageItemLength }) => {
                  listRef.current?.scrollToOffset({
                    offset: averageItemLength * index,
                    animated: false,
                  });
                  setTimeout(() => {
                    listRef.current?.scrollToIndex({
                      index,
                      animated: true,
                      viewPosition: 0.5,
                    });
                  }, 80);
                }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  lumoStyles.messageList,
                  visibleMessages.length === 0 && lumoStyles.messageListEmpty,
                ]}
                onEndReached={() => void loadOlderMessages()}
                onEndReachedThreshold={0.25}
                ListFooterComponent={
                  loadingOlderMessages ? (
                    <ActivityIndicator
                      style={lumoStyles.olderMessagesLoader}
                      color={palette.accent}
                    />
                  ) : undefined
                }
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const mine = item.sender_id === me;
                  const type = getMessageType(item);
                  const isSharedPost =
                    item.forwarded_from_type === "post" &&
                    typeof item.forwarded_from_id === "string";
                  const hasMedia = type !== "text" && Boolean(item.media_path);
                  const replyMessage = messages.find(
                    (message) => message.id === item.reply_to,
                  );
                  const reactionSummary = [
                    ...new Set(
                      (item.reactions ?? []).map(
                        (reaction) => reaction.reaction,
                      ),
                    ),
                  ].map((reaction) => ({
                    reaction,
                    count:
                      item.reactions?.filter(
                        (entry) => entry.reaction === reaction,
                      ).length ?? 0,
                    mine:
                      item.reactions?.some(
                        (entry) =>
                          entry.user_id === me && entry.reaction === reaction,
                      ) ?? false,
                  }));

                  return (
                    <View
                      style={[
                        lumoStyles.messageLine,
                        mine
                          ? lumoStyles.messageLineMine
                          : lumoStyles.messageLineTheirs,
                      ]}
                    >
                      {!mine && (
                        <View style={lumoStyles.messageAvatarWrap}>
                          <Avatar
                            uri={profile?.avatar_url}
                            name={profile?.username}
                            size={27}
                          />
                        </View>
                      )}

                      <View style={lumoStyles.messageContent}>
                        <MessageActionSurface
                          align={mine ? "flex-end" : "flex-start"}
                          enabled={chatFeaturesAvailable}
                          onOpenActions={() => {
                            if (!chatFeaturesAvailable) return;
                            setMessageActionError("");
                            setConfirmingMessageDelete(false);
                            setShowForwardPicker(false);
                            setSelectedMessage(item);
                          }}
                        >
                        <Pressable
                          style={[
                            lumoStyles.bubble,
                            mine ? lumoStyles.bubbleMine : lumoStyles.bubbleTheirs,
                            hasMedia && lumoStyles.bubbleWithMedia,
                            highlightedMessageId === item.id && lumoStyles.bubbleHighlighted,
                          ]}
                          onLongPress={
                            chatFeaturesAvailable
                              ? () => {
                                  setMessageActionError("");
                                  setConfirmingMessageDelete(false);
                                  setShowForwardPicker(false);
                                  setSelectedMessage(item);
                                }
                              : undefined
                          }
                          accessibilityRole="button"
                          accessibilityHint={
                            chatFeaturesAvailable
                              ? "Long press for message actions"
                              : undefined
                          }
                        >
                          {!isSharedPost &&
                            !!(item.forwarded_from || item.forwarded_from_type) && (
                              <Text style={lumoStyles.forwardedLabel}>FORWARDED</Text>
                            )}
                          {!!item.reply_to && (
                            <Pressable
                              style={({ pressed }) => [
                                lumoStyles.replyPreview,
                                pressed && lumoStyles.replyPreviewPressed,
                              ]}
                              disabled={!replyMessage}
                              onPress={() => {
                                if (replyMessage) {
                                  jumpToMessage(replyMessage.id);
                                }
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Go to replied message"
                            >
                              <Text style={lumoStyles.replyPreviewTitle} numberOfLines={1}>
                                {replyMessage?.sender_id === me
                                  ? "You"
                                  : (profile?.username ?? "Reply")}
                              </Text>
                              <Text
                                style={lumoStyles.replyPreviewBody}
                                numberOfLines={1}
                              >
                                {replyMessage?.body?.trim() ||
                                  (replyMessage?.media_path
                                    ? "Attachment"
                                    : "Message")}
                              </Text>
                            </Pressable>
                          )}
                                                    {isSharedPost && (
                            <SharedPostCard
                              key={`shared-post-${item.id}`}
                              postId={item.forwarded_from_id!}
                            />
                          )}
                          {hasMedia && type === "audio" ? (
                            <VoiceMessageBubble
                              key={item.id}
                              uri={item.media_url}
                              mine={mine}
                              onDownload={() => void openAttachment(item)}
                            />
                          ) : hasMedia ? (
                            <ChatMediaAttachment
                              key={item.id}
                              type={type as "image" | "video" | "file"}
                              uri={item.media_url}
                              fileName={item.media_file_name}
                              mine={mine}
                              fileAction="FILE · TAP TO DOWNLOAD"
                              onLongPress={
                                chatFeaturesAvailable
                                  ? () => {
                                      setMessageActionError("");
                                      setConfirmingMessageDelete(false);
                                      setShowForwardPicker(false);
                                      setSelectedMessage(item);
                                    }
                                  : undefined
                              }
                              onPress={() => {
                                if (type === "image" || type === "video") {
                                  openMedia(item);
                                } else {
                                  void openAttachment(item);
                                }
                              }}
                            />
                          ) : null}                          {!isSharedPost && !!item.body?.trim() && (
                            <Text
                              style={[
                                lumoStyles.messageText,
                                mine ? lumoStyles.mineText : lumoStyles.theirText,
                              ]}
                            >
                              {item.body}
                            </Text>
                          )}

                          {!!item.edited_at && (
                            <Text
                              style={[
                                lumoStyles.editedLabel,
                                mine && lumoStyles.mineTime,
                              ]}
                            >
                              edited
                            </Text>
                          )}
                          <View style={lumoStyles.messageMeta}>
                            <Text
                              style={[
                                lumoStyles.messageTime,
                                mine && lumoStyles.mineTime,
                              ]}
                            >
                              {formatTime(item.created_at)}
                            </Text>
                            {mine && (
                              <Ionicons
                                name={
                                  item.read_at ? "checkmark-done" : "checkmark"
                                }
                                size={15}
                                color={
                                  item.read_at
                                    ? palette.lime
                                    : resolveThemeColor("rgba(255,255,255,0.74)", "color")
                                }
                              />
                            )}
                          </View>
                        </Pressable>
                        </MessageActionSurface>
                        {chatFeaturesAvailable && (
                          <View style={lumoStyles.reactionRow}>
                            {reactionSummary.map((reaction) => (
                              <Pressable
                                key={reaction.reaction}
                                onPress={() =>
                                  void toggleMessageReaction(
                                    item,
                                    reaction.reaction,
                                  )
                                }
                                accessibilityRole="button"
                                accessibilityLabel={`${reaction.reaction}, ${reaction.count} reactions`}
                                style={[
                                  lumoStyles.reactionChip,
                                  reaction.mine && lumoStyles.reactionChipMine,
                                ]}
                              >
                                <Text style={lumoStyles.reactionText}>
                                  {reaction.reaction} {reaction.count}
                                </Text>
                              </Pressable>
                            ))}
                            <Pressable
                              onPress={() =>
                                void toggleMessageReaction(item, "❤️")
                              }
                              accessibilityRole="button"
                              accessibilityLabel="React with a heart"
                              hitSlop={6}
                              style={lumoStyles.addReactionButton}
                            >
                              <Ionicons
                                name="heart-outline"
                                size={14}
                                color={palette.muted}
                              />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  searchLoading ? (
                    <View style={lumoStyles.searchEmpty}>
                      <ActivityIndicator color={palette.accent} />
                    </View>
                  ) : searchText.trim() ? (
                    <View style={lumoStyles.searchEmpty}>
                      <Text style={lumoStyles.emptyCopy}>
                        No matching messages.
                      </Text>
                    </View>
                  ) : (
                    <View style={lumoStyles.emptyConversation}>
                      <View style={lumoStyles.emptyIllustration}>
                        <DecorativeOrb
                          size={90}
                          color={resolveThemeColor("rgba(216,255,114,0.30)", "color")}
                          style={lumoStyles.emptyHalo}
                        />
                        <View style={lumoStyles.emptyMainIcon}>
                          <Ionicons
                            name="chatbubble-ellipses"
                            size={31}
                            color={palette.canvas}
                          />
                        </View>
                        <View style={lumoStyles.emptySpark}>
                          <Ionicons
                            name="sparkles"
                            size={17}
                            color={palette.canvas}
                          />
                        </View>
                      </View>
                      <Text style={lumoStyles.emptyKicker}>
                        FIRST MESSAGE ENERGY
                      </Text>
                      <Text style={lumoStyles.emptyTitle}>
                        Make this chat yours.
                      </Text>
                      <Text style={lumoStyles.emptyCopy}>
                        A thought, a photo, a little chaos — start wherever
                        feels right.
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          lumoStyles.helloButton,
                          pressed && lumoStyles.pressed,
                        ]}
                        onPress={() => setText("Hey! 👋")}
                      >
                        <Text style={lumoStyles.helloButtonText}>
                          Break the silence
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={17}
                          color={palette.canvas}
                        />
                      </Pressable>
                    </View>
                  )
                }
              />
            </>
          )}
        </View>

        {!loading && !(errorText && messages.length === 0) && (
          <View style={lumoStyles.composerShell}>
            {chatFeaturesAvailable && (replyTo || editingMessage) && (
              <View style={lumoStyles.composerContext}>
                <View style={lumoStyles.composerContextAccent} />
                <View style={lumoStyles.composerContextCopy}>
                  <Text style={lumoStyles.composerContextTitle}>
                    {editingMessage
                      ? "Editing message"
                      : `Replying to ${replyTo?.sender_id === me ? "yourself" : (profile?.username ?? "user")}`}
                  </Text>
                  <Text style={lumoStyles.composerContextBody} numberOfLines={1}>
                    {editingMessage?.body ?? replyTo?.body ?? "Attachment"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setReplyTo(null);
                    setEditingMessage(null);
                    setText("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply or edit"
                  hitSlop={8}
                  style={lumoStyles.removeAttachment}
                >
                  <Ionicons name="close" size={17} color={palette.ink} />
                </Pressable>
              </View>
            )}
            {showStickerPanel && (
              <View style={lumoStyles.stickerPanel}>
                <View style={lumoStyles.stickerHeader}>
                  <View style={lumoStyles.stickerHeaderText}>
                    <View style={lumoStyles.panelEyebrowRow}>
                      <View style={lumoStyles.panelAccent} />
                      <Text style={lumoStyles.panelEyebrow}>EXPRESS YOURSELF</Text>
                    </View>
                    <Text style={lumoStyles.stickerTitle}>Sticker studio</Text>
                    <Text style={lumoStyles.stickerSubtitle}>
                      Pick a mood and send it.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setShowStickerPanel(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close stickers"
                    hitSlop={8}
                    style={lumoStyles.stickerCloseButton}
                  >
                    <Ionicons name="close" size={19} color={palette.ink} />
                  </Pressable>
                </View>

                <View style={lumoStyles.stickerCategories}>
                  {STICKER_CATEGORIES.map((category) => {
                    const active = activeStickerCategory === category.id;
                    return (
                      <Pressable
                        key={category.id}
                        onPress={() => setActiveStickerCategory(category.id)}
                        style={[
                          lumoStyles.stickerCategory,
                          active && lumoStyles.stickerCategoryActive,
                        ]}
                      >
                        <Ionicons
                          name={category.icon}
                          size={15}
                          color={active ? palette.canvas : palette.muted}
                        />
                        <Text
                          style={[
                            lumoStyles.stickerCategoryText,
                            active && lumoStyles.stickerCategoryTextActive,
                          ]}
                        >
                          {category.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={lumoStyles.stickerGrid}>
                  {activeCategory.stickers.map((sticker, index) => (
                    <Pressable
                      key={`${activeCategory.id}-${sticker.label}-${index}`}
                      onPress={() => selectSticker(sticker.emoji)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${sticker.label} sticker`}
                      style={({ pressed }) => [
                        lumoStyles.stickerItem,
                        pressed && lumoStyles.stickerItemPressed,
                      ]}
                    >
                      <View style={lumoStyles.stickerArtwork}>
                        <Text style={lumoStyles.stickerEmoji}>{sticker.emoji}</Text>
                      </View>
                      <Text style={lumoStyles.stickerLabel} numberOfLines={1}>
                        {sticker.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={lumoStyles.stickerFooter}>
                  <Ionicons
                    name="flash-outline"
                    size={14}
                    color={palette.lime}
                  />
                  <Text style={lumoStyles.stickerFooterText}>
                    A little personality goes a long way.
                  </Text>
                </View>
              </View>
            )}

            {pendingMedia && (
              <View style={lumoStyles.attachmentPreview}>
                {pendingMedia.type === "image" ? (
                  <Image
                    source={{ uri: pendingMedia.uri }}
                    style={lumoStyles.attachmentThumbnail}
                    contentFit="cover"
                  />
                ) : (
                  <View style={lumoStyles.attachmentVideoIcon}>
                    <Ionicons
                      name={
                        pendingMedia.type === "video"
                          ? "play"
                          : pendingMedia.type === "audio"
                            ? "musical-notes-outline"
                            : "document-outline"
                      }
                      size={22}
                      color={palette.lime}
                    />
                  </View>
                )}

                <View style={lumoStyles.attachmentDetails}>
                  <Text style={lumoStyles.attachmentKicker}>READY TO SHARE</Text>
                  <Text style={lumoStyles.attachmentTitle} numberOfLines={1}>
                    {pendingMedia.fileName ||
                      (pendingMedia.type === "video"
                        ? "Video selected"
                        : pendingMedia.type === "audio"
                          ? "Audio selected"
                          : pendingMedia.type === "file"
                            ? "File selected"
                            : "Photo selected")}
                  </Text>
                  <Text style={lumoStyles.attachmentSubtitle}>
                    {formatBytes(pendingMedia.fileSize)} · 50 MB max
                  </Text>
                </View>

                <Pressable
                  onPress={() => setPendingMedia(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove attachment"
                  style={lumoStyles.removeAttachment}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={17} color={palette.ink} />
                </Pressable>
              </View>
            )}

            <View style={lumoStyles.composerRow}>
              <Pressable
                onPress={() => void chooseMedia()}
                disabled={sending || !!editingMessage}
                accessibilityRole="button"
                accessibilityLabel="Attach photo or video"
                style={({ pressed }) => [
                  lumoStyles.attachButton,
                  pressed && lumoStyles.pressed,
                  (sending || editingMessage) && lumoStyles.disabled,
                ]}
              >
                <Ionicons name="add" size={26} color={palette.ink} />
                <View style={lumoStyles.attachAccent} />
              </Pressable>

              <Pressable
                onPress={() => void chooseFile()}
                disabled={sending || !!editingMessage}
                accessibilityRole="button"
                accessibilityLabel="Attach a file"
                style={({ pressed }) => [
                  lumoStyles.attachFileButton,
                  pressed && lumoStyles.pressed,
                  (sending || editingMessage) && lumoStyles.disabled,
                ]}
              >
                <Ionicons
                  name="document-outline"
                  size={19}
                  color={palette.accent}
                />
              </Pressable>

              <View style={lumoStyles.inputShell}>
                <TextInput
                  style={lumoStyles.input}
                  placeholder={
                    editingMessage
                      ? "Edit your message…"
                      : "Write something real…"
                  }
                  placeholderTextColor={palette.mutedDim}
                  value={text}
                  onChangeText={setText}
                  maxLength={2000}
                  multiline
                  textAlignVertical="center"
                  editable={!sending}
                  returnKeyType="default"
                  accessibilityLabel="Message text"
                  onFocus={() => setShowStickerPanel(false)}
                />
                <Pressable
                  onPress={toggleStickerPanel}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Open stickers panel"
                  accessibilityState={{ expanded: showStickerPanel }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    lumoStyles.stickerToggleButton,
                    pressed && lumoStyles.pressed,
                    showStickerPanel && lumoStyles.stickerToggleButtonActive,
                  ]}
                >
                  <Ionicons
                    name="happy-outline"
                    size={22}
                    color={showStickerPanel ? palette.lime : palette.muted}
                  />
                </Pressable>
              </View>

              {!text.trim() && !pendingMedia && !editingMessage && (
                <VoiceMessageRecorderButton
                  disabled={sending || !chatFeaturesAvailable}
                  onSend={sendVoiceMessage}
                />
              )}
              <Pressable
                onPress={() => void send()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={
                  editingMessage ? "Save edited message" : "Send message"
                }
                style={({ pressed }) => [
                  lumoStyles.sendButton,
                  !canSend && lumoStyles.sendButtonDisabled,
                  pressed && canSend && lumoStyles.sendButtonPressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={palette.canvas} />
                ) : (
                  <Ionicons
                    name={editingMessage ? "checkmark" : "arrow-up"}
                    size={23}
                    color={palette.canvas}
                  />
                )}
              </Pressable>
            </View>

            <View style={lumoStyles.composerFooter}>
              <Ionicons name="sparkles" size={11} color={palette.accent} />
              <Text style={lumoStyles.composerFootnote}>
                YOUR PEOPLE. YOUR MOMENTS.
              </Text>
              <View style={lumoStyles.footerLine} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <SafeAreaView edges={["bottom"]} style={lumoStyles.bottomSafeArea} />

      <Modal
        visible={showAttachmentUpgradeNotice}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachmentUpgradeNotice(false)}
      >
        <View style={lumoStyles.noticeOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close attachment notice"
            onPress={() => setShowAttachmentUpgradeNotice(false)}
          />
          <View style={lumoStyles.noticeCard} accessibilityViewIsModal>
            <View style={lumoStyles.noticeIcon}>
              <Ionicons
                name="cloud-upload-outline"
                size={23}
                color={palette.lime}
              />
            </View>
            <Text style={lumoStyles.noticeEyebrow}>LUMO CHAT</Text>
            <Text style={lumoStyles.noticeTitle}>Attachments aren’t ready yet</Text>
            <Text style={lumoStyles.noticeBody}>
              {pendingMedia?.type === "audio" || pendingMedia?.type === "file"
                ? "Apply both Lumo messaging migrations in Supabase to enable audio and file sharing."
                : "Apply the Lumo messaging upgrade in Supabase to enable photo and video sharing."}
            </Text>
            <Pressable
              onPress={() => setShowAttachmentUpgradeNotice(false)}
              accessibilityRole="button"
              style={({ pressed }) => [
                lumoStyles.noticeButton,
                pressed && lumoStyles.pressed,
              ]}
            >
              <Text style={lumoStyles.noticeButtonText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <UniversalForwardModal
        visible={universalForwardSource !== null}
        userId={me}
        source={universalForwardSource}
        onClose={() => setUniversalForwardSource(null)}
      />

      <ChatMediaViewer
        visible={selectedMediaIndex >= 0}
        items={mediaViewerItems}
        initialIndex={Math.max(0, selectedMediaIndex)}
        onClose={() => setSelectedMediaId(null)}
        onDownload={downloadViewerMedia}
      /><Modal
        visible={selectedMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!messageActionLoading) {
            setSelectedMessage(null);
            setConfirmingMessageDelete(false);
            setShowForwardPicker(false);
          }
        }}
      >
        <View style={lumoStyles.actionOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close message actions"
            onPress={() => {
              if (!messageActionLoading) {
                setSelectedMessage(null);
                setConfirmingMessageDelete(false);
                setShowForwardPicker(false);
              }
            }}
          />
          <View style={lumoStyles.actionSheet} accessibilityViewIsModal>
            <View style={lumoStyles.sheetHandle} />
            <Text style={lumoStyles.actionTitle}>
              {confirmingMessageDelete
                ? "Delete this message?"
                : showForwardPicker
                  ? "Forward to a conversation"
                  : "Message options"}
            </Text>
            <Text style={lumoStyles.actionPreview} numberOfLines={2}>
              {selectedMessage?.body?.trim() ||
                (selectedMessage?.media_path ? "Attachment" : "Message")}
            </Text>
            {!!messageActionError && (
              <Text style={lumoStyles.actionError}>{messageActionError}</Text>
            )}
            {confirmingMessageDelete ? (
              <View style={lumoStyles.actionButtons}>
                <Pressable
                  onPress={() => {
                    setConfirmingMessageDelete(false);
                    setMessageActionError("");
                  }}
                  disabled={messageActionLoading}
                  style={lumoStyles.actionSecondary}
                >
                  <Text style={lumoStyles.actionSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void deleteSelectedMessage()}
                  disabled={messageActionLoading}
                  style={lumoStyles.actionDanger}
                >
                  {messageActionLoading ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={lumoStyles.actionDangerText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            ) : showForwardPicker ? (
              <>
                {loadingForwardTargets ? (
                  <ActivityIndicator
                    color={palette.accent}
                    style={lumoStyles.forwardLoader}
                  />
                ) : forwardTargets.length > 0 ? (
                  <ScrollView
                    style={lumoStyles.forwardTargetList}
                    keyboardShouldPersistTaps="handled"
                  >
                    {forwardTargets.map((target) => (
                      <Pressable
                        key={target.id}
                        onPress={() => void forwardSelectedMessage(target.id)}
                        disabled={messageActionLoading}
                        style={({ pressed }) => [
                          lumoStyles.forwardTarget,
                          pressed && lumoStyles.pressed,
                          messageActionLoading && lumoStyles.actionDisabled,
                        ]}
                      >
                        <View style={lumoStyles.forwardTargetIcon}>
                          <Ionicons
                            name="person"
                            size={16}
                            color={palette.lime}
                          />
                        </View>
                        <Text
                          style={lumoStyles.forwardTargetName}
                          numberOfLines={1}
                        >
                          {target.username}
                        </Text>
                        {messageActionLoading ? (
                          <ActivityIndicator
                            color={palette.accent}
                            size="small"
                          />
                        ) : (
                          <Ionicons
                            name="arrow-redo-outline"
                            size={17}
                            color={palette.muted}
                          />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={lumoStyles.forwardEmpty}>
                    Start another conversation before forwarding a message.
                  </Text>
                )}
                <Pressable
                  onPress={() => setShowForwardPicker(false)}
                  disabled={messageActionLoading}
                  style={lumoStyles.forwardCancel}
                >
                  <Text style={lumoStyles.actionSecondaryText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <View style={lumoStyles.actionButtons}>
                <Pressable
                  onPress={() => {
                    if (!selectedMessage) return;
                    setReplyTo(selectedMessage);
                    setEditingMessage(null);
                    setSelectedMessage(null);
                    setShowSearch(false);
                    setSearchText("");
                  }}
                  style={lumoStyles.actionSecondary}
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={17}
                    color={palette.ink}
                  />
                  <Text style={lumoStyles.actionSecondaryText}>Reply</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (
                      !selectedMessage?.body ||
                      selectedMessage.message_type !== "text"
                    )
                      return;
                    setEditingMessage(selectedMessage);
                    setReplyTo(null);
                    setPendingMedia(null);
                    setText(selectedMessage.body);
                    setSelectedMessage(null);
                    Keyboard.dismiss();
                  }}
                  disabled={
                    selectedMessage?.sender_id !== me ||
                    selectedMessage?.message_type !== "text"
                  }
                  style={[
                    lumoStyles.actionSecondary,
                    (selectedMessage?.sender_id !== me ||
                      selectedMessage?.message_type !== "text") &&
                      lumoStyles.actionDisabled,
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={17}
                    color={palette.ink}
                  />
                  <Text style={lumoStyles.actionSecondaryText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!selectedMessage || !me) return;

                    setUniversalForwardSource({
                      type: 'personal',
                      id: selectedMessage.id,
                      senderLabel:
                        selectedMessage.sender_id === me
                          ? 'You'
                          : profile?.username ?? 'Lumo user',
                      chatLabel: profile?.username ?? 'Personal chat',
                      body: selectedMessage.body,
                      messageType: selectedMessage.message_type,
                      mediaPath: selectedMessage.media_path,
                      mediaMimeType: selectedMessage.media_mime_type,
                      mediaFileName:
                        (selectedMessage as any).media_file_name ?? null,
                    });

                    setSelectedMessage(null);
                    setShowForwardPicker(false);
                  }}
                  disabled={messageActionLoading || loadingForwardTargets}
                  style={lumoStyles.actionSecondary}
                >
                  {loadingForwardTargets ? (
                    <ActivityIndicator color={palette.ink} size="small" />
                  ) : (
                    <Ionicons
                      name="arrow-redo-outline"
                      size={17}
                      color={palette.ink}
                    />
                  )}
                  <Text style={lumoStyles.actionSecondaryText}>Forward</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (selectedMessage)
                      void toggleMessageReaction(selectedMessage, "❤️");
                  }}
                  style={lumoStyles.actionSecondary}
                >
                  <Text style={lumoStyles.actionReactionEmoji}>❤️</Text>
                  <Text style={lumoStyles.actionSecondaryText}>React</Text>
                </Pressable>
                {selectedMessage?.sender_id === me && (
                  <Pressable
                    onPress={() => {
                      setConfirmingMessageDelete(true);
                      setMessageActionError("");
                    }}
                    style={lumoStyles.actionDeleteRow}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={palette.danger}
                    />
                    <Text style={lumoStyles.actionDeleteText}>Delete message</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Call Screen Modal (matching Slide 9 Video & Voice calls) */}
      <Modal
        visible={callType !== null}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setCallType(null)}
      >
        <SafeAreaView style={lumoStyles.callScreen}>
          <StatusBar barStyle="light-content" />
          <View style={lumoStyles.callHeader}>
            <View style={lumoStyles.callTypeBadge}>
              <Ionicons
                name={callType === "video" ? "videocam" : "call"}
                size={14}
                color={palette.lime}
              />
              <Text style={lumoStyles.callTypeBadgeText}>
                {callType === "video" ? "LUMO VIDEO CALL" : "LUMO VOICE CALL"}
              </Text>
            </View>
            <Text style={lumoStyles.callStatus}>
              {callDuration > 0
                ? `${Math.floor(callDuration / 60)
                    .toString()
                    .padStart(2, "0")}:${(callDuration % 60)
                    .toString()
                    .padStart(2, "0")}`
                : "Connecting..."}
            </Text>
          </View>

          <View style={lumoStyles.callCenter}>
            <View style={lumoStyles.callAvatarGlow}>
              <View style={lumoStyles.callAvatarRing}>
                <Avatar
                  uri={profile?.avatar_url}
                  name={profile?.username}
                  size={120}
                  hasStory={false}
                />
              </View>
            </View>
            <Text style={lumoStyles.callName}>
              {profile?.username ?? "Lumo user"}
            </Text>
            <Text style={lumoStyles.callSubtitle}>
              {callType === "video"
                ? "Video call · HD Audio"
                : "Voice call · Encrypted"}
            </Text>
          </View>

          <View style={lumoStyles.callControlsDock}>
            <Pressable
              style={[lumoStyles.callBtn, isMuted && lumoStyles.callBtnActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons
                name={isMuted ? "mic-off" : "mic"}
                size={22}
                color={isMuted ? palette.canvas : palette.ink}
              />
              <Text
                style={[
                  lumoStyles.callBtnLabel,
                  isMuted && lumoStyles.callBtnLabelActive,
                ]}
              >
                {isMuted ? "Unmute" : "Mute"}
              </Text>
            </Pressable>

            {callType === "video" && (
              <Pressable
                style={[lumoStyles.callBtn, isVideoOff && lumoStyles.callBtnActive]}
                onPress={() => setIsVideoOff(!isVideoOff)}
              >
                <Ionicons
                  name={isVideoOff ? "videocam-off" : "videocam"}
                  size={22}
                  color={isVideoOff ? palette.canvas : palette.ink}
                />
                <Text
                  style={[
                    lumoStyles.callBtnLabel,
                    isVideoOff && lumoStyles.callBtnLabelActive,
                  ]}
                >
                  {isVideoOff ? "Start" : "Camera"}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[lumoStyles.callBtn, isSpeaker && lumoStyles.callBtnActive]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons
                name={isSpeaker ? "volume-high" : "volume-medium"}
                size={22}
                color={isSpeaker ? palette.canvas : palette.ink}
              />
              <Text
                style={[
                  lumoStyles.callBtnLabel,
                  isSpeaker && lumoStyles.callBtnLabelActive,
                ]}
              >
                Speaker
              </Text>
            </Pressable>

            <Pressable
              style={lumoStyles.callEndBtn}
              onPress={() => setCallType(null)}
            >
              <Ionicons
                name="call"
                size={28}
                color={colors.text}
                style={{ transform: [{ rotate: "135deg" }] }}
              />
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  screen: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  decorativeOrb: {
    position: "absolute",
  },
  header: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 15,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  headerOrbOne: {
    right: -50,
    top: -70,
  },
  headerOrbTwo: {
    right: 95,
    top: -48,
  },
  backButton: {
    width: 39,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1D1A29",
    borderWidth: 1,
    borderColor: "#302A40",
  },
  profilePressable: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  avatarRing: {
    width: 51,
    height: 51,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentTint,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.55)",
  },
  avatarSpark: {
    position: "absolute",
    right: -3,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.lime,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.8,
    fontWeight: "900",
    color: palette.accent,
  },
  headerName: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.ink,
    letterSpacing: -0.35,
  },
  headerSubline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.lime,
  },
  headerSubtitle: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "500",
  },
  headerActionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerAction: {
    width: 39,
    height: 43,
    borderRadius: 15,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 13,
    marginVertical: 9,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 13,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
  },
  searchInput: {
    flex: 1,
    color: palette.ink,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchError: {
    color: palette.danger,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  conversationCanvas: {
    position: "relative",
    flex: 1,
    overflow: "hidden",
    backgroundColor: palette.canvas,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#241922",
    borderWidth: 1,
    borderColor: "#58303D",
  },
  inlineErrorText: {
    flex: 1,
    color: "#FFC4CF",
    fontSize: 11,
    lineHeight: 16,
  },
  inlineErrorAction: {
    color: palette.lime,
    fontSize: 11,
    fontWeight: "800",
  },
  chatOrbOne: {
    right: -120,
    top: 105,
  },
  chatOrbTwo: {
    left: -95,
    bottom: 80,
  },
  messageList: {
    paddingHorizontal: 13,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 13,
    flexGrow: 1,
    justifyContent: "flex-start",
  },
  messageListEmpty: {
    flexGrow: 1,
  },
  messageLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  messageLineMine: {
    justifyContent: "flex-end",
  },
  messageLineTheirs: {
    justifyContent: "flex-start",
  },
  messageContent: {
    maxWidth: "82%",
    minWidth: 72,
    flexShrink: 1,
  },
  messageAvatarWrap: {
    marginBottom: 3,
    padding: 2,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#342B49",
  },
  bubble: {
    maxWidth: "100%",
    minWidth: 72,
    paddingHorizontal: 13,
    paddingTop: 11,
    paddingBottom: 7,
    borderRadius: 20,
    gap: 6,
  },
  bubbleMine: {
    backgroundColor: palette.lime,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(216,255,114,0.45)",
    shadowColor: palette.lime,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  bubbleTheirs: {
    backgroundColor: palette.surfaceRaised,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: palette.line,
  },
  bubbleHighlighted: {
    borderWidth: 2,
    borderColor: palette.lime,
    shadowColor: palette.lime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  bubbleWithMedia: {
    padding: 6,
    overflow: "hidden",
  },
  messagePhoto: {
    width: 244,
    height: 244,
    maxWidth: "100%",
    borderRadius: 15,
    backgroundColor: "#211D2D",
  },
  photoExpandBadge: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,9,15,0.74)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  videoCard: {
    width: 244,
    maxWidth: "100%",
    minWidth: 0,
    aspectRatio: 1.47,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#211733",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBackdropFallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#211733",
  },
  videoOrb: {
    left: 52,
    top: 11,
  },
  videoPlayCircle: {
    width: 55,
    height: 55,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.lime,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    paddingLeft: 3,
  },
  videoTag: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(10,9,15,0.8)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#413551",
  },
  videoTagText: {
    color: palette.ink,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  videoHint: {
    position: "absolute",
    right: 10,
    bottom: 13,
    color: "#D1C9E4",
    fontSize: 10,
    fontWeight: "600",
  },
  mediaUnavailable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  mediaUnavailableText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0.02,
  },
  forwardedLabel: {
    color: palette.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  replyPreview: {
    maxWidth: 250,
    alignSelf: "stretch",
    borderLeftWidth: 2,
    borderLeftColor: palette.lime,
    paddingLeft: 9,
    paddingRight: 8,
    paddingVertical: 5,
    marginBottom: 6,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  replyPreviewPressed: {
    opacity: 0.68,
  },
  replyPreviewTitle: {
    color: palette.lime,
    fontSize: 10,
    fontWeight: "800",
  },
  replyPreviewBody: {
    color: "#D5DCCB",
    fontSize: 10,
    marginTop: 2,
  },
  editedLabel: {
    alignSelf: "flex-end",
    color: "#E4DAFF",
    fontSize: 9,
    fontStyle: "italic",
  },
  mineText: {
    color: "#090C12",
    fontWeight: "600",
  },
  theirText: {
    color: palette.ink,
  },
  messageMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    marginTop: 1,
  },
  messageTime: {
    fontSize: 10,
    color: palette.muted,
    fontWeight: "600",
  },
  mineTime: {
    color: "rgba(8,10,8,0.72)",
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  reactionChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  reactionChipMine: {
    borderColor: palette.accent,
    backgroundColor: palette.accentTint,
  },
  reactionText: {
    color: palette.ink,
    fontSize: 10,
  },
  addReactionButton: {
    width: 23,
    height: 22,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
  },
  searchEmpty: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  olderMessagesLoader: {
    marginVertical: 12,
    transform: [{ scaleY: -1 }],
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    gap: 10,
  },
  loadingOrb: {
    width: 76,
    height: 76,
    borderRadius: 27,
    backgroundColor: palette.accentTint,
    borderWidth: 1,
    borderColor: "#544079",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  stateIcon: {
    width: 70,
    height: 70,
    borderRadius: 25,
    backgroundColor: palette.accentTint,
    borderWidth: 1,
    borderColor: "#44345F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  stateKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    color: palette.accent,
    textAlign: "center",
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.ink,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  stateHint: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.lime,
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 15,
    marginTop: 9,
  },
  retryText: {
    color: palette.canvas,
    fontWeight: "900",
    fontSize: 12,
  },
  emptyConversation: {
    flex: 1,
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    gap: 11,
    transform: [{ scaleY: -1 }],
  },
  emptyIllustration: {
    width: 116,
    height: 105,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyHalo: {
    left: 13,
    top: 5,
  },
  emptyMainIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: palette.lime,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
    shadowColor: palette.lime,
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  emptySpark: {
    position: "absolute",
    right: 6,
    top: 2,
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: palette.canvas,
  },
  emptyKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    color: palette.accent,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.ink,
    textAlign: "center",
    letterSpacing: -0.7,
  },
  emptyCopy: {
    maxWidth: 290,
    fontSize: 13,
    color: palette.muted,
    lineHeight: 21,
    textAlign: "center",
  },
  helloButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: palette.lime,
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  helloButtonText: {
    color: palette.canvas,
    fontSize: 12,
    fontWeight: "900",
  },
  composerShell: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  composerContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    padding: 10,
    borderRadius: 13,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
  },
  composerContextAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: palette.lime,
  },
  composerContextCopy: {
    flex: 1,
    gap: 2,
  },
  composerContextTitle: {
    color: palette.lime,
    fontSize: 11,
    fontWeight: "800",
  },
  composerContextBody: {
    color: palette.muted,
    fontSize: 11,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  attachButton: {
    position: "relative",
    width: 44,
    height: 45,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: "#2B3440",
    marginBottom: 1,
  },
  attachAccent: {
    position: "absolute",
    right: 8,
    top: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.lime,
  },
  attachFileButton: {
    width: 39,
    height: 45,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: "#2B3440",
    marginBottom: 1,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.45,
  },
  inputShell: {
    flex: 1,
    minHeight: 46,
    maxHeight: 124,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1823",
    borderRadius: 17,
    paddingLeft: 14,
    paddingRight: 7,
    borderWidth: 1,
    borderColor: "#302B3D",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 112,
    paddingTop: 11,
    paddingBottom: 10,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 19,
  },
  stickerToggleButton: {
    width: 35,
    height: 36,
    marginLeft: 4,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stickerToggleButtonActive: {
    backgroundColor: palette.accentTint,
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.lime,
    marginBottom: 1,
    shadowColor: palette.lime,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sendButtonDisabled: {
    backgroundColor: "#393544",
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  attachmentPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 10,
    marginBottom: 10,
    borderRadius: 17,
    backgroundColor: "#1A1823",
    borderWidth: 1,
    borderColor: "#2B3440",
  },
  fileCard: {
    minWidth: 0,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    marginBottom: 2,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentTint,
  },
  fileDetails: {
    flex: 1,
    gap: 4,
  },
  fileName: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  fileAction: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  attachmentThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: "#211D2D",
  },
  attachmentVideoIcon: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: palette.accentTint,
    borderWidth: 1,
    borderColor: "#544079",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentDetails: {
    flex: 1,
    gap: 3,
  },
  attachmentKicker: {
    color: palette.lime,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  attachmentTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.ink,
  },
  attachmentSubtitle: {
    fontSize: 10,
    color: palette.muted,
  },
  removeAttachment: {
    width: 31,
    height: 31,
    borderRadius: 11,
    backgroundColor: "#272330",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#3C354A",
  },
  composerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  composerFootnote: {
    color: "#9AA5B2",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.35,
  },
  footerLine: {
    width: 20,
    height: 1,
    backgroundColor: "#342E43",
    marginLeft: 3,
  },
  stickerPanel: {
    marginBottom: 12,
    padding: 13,
    borderRadius: 21,
    backgroundColor: "#17151F",
    borderWidth: 1,
    borderColor: "#2B3440",
  },
  stickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  stickerHeaderText: {
    flex: 1,
    gap: 3,
  },
  panelEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  panelAccent: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.lime,
  },
  panelEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: palette.accent,
  },
  stickerTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: palette.ink,
    letterSpacing: -0.45,
  },
  stickerSubtitle: {
    fontSize: 11,
    color: palette.muted,
  },
  stickerCloseButton: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#282432",
    borderWidth: 1,
    borderColor: "#2B3440",
    alignItems: "center",
    justifyContent: "center",
  },
  stickerCategories: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 12,
  },
  stickerCategory: {
    flex: 1,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: "#211E2B",
    borderWidth: 1,
    borderColor: "#302B3B",
  },
  stickerCategoryActive: {
    backgroundColor: palette.lime,
    borderColor: palette.lime,
  },
  stickerCategoryText: {
    fontSize: 10,
    fontWeight: "800",
    color: palette.muted,
  },
  stickerCategoryTextActive: {
    color: palette.canvas,
  },
  stickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    rowGap: 8,
  },
  stickerItem: {
    width: "25%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    borderRadius: 13,
  },
  stickerItemPressed: {
    backgroundColor: palette.accentTint,
    transform: [{ scale: 0.95 }],
  },
  stickerArtwork: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#211E2B",
    borderWidth: 1,
    borderColor: "#2B3440",
    alignItems: "center",
    justifyContent: "center",
  },
  stickerEmoji: {
    fontSize: 31,
  },
  stickerLabel: {
    maxWidth: 75,
    marginTop: 5,
    fontSize: 9,
    fontWeight: "700",
    color: palette.muted,
    textAlign: "center",
  },
  stickerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#302B3B",
    marginTop: 10,
    paddingTop: 11,
  },
  stickerFooterText: {
    fontSize: 10,
    color: palette.muted,
  },
  bottomSafeArea: {
    backgroundColor: palette.surface,
  },
  mediaModalRoot: {
    flex: 1,
    backgroundColor: "#07060B",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  viewerOrbOne: {
    left: -100,
    top: "20%",
  },
  viewerOrbTwo: {
    right: -40,
    bottom: "17%",
  },
  viewerTopBar: {
    position: "absolute",
    top: 54,
    left: 18,
    right: 18,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  viewerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor: "rgba(26,23,36,0.92)",
    borderWidth: 1,
    borderColor: "#2B3440",
  },
  viewerLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.lime,
  },
  noticeOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(5,4,9,0.72)",
  },
  noticeCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    padding: 24,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  noticeIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    borderRadius: 18,
    backgroundColor: palette.accentTint,
    borderWidth: 1,
    borderColor: "#544079",
  },
  noticeEyebrow: {
    color: palette.lime,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  noticeTitle: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 9,
  },
  noticeBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  noticeButton: {
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: palette.accentStrong,
  },
  noticeButtonText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  actionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  actionSheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '82%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#12161C',
    borderWidth: 1,
    borderColor: '#30382A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 22,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    marginBottom: 18,
    borderRadius: 3,
    backgroundColor: '#59634D',
  },
  actionTitle: {
    color: '#F2F5F7',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginBottom: 8,
  },
  actionPreview: {
    color: '#A5AD9E',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#121710',
    borderWidth: 1,
    borderColor: '#293222',
  },
  actionError: {
    color: '#FF8A99',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#241519',
    borderWidth: 1,
    borderColor: '#52303A',
  },
  forwardLoader: {
    marginVertical: 24,
  },
  forwardTargetList: {
    maxHeight: 310,
  },
  forwardTarget: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 9,
    borderRadius: 13,
  },
  forwardTargetIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  forwardTargetName: {
    flex: 1,
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  forwardEmpty: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 18,
  },
  forwardCancel: {
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    borderRadius: 13,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionSecondary: {
    minHeight: 54,
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#151A12',
    borderWidth: 1,
    borderColor: '#2D3726',
  },
  actionSecondaryText: {
    color: '#EDF1E7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  actionDanger: {
    minHeight: 52,
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: '#A93148',
    borderWidth: 1,
    borderColor: '#D05A70',
  },
  actionDangerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionReactionEmoji: {
    fontSize: 16,
  },
  actionDeleteRow: {
    width: '100%',
    minHeight: 50,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#542B35',
    backgroundColor: '#211418',
  },
  actionDeleteText: {
    color: '#FF9CAA',
    fontSize: 12,
    fontWeight: '800',
  },
  viewerEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: palette.ink,
  },
  mediaModalClose: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,23,36,0.94)",
    borderWidth: 1,
    borderColor: "#2B3440",
  },
  modalImage: {
    width: "100%",
    height: "82%",
  },
  modalVideo: {
    width: "100%",
    flex: 1,
    marginTop: 100,
    marginBottom: 96,
  },
  viewerBottomLabel: {
    position: "absolute",
    bottom: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "rgba(26,23,36,0.92)",
    borderWidth: 1,
    borderColor: "#2B3440",
  },
  viewerBottomText: {
    color: "#D9D4E7",
    fontSize: 11,
    fontWeight: "600",
  },
  callScreen: {
    flex: 1,
    backgroundColor: "#090C12",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 36,
  },
  callHeader: {
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  callTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
  },
  callTypeBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: palette.lime,
    letterSpacing: 1.2,
  },
  callStatus: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.muted,
  },
  callCenter: {
    alignItems: "center",
    gap: 14,
  },
  callAvatarGlow: {
    padding: 10,
    borderRadius: 80,
    backgroundColor: "rgba(216,255,114,0.08)",
  },
  callAvatarRing: {
    padding: 5,
    borderRadius: 72,
    borderWidth: 2,
    borderColor: palette.lime,
  },
  callName: {
    fontSize: 26,
    fontWeight: "900",
    color: palette.ink,
    letterSpacing: -0.5,
  },
  callSubtitle: {
    fontSize: 14,
    color: palette.muted,
  },
  callControlsDock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  callBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: palette.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    gap: 2,
  },
  callBtnActive: {
    backgroundColor: palette.lime,
    borderColor: palette.lime,
  },
  callBtnLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: palette.muted,
  },
  callBtnLabelActive: {
    color: palette.canvas,
  },
  callEndBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: palette.danger,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
