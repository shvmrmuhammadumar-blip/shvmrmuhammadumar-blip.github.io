import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "./Avatar";
import { supabase } from "../lib/supabase";
import { Alert } from "../lib/alert";

type ReactionSummary = { reaction: string; count: number; mine: boolean };
type CommentRecord = {
  id: string;
  post_id: string;
  user_id: string;
  body: string | null;
  parent_id: string | null;
  comment_type: "text" | "image" | "sticker";
  media_path: string | null;
  media_mime_type: string | null;
  media_file_name: string | null;
  created_at: string;
  edited_at: string | null;
  reactions: ReactionSummary[];
  profiles?: { username?: string | null; avatar_url?: string | null } | null;
};
type CommentNode = CommentRecord & { replies: CommentNode[] };
type Props = {
  visible: boolean;
  postId: string;
  postOwnerId: string;
  userId?: string;
  embedded?: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
};
type NewComment = {
  body: string | null;
  comment_type: "text" | "image" | "sticker";
  media_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
};

const db = supabase as any;

function commentErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const parts = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string => typeof part === "string" && !!part.trim());
    if (parts.length) return parts.join(" · ");
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
const REACTIONS = ["❤️", "😂", "🔥", "🙌", "👏", "😍"] as const;

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]["value"];

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}

