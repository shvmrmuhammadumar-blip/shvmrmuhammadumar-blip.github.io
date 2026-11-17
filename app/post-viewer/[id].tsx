import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useEvent, useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../../components/Avatar";
import PostCommentsSheet from "../../components/PostCommentsSheet";
import UniversalForwardModal, { type ForwardSource } from "../../components/UniversalForwardModal";
import { Alert } from "../../lib/alert";
import { useAuth } from "../../lib/auth";
import { POST_SELECT, setLike, toggleLikeLocally } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { createContentSessionKey, trackContentOpen, trackContentPlayback } from "../../lib/studio-analytics";
import type { Post } from "../../lib/types";

function ReelVideo({ uri, topInset, ownerId, viewerId, contentId }: { uri: string; topInset: number; ownerId: string; viewerId: string; contentId: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });
  const shouldResumeRef = useRef(true);
  const sessionKeyRef = useRef<string | null>(null);
  if (!sessionKeyRef.current) sessionKeyRef.current = createContentSessionKey();
  const watchedMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const lastSavedMsRef = useRef(0);
  const completeRef = useRef(false);
  const completeSavedRef = useRef(false);
  const pendingRef = useRef(false);
  const flushQueuedRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (!ownerId || !viewerId || ownerId === viewerId) return;
    const watchMs = watchedMsRef.current;
    const completed = completeRef.current;
    if (watchMs <= lastSavedMsRef.current && (!completed || completeSavedRef.current)) return;
    if (pendingRef.current) {
      flushQueuedRef.current = true;
      return;
    }
    pendingRef.current = true;
    void trackContentPlayback({
      ownerId,
      viewerId,
      contentId,
      contentType: 'post',
      sessionKey: sessionKeyRef.current ?? createContentSessionKey(),
      watchMs,
      durationMs: durationMsRef.current,
      completed,
    }).then((saved) => {
      if (saved) {
        lastSavedMsRef.current = Math.max(lastSavedMsRef.current, watchMs);
        if (completed) completeSavedRef.current = true;
      }
    }).finally(() => {
      pendingRef.current = false;
      if (flushQueuedRef.current) {
        flushQueuedRef.current = false;
        flushRef.current();
      }
    });
  };

  useEventListener(player, 'timeUpdate', (event) => {
    if (player.duration > 0) {
      durationMsRef.current = Math.min(3600000, Math.round(player.duration * 1000));
      if (event.currentTime >= player.duration - 0.55) completeRef.current = true;
    }
  });

  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      flushRef.current();
      return;
    }

    let previousTick = Date.now();
    lastTickRef.current = previousTick;
    lastFlushRef.current = previousTick;

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - previousTick;
      previousTick = now;
      lastTickRef.current = now;

      if (!player.playing || status !== 'readyToPlay') return;
      if (elapsed > 0 && elapsed <= 1500) {
        watchedMsRef.current = Math.min(3600000, watchedMsRef.current + elapsed);
      }

      if (player.duration > 0) {
        durationMsRef.current = Math.min(3600000, Math.round(player.duration * 1000));
        if (player.currentTime >= player.duration - 0.55) completeRef.current = true;
      }

      if (now - lastFlushRef.current >= 5000) {
        lastFlushRef.current = now;
        flushRef.current();
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      lastTickRef.current = null;
    };
  }, [isPlaying, player, status]);

  useEffect(() => () => {
    lastTickRef.current = null;
    flushRef.current();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (shouldResumeRef.current) player.play();
      return () => player.pause();
    }, [player]),
  );

  const togglePlayback = () => {
    if (isPlaying) {
      shouldResumeRef.current = false;
      player.pause();
    } else {
      shouldResumeRef.current = true;
      player.play();
    }
  };

  const toggleSound = () => { player.volume = 1; player.muted = !player.muted; };

  return (
    <View style={styles.videoStage}>
      <VideoView player={player} surfaceType="textureView" style={styles.videoFrame}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={togglePlayback}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
      />
      {!isPlaying && (
        <View pointerEvents="none" style={styles.pausedMark}>
          <Ionicons name="play" size={31} color="#FFFFFF" />
        </View>
      )}
      {status === "loading" && (
        <View pointerEvents="none" style={styles.videoLoading}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      {status === "error" && (
        <View pointerEvents="none" style={styles.videoLoading}>
          <Ionicons name="alert-circle-outline" size={28} color="#FFFFFF" />
        </View>
      )}
      <Pressable
        onPress={toggleSound}
        style={[styles.soundButton, { top: topInset + 12 }]}
        accessibilityRole="button"
        accessibilityLabel={muted ? "Turn sound on" : "Mute video"}
        hitSlop={8}
      >
        <Ionicons
          name={muted ? "volume-mute" : "volume-high"}
          size={19}
          color="#FFFFFF"
        />
      </Pressable>
    </View>
  );
}

export default function PostViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likeBusy, setLikeBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [forwardSource, setForwardSource] = useState<ForwardSource | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);

  const load = useCallback(
    async (stillActive: () => boolean = () => true) => {
      if (!id || !me) return;
      const [postResult, savedResult] = await Promise.all([
        supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle(),
        supabase
          .from("saved_post")
          .select("post_id")
          .eq("post_id", id)
          .eq("user_id", me)
          .maybeSingle(),
      ]);
      if (postResult.error) throw postResult.error;
      if (savedResult.error) throw savedResult.error;
      if (!stillActive()) return;
      const loadedPost = (postResult.data as unknown as Post | null) ?? null;
      setPost(loadedPost);
      if (loadedPost && me && loadedPost.media_type !== 'video' && !loadedPost.video_url) {
        void trackContentOpen({
          ownerId: loadedPost.user_id,
          viewerId: me,
          contentId: loadedPost.id,
          contentType: 'post',
        });
      }
      setIsSaved(Boolean(savedResult.data));
    },
    [id, me],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void load(() => active)
        .catch((error: unknown) => {
          if (!active) return;
          setPost(null);
          Alert.alert(
            "Post unavailable",
            error instanceof Error ? error.message : "This post could not be opened.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const onLike = async () => {
    if (!post || !me || likeBusy) return;
    const wasLiked = (post.likes ?? []).some((like) => like.user_id === me);
    const previous = post;
    setPost((current) => (current ? toggleLikeLocally(current, me) : current));
    setLikeBusy(true);
    try {
      await setLike(post.id, me, !wasLiked);
    } catch (error) {
      setPost(previous);
      Alert.alert(
        "Like failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLikeBusy(false);
    }
  };

  const onSave = async () => {
    if (!post || !me || saveBusy) return;
    const next = !isSaved;
    setIsSaved(next);
    setSaveBusy(true);
    try {
      const result = next
        ? await supabase
            .from("saved_post")
            .insert({ post_id: post.id, user_id: me })
        : await supabase
            .from("saved_post")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", me);
      if (result.error) throw result.error;
    } catch (error) {
      setIsSaved(!next);
      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const onForward = () => {
    if (!post) return;
    const isVideo = post.media_type === "video" || Boolean(post.video_url);
    setForwardSource({
      type: "post",
      id: post.id,
      senderLabel: post.profiles?.username ?? "user",
      chatLabel: "Lumo post",
      body: post.caption ?? null,
      messageType: isVideo ? "video" : "image",
      mediaPath: post.media_path ?? null,
      mediaMimeType: post.media_mime_type ?? null,
      mediaFileName:
        post.media_file_name ?? post.media_path?.split("/").pop() ?? null,
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar hidden />
        <ActivityIndicator color="#B9C7D6" size="small" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.unavailableScreen}>
        <StatusBar hidden />
        <Pressable
          onPress={goBack}
          style={[styles.backButton, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
        </Pressable>
        <View style={styles.unavailableContent}>
          <Ionicons name="eye-off-outline" size={28} color="#9AA5B2" />
          <Text style={styles.unavailableText}>Post unavailable</Text>
        </View>
      </View>
    );
  }

  const isVideo = post.media_type === "video" || Boolean(post.video_url);
  const liked = (post.likes ?? []).some((like) => like.user_id === me);
  const likeCount = post.likes?.length ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const username = post.profiles?.username ?? "user";

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <View style={styles.stage}>
        {isVideo ? (
          post.video_url ? (
            <ReelVideo uri={post.video_url} topInset={insets.top} ownerId={post.user_id} viewerId={me ?? ""} contentId={post.id} />
          ) : (
            <View style={styles.mediaFallback}>
              <Ionicons name="videocam-off-outline" size={30} color="#9AA5B2" />
            </View>
          )
        ) : post.image_url ? (
          <Image
            source={{ uri: post.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={180}
          />
        ) : (
          <View style={styles.mediaFallback}>
            <Ionicons name="image-outline" size={30} color="#9AA5B2" />
          </View>
        )}


        <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={goBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={[styles.actionRail, { bottom: insets.bottom + 126 }]}>
          <Pressable
            onPress={() => void onLike()}
            disabled={likeBusy}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={liked ? "Unlike post" : "Like post"}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={31}
              color={liked ? "#FF6478" : "#FFFFFF"}
            />
            <Text style={styles.actionCount}>{likeCount}</Text>
          </Pressable>
          <Pressable
            onPress={() => setCommentsVisible(true)}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Open comments"
          >
            <Ionicons name="chatbubble-outline" size={27} color="#FFFFFF" />
            <Text style={styles.actionCount}>{commentCount}</Text>
          </Pressable>
          <Pressable
            onPress={onForward}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Forward post"
          >
            <Ionicons name="arrow-redo-outline" size={27} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => void onSave()}
            disabled={saveBusy}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Remove saved post" : "Save post"}
          >
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={27}
              color={isSaved ? "#B9C7D6" : "#FFFFFF"}
            />
          </Pressable>
        </View>

        <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            onPress={() => router.push(`/user/${post.user_id}` as any)}
            style={styles.authorRow}
            accessibilityRole="button"
            accessibilityLabel={`Open ${username} profile`}
          >
            <Avatar
              uri={post.profiles?.avatar_url}
              name={username}
              size={36}
            />
            <Text style={styles.authorName} numberOfLines={1}>
              @{username}
            </Text>
          </Pressable>
          {!!post.caption?.trim() && (
            <Text style={styles.caption} numberOfLines={3}>
              {post.caption.trim()}
            </Text>
          )}
        </View>
      </View>

      <UniversalForwardModal
        visible={!!forwardSource}
        userId={me}
        source={forwardSource}
        onClose={() => setForwardSource(null)}
        onSuccess={() => setForwardSource(null)}
      />
      <PostCommentsSheet
        visible={commentsVisible}
        postId={post.id}
        postOwnerId={post.user_id}
        userId={me}
        onClose={() => setCommentsVisible(false)}
        onCountChange={(count) =>
          setPost((current) =>
            current ? { ...current, comments: [{ count }] } : current
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  stage: { flex: 1, position: "relative", overflow: "hidden", backgroundColor: "#000000" },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000000" },
  unavailableScreen: { flex: 1, backgroundColor: "#000000" },
  unavailableContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  unavailableText: { color: "#A5AD9F", fontSize: 13, fontWeight: "600" },
  mediaFallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#090C12" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 4 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.42)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  soundButton: { position: "absolute", right: 16, zIndex: 20, elevation: 20, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.42)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  actionRail: { position: "absolute", right: 13, zIndex: 4, alignItems: "center", gap: 22 },
  action: { minWidth: 45, alignItems: "center", justifyContent: "center", gap: 5 },
  actionCount: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 5 },
  bottomInfo: { position: "absolute", left: 16, right: 78, bottom: 0, zIndex: 3, paddingTop: 54 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 },
  authorName: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 6 },
  caption: { color: "#FFFFFF", fontSize: 13, lineHeight: 19, fontWeight: "500", textShadowColor: "rgba(0,0,0,0.88)", textShadowRadius: 6 },
  videoStage: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  videoFrame: { width: "100%", height: "100%" },
  pausedMark: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 2 },
  videoLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 2 },
});