export default function PostCommentsSheet({
  visible,
  postId,
  postOwnerId,
  userId,
  onClose,
  onCountChange,
  embedded = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktopEmbedded = embedded && windowWidth >= 1100;
  const halfHeight = isDesktopEmbedded ? Math.min(windowHeight * 0.88, 900) : Math.min(292, windowHeight * 0.36);
  const expandedHeight = isDesktopEmbedded ? halfHeight : windowHeight * 0.88;
  const sheetHeight = useRef(new Animated.Value(halfHeight)).current;
  const currentHeight = useRef(halfHeight);
  const dragStartHeight = useRef(halfHeight);
  const closeRef = useRef(onClose);
  const countCallbackRef = useRef(onCountChange);
  closeRef.current = onClose;
  countCallbackRef.current = onCountChange;

  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRecord | null>(null);
  const [pendingImage, setPendingImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [expandedReplyGroups, setExpandedReplyGroups] = useState<Set<string>>(() => new Set());
  const [errorText, setErrorText] = useState("");
  const [commentToDelete, setCommentToDelete] = useState<CommentRecord | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<CommentRecord | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<CommentRecord | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

  const animateTo = useCallback((target: number) => {
    currentHeight.current = target;
    Animated.spring(sheetHeight, {
      toValue: target,
      useNativeDriver: false,
      stiffness: 260,
      damping: 30,
      mass: 0.85,
    }).start();
  }, [sheetHeight]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => {
      dragStartHeight.current = currentHeight.current;
    },
    onPanResponderMove: (_event, gesture) => {
      const next = Math.max(halfHeight * 0.82, Math.min(expandedHeight, dragStartHeight.current - gesture.dy));
      currentHeight.current = next;
      sheetHeight.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 125 && currentHeight.current <= halfHeight + 24) {
        closeRef.current();
        return;
      }
      if (gesture.dy < -35) {
        animateTo(expandedHeight);
      } else if (gesture.dy > 40) {
        animateTo(halfHeight);
      } else {
        animateTo(currentHeight.current > (halfHeight + expandedHeight) / 2 ? expandedHeight : halfHeight);
      }
    },
    onPanResponderTerminate: () => animateTo(halfHeight),
  }), [animateTo, expandedHeight, halfHeight, sheetHeight]);

  const loadComments = useCallback(async () => {
    const { data, error } = await db
      .from("comments")
      .select("id, post_id, user_id, body, parent_id, comment_type, media_path, media_mime_type, media_file_name, created_at, edited_at, profiles!comments_user_id_fkey(username, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("comments query: " + commentErrorMessage(error, "Query failed"));

    const rows = (data ?? []) as Omit<CommentRecord, "reactions">[];
    let reactionRows: { comment_id: string; user_id: string; reaction: string }[] = [];

    if (rows.length > 0) {
      const result = await db
        .from("comment_reactions")
        .select("comment_id, user_id, reaction")
        .in("comment_id", rows.map((row) => row.id));
      if (result.error) throw new Error("comment_reactions query: " + commentErrorMessage(result.error, "Query failed"));
      reactionRows = result.data ?? [];
    }

    const grouped = new Map<string, Map<string, string[]>>();
    reactionRows.forEach((row) => {
      if (!grouped.has(row.comment_id)) grouped.set(row.comment_id, new Map());
      const byEmoji = grouped.get(row.comment_id)!;
      if (!byEmoji.has(row.reaction)) byEmoji.set(row.reaction, []);
      byEmoji.get(row.reaction)!.push(row.user_id);
    });

    const mapped: CommentRecord[] = rows.map((row) => ({
      ...row,
      reactions: Array.from(grouped.get(row.id)?.entries() ?? []).map(([reaction, users]) => ({
        reaction,
        count: users.length,
        mine: !!userId && users.includes(userId),
      })),
    }));

    setComments(mapped);
    countCallbackRef.current(mapped.length);
    return mapped.length;
  }, [postId, userId]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    currentHeight.current = halfHeight;
    sheetHeight.setValue(halfHeight);
    setLoading(true);
    setErrorText("");
    void (async () => {
      try {
        const count = await loadComments();
        if (!active) return;

        const targetHeight = count === 0
          ? halfHeight
          : Math.min(expandedHeight, halfHeight + 72 + count * 42);

        animateTo(targetHeight);
      } catch (error) {
        console.error("[Lumo] loadComments failed:", error);
        if (active) setErrorText(commentErrorMessage(error, "Could not load comments."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [visible, halfHeight, expandedHeight, sheetHeight, loadComments, animateTo]);

  const tree = useMemo(() => {
    const nodes = new Map<string, CommentNode>();
    comments.forEach((item) => nodes.set(item.id, { ...item, replies: [] }));
    const roots: CommentNode[] = [];
    comments.forEach((item) => {
      const node = nodes.get(item.id)!;
      const parent = item.parent_id ? nodes.get(item.parent_id) : undefined;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    });
    return roots;
  }, [comments]);

  const insertComment = useCallback(async (payload: NewComment) => {
    if (!userId) throw new Error("Your session is unavailable.");
    const { error } = await db.from("comments").insert({
      post_id: postId,
      user_id: userId,
      parent_id: replyTo ? (replyTo.parent_id ?? replyTo.id) : null,
      ...payload,
    });
    if (error) throw error;
    setText("");
    setPendingImage(null);
    setReplyTo(null);
    await loadComments();
  }, [loadComments, postId, replyTo, userId]);

  const sendText = async () => {
    const body = text.trim();
    if (!body || sending || !userId) return;
    setSending(true);
    setErrorText("");
    try {
      if (editingComment) {
        const { error } = await db
          .from("comments")
          .update({ body, edited_at: new Date().toISOString() })
          .eq("id", editingComment.id)
          .eq("user_id", userId);
        if (error) throw error;
        setEditingComment(null);
        setText("");
        await loadComments();
      } else {
        await insertComment({ body, comment_type: "text" });
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not post comment.");
    } finally {
      setSending(false);
    }
  };

  const chooseImage = async () => {
    if (sending || editingComment) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorText("Allow photo library access to attach an image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 1,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingImage(result.assets[0]);
        setErrorText("");
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not open photos.");
    }
  };

  const sendImage = async () => {
    if (!pendingImage || sending || !userId) return;
    setSending(true);
    setErrorText("");
    let uploadedPath: string | null = null;
    try {
      if ((pendingImage.fileSize ?? 0) > 8 * 1024 * 1024) {
        throw new Error("Choose an image smaller than 8 MB.");
      }
      const response = await fetch(pendingImage.uri);
      if (!response.ok) throw new Error("Could not read the selected image.");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) {
        throw new Error("Choose an image smaller than 8 MB.");
      }
      const mimeType = pendingImage.mimeType ?? "image/jpeg";
      const suppliedName = pendingImage.fileName ?? "comment-image.jpg";
      const rawExtension = suppliedName.split(".").pop()?.toLowerCase() ?? "jpg";
      const extension = /^[a-z0-9]{2,5}$/.test(rawExtension) ? rawExtension : (mimeType === "image/png" ? "png" : "jpg");
      uploadedPath = `${userId}/comments/${postId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const { error: uploadError } = await db.storage.from("images").upload(uploadedPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      await insertComment({
        body: text.trim() || null,
        comment_type: "image",
        media_path: uploadedPath,
        media_mime_type: mimeType,
        media_file_name: suppliedName,
      });
    } catch (error) {
      if (uploadedPath) {
        await db.storage.from("images").remove([uploadedPath]);
      }
      setErrorText(error instanceof Error ? error.message : "Could not send image.");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (item: CommentRecord) => {
    if (!userId || item.user_id !== userId) return;
    setEditingComment(item);
    setReplyTo(null);
    setPendingImage(null);
    setText(item.body ?? "");
    setErrorText("");
  };

  const toggleReaction = async (item: CommentRecord, reaction: string) => {
    if (!userId) return;
    const ownReaction = item.reactions.find((value) => value.mine);

    try {
      const result = ownReaction?.reaction === reaction
        ? await db.from("comment_reactions").delete()
            .eq("comment_id", item.id).eq("user_id", userId)
        : await db.from("comment_reactions").upsert(
            { comment_id: item.id, user_id: userId, reaction },
            { onConflict: "comment_id,user_id" },
          );

      if (result.error) throw result.error;
      setReactionPickerFor(null);
      await loadComments();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not update reaction.");
    }
  };

  const startReport = (item: CommentRecord) => {
    if (!userId || item.user_id === userId) return;
    setReportReason("spam");
    setReportDetails("");
    setReportTarget(item);
    setErrorText("");
  };

  const submitReport = async () => {
    const item = reportTarget;
    if (!item || !userId || reporting || item.user_id === userId) return;
    setReporting(true);
    setErrorText("");

    try {
      const { error } = await db.from("comment_reports").insert({
        comment_id: item.id,
        post_id: postId,
        reporter_id: userId,
        reported_user_id: item.user_id,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      if (error) throw error;

      setReportTarget(null);
      setReportDetails("");
      Alert.alert("Report submitted", "The comment has been sent for review.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not submit report.");
    } finally {
      setReporting(false);
    }
  };

  const deleteComment = (item: CommentRecord) => {
    if (!userId || (item.user_id !== userId && postOwnerId !== userId)) return;
    setErrorText("");
    setCommentToDelete(item);
  };

  const confirmDeleteComment = async () => {
    const item = commentToDelete;
    if (!item || !userId || deletingCommentId) return;

    setDeletingCommentId(item.id);
    setErrorText("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const authenticatedUserId = authData.user?.id;
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        throw new Error("Your sign-in session is out of date. Sign out and sign in again.");
      }
      if (item.user_id !== authenticatedUserId && postOwnerId !== authenticatedUserId) {
        throw new Error("Only the comment author or post owner can delete this comment.");
      }

      const { data, error } = await db
        .from("comments")
        .delete()
        .eq("id", item.id)
        .eq("post_id", postId)
        .select("id");

      if (error) throw error;
      if (!data?.length) {
        throw new Error("Supabase did not delete this comment. The signed-in account or delete policy may not match.");
      }

      setCommentToDelete(null);
      try {
        await loadComments();
      } catch {
        setErrorText("The comment was deleted, but the comments list could not refresh.");
      }
    } catch (error) {
      setCommentToDelete(null);
      setErrorText(error instanceof Error ? error.message : "Could not delete comment.");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const renderComment = (item: CommentNode, depth = 0): React.ReactElement => {
    const username = item.profiles?.username ?? "user";
    const imageUrl = item.media_path
      ? db.storage.from("images").getPublicUrl(item.media_path).data.publicUrl as string
      : null;
    const canDelete = item.user_id === userId || postOwnerId === userId;
    const repliesExpanded = expandedReplyGroups.has(item.id);

    return (
      <View key={item.id} style={[styles.commentBlock, depth > 0 && styles.replyBlock]}>
        <View style={styles.commentRow}>
          <Avatar uri={item.profiles?.avatar_url} name={username} size={34} />
          <View style={styles.commentContent}>
            <View style={styles.commentBubble}>
              <Text style={styles.username}>@{username}</Text>
              {item.edited_at ? <Text style={styles.editedLabel}>EDITED</Text> : null}
              {item.comment_type === "image" && imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.commentImage} contentFit="cover" />
              ) : null}
              {item.comment_type === "sticker" ? (
                <Text style={styles.commentSticker}>{item.body}</Text>
              ) : item.body?.trim() ? (
                <Text style={styles.commentBody}>{item.body}</Text>
              ) : null}
            </View>
            <View style={styles.commentMeta}>
              <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
              <Pressable onPress={() => { setEditingComment(null); setReplyTo(item); }} hitSlop={8}>
                <Text style={styles.replyAction}>Reply</Text>
              </Pressable>
              {item.user_id === userId && (
                <Pressable onPress={() => startEdit(item)} hitSlop={8}>
                  <Text style={styles.replyAction}>Edit</Text>
                </Pressable>
              )}
              {canDelete && (
                <Pressable onPress={() => deleteComment(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={14} color="#858D80" />
                </Pressable>
              )}
              {item.user_id !== userId && (
                <Pressable onPress={() => startReport(item)} hitSlop={8}>
                  <Ionicons name="flag-outline" size={14} color="#858D80" />
                </Pressable>
              )}
            </View>

            <View style={styles.reactionRow}>
              {item.reactions.map((value) => (
                <Pressable
                  key={value.reaction}
                  onPress={() => void toggleReaction(item, value.reaction)}
                  style={[styles.reactionChip, value.mine && styles.reactionChipActive]}
                >
                  <Text style={styles.reactionChipText}>{value.reaction} {value.count}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setReactionPickerFor((current) => current === item.id ? null : item.id)}
                hitSlop={6}
                style={styles.addReactionButton}
              >
                <Ionicons name="happy-outline" size={15} color="#AAB39F" />
              </Pressable>
            </View>

            {reactionPickerFor === item.id && (
              <View style={styles.reactionPicker}>
                {REACTIONS.map((reaction) => (
                  <Pressable
                    key={reaction}
                    onPress={() => void toggleReaction(item, reaction)}
                    style={styles.reactionChoice}
                  >
                    <Text style={styles.reactionChoiceText}>{reaction}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {item.replies.length > 0 && (
              <View style={styles.replyGroup}>
                <Pressable
                  onPress={() =>
                    setExpandedReplyGroups((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  style={styles.replyToggle}
                  accessibilityRole="button"
                  accessibilityLabel={repliesExpanded ? "Hide replies" : `Show ${item.replies.length} replies`}
                >
                  <Ionicons name={repliesExpanded ? "chevron-up" : "chevron-down"} size={13} color="#B9C7D6" />
                  <Text style={styles.replyAction}>
                    {repliesExpanded ? "Hide replies" : `Replies (${item.replies.length})`}
                  </Text>
                </Pressable>
                {repliesExpanded && (
                  <View style={styles.replies}>
                    {item.replies.map((reply) => renderComment(reply, depth + 1))}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const sheetContent = (
      <View style={[styles.modalRoot, embedded && styles.embeddedRoot, isDesktopEmbedded && styles.desktopEmbeddedRoot]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={[styles.keyboardDock, isDesktopEmbedded && styles.desktopKeyboardDock]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.View style={[styles.sheet, isDesktopEmbedded && styles.desktopSheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View {...panResponder.panHandlers} style={styles.dragZone}>
              <View style={styles.dragHandle} />
            </View>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Comments</Text>
                <Text style={styles.count}>{comments.length} comments</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
                <Ionicons name="close" size={20} color="#F2F5F7" />
              </Pressable>
            </View>
            <View style={styles.divider} />

            {loading ? (
              <View style={styles.centerState}><ActivityIndicator color="#B9C7D6" /></View>
            ) : (
              <FlatList
                data={tree}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderComment(item)}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={(
                  <View style={styles.emptyState}>
                    <Ionicons name="chatbubble-ellipses-outline" size={26} color="#697263" />
                    <Text style={styles.emptyTitle}>No comments yet</Text>
                    <Text style={styles.emptyText}>Start the conversation.</Text>
                  </View>
                )}
              />
            )}

            {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

            {pendingImage && (
              <View style={styles.imagePreviewRow}>
                <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} contentFit="cover" />
                <Text style={styles.imagePreviewName} numberOfLines={1}>Image ready</Text>
                <Pressable onPress={() => setPendingImage(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color="#A8B09F" />
                </Pressable>
              </View>
            )}

            {editingComment && (
              <View style={styles.replyingBar}>
                <Text style={styles.replyingText}>Editing your comment</Text>
                <Pressable onPress={() => { setEditingComment(null); setText(""); }} hitSlop={8}>
                  <Ionicons name="close" size={16} color="#A8B09F" />
                </Pressable>
              </View>
            )}

            {replyTo && (
              <View style={styles.replyingBar}>
                <Text style={styles.replyingText}>Replying to @{replyTo.profiles?.username ?? "user"}</Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color="#A8B09F" />
                </Pressable>
              </View>
            )}

            <View style={styles.composer}>
              <Pressable onPress={() => void chooseImage()} disabled={sending} style={styles.toolButton}>
                <Ionicons name="image-outline" size={21} color="#B9C7D6" />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={editingComment ? "Edit your comment..." : replyTo ? "Write a reply..." : "Add a comment..."}
                placeholderTextColor="#747D6E"
                style={styles.input}
                maxLength={1000}
                multiline
                editable={!sending}
                returnKeyType="default"
              />
              <Pressable
                onPress={() => pendingImage ? void sendImage() : void sendText()}
                disabled={sending || (!text.trim() && !pendingImage)}
                style={[styles.sendButton, (sending || (!text.trim() && !pendingImage)) && styles.sendButtonDisabled]}
              >
                {sending ? <ActivityIndicator size="small" color="#0B0E09" /> : <Ionicons name="arrow-up" size={19} color="#0B0E09" />}
              </Pressable>
            </View>

            {reportTarget && (
              <View style={styles.deleteOverlay}>
                <View style={styles.reportDialog}>
                  <Text style={styles.deleteTitle}>Report comment</Text>
                  <Text style={styles.deleteDescription}>Choose a reason for reporting this comment.</Text>
                  {REPORT_REASONS.map((reason) => (
                    <Pressable
                      key={reason.value}
                      onPress={() => setReportReason(reason.value)}
                      style={[styles.reportOption, reportReason === reason.value && styles.reportOptionSelected]}
                    >
                      <Ionicons
                        name={reportReason === reason.value ? "radio-button-on" : "radio-button-off"}
                        size={17}
                        color={reportReason === reason.value ? "#B9C7D6" : "#8F9987"}
                      />
                      <Text style={styles.reportOptionText}>{reason.label}</Text>
                    </Pressable>
                  ))}
                  <TextInput
                    value={reportDetails}
                    onChangeText={setReportDetails}
                    placeholder="Additional details (optional)"
                    placeholderTextColor="#747D6E"
                    style={styles.reportInput}
                    maxLength={500}
                    multiline
                  />
                  <View style={styles.deleteActions}>
                    <Pressable onPress={() => setReportTarget(null)} disabled={reporting} style={styles.deleteCancel}>
                      <Text style={styles.deleteCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => void submitReport()} disabled={reporting} style={styles.deleteConfirm}>
                      {reporting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.deleteConfirmText}>Submit report</Text>}
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {commentToDelete && (
              <View style={styles.deleteOverlay}>
                <View style={styles.deleteDialog}>
                  <Text style={styles.deleteTitle}>Delete comment?</Text>
                  <Text style={styles.deleteDescription}>
                    This comment and its replies will be permanently removed.
                  </Text>
                  <View style={styles.deleteActions}>
                    <Pressable
                      onPress={() => setCommentToDelete(null)}
                      disabled={!!deletingCommentId}
                      style={styles.deleteCancel}
                    >
                      <Text style={styles.deleteCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void confirmDeleteComment()}
                      disabled={!!deletingCommentId}
                      style={styles.deleteConfirm}
                    >
                      {deletingCommentId ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.deleteConfirmText}>Delete</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
  );

  if (embedded) return visible ? sheetContent : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {sheetContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.42)" },
  embeddedRoot: { ...StyleSheet.absoluteFillObject, zIndex: 90, elevation: 90 },
  keyboardDock: { flex: 1, justifyContent: "flex-end" },
  sheet: { width: "100%", backgroundColor: "#10130F", borderTopLeftRadius: 25, borderTopRightRadius: 25, borderTopWidth: 1, borderColor: "#2A3026", overflow: "hidden" },
  desktopEmbeddedRoot: { justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 28, paddingVertical: 24 },
  desktopKeyboardDock: { justifyContent: "center", alignItems: "flex-end" },
  desktopSheet: { width: 440, maxWidth: "100%", alignSelf: "flex-end", borderRadius: 24, borderBottomWidth: 1, borderBottomColor: "#2A3026" },
  dragZone: { height: 29, alignItems: "center", justifyContent: "center" },
  dragHandle: { width: 42, height: 4, borderRadius: 4, backgroundColor: "#65705D" },
  header: { paddingHorizontal: 19, paddingBottom: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#F2F5F7", fontSize: 18, fontWeight: "800", letterSpacing: -0.35 },
  count: { color: "#8F9987", fontSize: 11, marginTop: 3 },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1B2119", alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#293027" },
  listContent: { paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, flexGrow: 1 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, minHeight: 86, alignItems: "center", justifyContent: "center", gap: 7 },
  emptyTitle: { color: "#E9EDE4", fontSize: 14, fontWeight: "700" },
  emptyText: { color: "#899283", fontSize: 12 },
  commentBlock: { marginBottom: 15 },
  replyBlock: { marginTop: 9, marginBottom: 11 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  commentContent: { flex: 1, minWidth: 0 },
  commentBubble: { alignSelf: "flex-start", maxWidth: "100%", backgroundColor: "#181D16", borderRadius: 15, borderTopLeftRadius: 5, paddingHorizontal: 12, paddingVertical: 9 },
  username: { color: "#B9C7D6", fontSize: 11, fontWeight: "800", marginBottom: 4 },
  commentBody: { color: "#F0F2EA", fontSize: 13, lineHeight: 19 },
  commentImage: { width: 190, height: 150, borderRadius: 11, backgroundColor: "#090B08" },
  commentSticker: { color: "#FFFFFF", fontSize: 42, lineHeight: 52 },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 3, paddingTop: 6 },
  time: { color: "#7F8977", fontSize: 10 },
  replyAction: { color: "#ABB4A3", fontSize: 10, fontWeight: "700" },
  replyGroup: { marginTop: 8, marginLeft: 3 },
  replyToggle: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3, paddingRight: 8 },
  replies: { marginLeft: 10, marginTop: 7, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "#2B3440" },
  errorText: { color: "#FF8894", fontSize: 11, paddingHorizontal: 17, paddingBottom: 7 },
  imagePreviewRow: { marginHorizontal: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#1A2029", borderRadius: 12, padding: 7 },
  imagePreview: { width: 42, height: 42, borderRadius: 8 },
  imagePreviewName: { flex: 1, color: "#E8ECE2", fontSize: 12 },
  replyingBar: { marginHorizontal: 14, marginBottom: 7, paddingHorizontal: 10, paddingVertical: 7, borderLeftWidth: 2, borderLeftColor: "#B9C7D6", backgroundColor: "#1A2029", borderRadius: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  replyingText: { color: "#C7CEBE", fontSize: 11 },
  composer: { marginHorizontal: 12, marginTop: 6, padding: 7, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1A2018", borderWidth: 1, borderColor: "#2B3440", borderRadius: 17 },
  toolButton: { width: 34, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  input: { flex: 1, minHeight: 35, maxHeight: 88, paddingHorizontal: 5, paddingVertical: 7, color: "#F2F5F7", fontSize: 13 },
  sendButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#B9C7D6", alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.4 },
  deleteOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50, backgroundColor: "rgba(0,0,0,0.68)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  deleteDialog: { width: "100%", maxWidth: 360, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: "#36402F", backgroundColor: "#171C15", gap: 10 },
  deleteTitle: { color: "#F2F5F7", fontSize: 17, fontWeight: "800" },
  deleteDescription: { color: "#A8B09F", fontSize: 13, lineHeight: 19 },
  deleteActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 9, marginTop: 8 },
  deleteCancel: { minWidth: 88, height: 39, paddingHorizontal: 14, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#252C21" },
  deleteConfirm: { minWidth: 88, height: 39, paddingHorizontal: 14, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#A93448" },
  deleteCancelText: { color: "#E7EBE1", fontSize: 12, fontWeight: "700" },
  editedLabel: { color: "#8D9880", fontSize: 8, fontWeight: "800", letterSpacing: 0.8, marginBottom: 5 },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 7, marginLeft: 2 },
  reactionChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: "#1B2119", borderWidth: 1, borderColor: "#2B3440" },
  reactionChipActive: { backgroundColor: "#28351B", borderColor: "#829B4D" },
  reactionChipText: { color: "#E9EDE4", fontSize: 10, fontWeight: "700" },
  addReactionButton: { width: 25, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1B2119" },
  reactionPicker: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6, marginTop: 5, alignSelf: "flex-start", backgroundColor: "#20271D", borderRadius: 14, borderWidth: 1, borderColor: "#35412D" },
  reactionChoice: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  reactionChoiceText: { fontSize: 19 },
  reportDialog: { width: "100%", maxWidth: 360, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: "#36402F", backgroundColor: "#171C15", gap: 9 },
  reportOption: { minHeight: 36, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 9, backgroundColor: "#20261D" },
  reportOptionSelected: { borderWidth: 1, borderColor: "#596B3C", backgroundColor: "#28351B" },
  reportOptionText: { color: "#E7EBE1", fontSize: 12, fontWeight: "600" },
  reportInput: { minHeight: 62, maxHeight: 100, padding: 10, color: "#F2F5F7", fontSize: 12, borderWidth: 1, borderColor: "#2B3440", borderRadius: 10, backgroundColor: "#12161C", textAlignVertical: "top" },
  deleteConfirmText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});