import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useEvent } from "expo";
import { VideoView, useVideoPlayer, type VideoThumbnail } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Avatar from "./Avatar";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";

type SharedPost = {
  id: string;
  user_id: string;
  image_url: string | null;
  video_url: string | null;
  media_type: string | null;
  caption: string | null;
  profiles: { username: string | null; avatar_url: string | null } | null;
};

type Props = { postId: string; variant?: "default" | "forward" };

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });

  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);

  useEffect(() => {
    let active = true;

    if (status !== "readyToPlay") {
      return () => {
        active = false;
      };
    }

    if (Platform.OS === "web") {
      player.muted = true;
      player.play();

      return () => {
        active = false;
      };
    }

    void player.generateThumbnailsAsync([0], {
      maxWidth: 720,
      maxHeight: 720,
    }).then((frames) => {
      if (active && frames.length > 0) {
        setThumbnail(frames[0]);
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [player, status]);

  if (thumbnail) {
    return (
      <Image
        source={thumbnail}
        style={styles.media}
        contentFit="cover"
      />
    );
  }

  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="cover"
      nativeControls={false}
      onFirstFrameRender={() => {
        if (Platform.OS === "web") {
          player.pause();
        }
      }}
    />
  );
}

export default function SharedPostCard({ postId, variant = "default" }: Props) {
  const router = useRouter();
  const [post, setPost] = useState<SharedPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPost(null);

    void (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, user_id, image_url, video_url, media_type, caption, profiles!posts_user_id_fkey(username, avatar_url)")
        .eq("id", postId)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
        setPost(null);
      } else {
        setPost(data as unknown as SharedPost);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [postId]);

  if (loading) {
    return (
      <View style={[styles.stateCard, variant === "forward" && styles.forwardStateCard]}>
        <ActivityIndicator size="small" color={colors.lime} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.unavailableCard, variant === "forward" && styles.forwardUnavailableCard]}>
        <Ionicons name="eye-off-outline" size={18} color={colors.muted} />
        <Text style={styles.unavailableText}>Post unavailable</Text>
      </View>
    );
  }

  const isVideo = post.media_type === "video" || Boolean(post.video_url);
  const username = post.profiles?.username ?? "user";

  const mediaPreview = (
    <View style={variant === "forward" ? styles.forwardMediaFrame : styles.mediaFrame}>
      {isVideo ? (
        post.video_url ? (
          <VideoPreview uri={post.video_url} />
        ) : (
          <View style={styles.mediaFallback}>
            <Ionicons name="videocam-outline" size={25} color={colors.muted} />
          </View>
        )
      ) : post.image_url ? (
        <Image source={{ uri: post.image_url }} style={styles.media} contentFit="cover" />
      ) : (
        <View style={styles.mediaFallback}>
          <Ionicons name="image-outline" size={25} color={colors.muted} />
        </View>
      )}
      {isVideo && (
        <View style={styles.playMark} pointerEvents="none">
          <Ionicons name="play" size={16} color="#FFFFFF" />
        </View>
      )}
    </View>
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        variant === "forward" && styles.forwardCard,
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push(`/post-viewer/${post.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${username}`}
    >
      {variant === "forward" ? (
        <View style={styles.forwardLayout}>
          {mediaPreview}
          <View style={styles.forwardDetails}>
            <View style={styles.forwardTypeBadge}>
              <Text style={styles.forwardTypeText}>{isVideo ? "VIDEO" : "FOTO"}</Text>
            </View>
            <Text style={styles.forwardUsername} numberOfLines={1}>@{username}</Text>
            {!!post.caption?.trim() && (
              <Text style={styles.forwardCaption} numberOfLines={2}>
                {post.caption.trim()}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Avatar uri={post.profiles?.avatar_url} name={username} size={30} />
            <Text style={styles.username} numberOfLines={1}>@{username}</Text>
            <View style={styles.postMark}>
              <Text style={styles.postMarkText}>{isVideo ? "VIDEO" : "FOTO"}</Text>
            </View>
          </View>
          {mediaPreview}
          {!!post.caption?.trim() && (
            <Text style={styles.caption} numberOfLines={2}>{post.caption.trim()}</Text>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 252,
    maxWidth: "100%",
    padding: 9,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 9,
  },
  cardPressed: { opacity: 0.88 },
  forwardCard: {
    width: "100%",
    maxWidth: "100%",
    padding: 8,
    borderRadius: 16,
    gap: 0,
  },
  forwardLayout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  forwardMediaFrame: {
    width: 112,
    height: 88,
    overflow: "hidden",
    borderRadius: 11,
    backgroundColor: colors.bg,
  },
  forwardDetails: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 6,
  },
  forwardTypeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(216,255,114,0.12)",
  },
  forwardTypeText: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  forwardUsername: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  forwardCaption: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  forwardStateCard: {
    width: "100%",
    minHeight: 104,
  },
  forwardUnavailableCard: {
    width: "100%",
    minHeight: 96,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  username: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "800" },
  postMark: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(216,255,114,0.12)",
  },
  postMarkText: { color: colors.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  mediaFrame: {
    width: "100%",
    aspectRatio: 1.12,
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  media: { width: "100%", height: "100%" },
  mediaFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  playMark: {
    position: "absolute",
    alignSelf: "center",
    top: "43%",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  caption: { color: colors.text, fontSize: 11, lineHeight: 16 },
  stateCard: {
    width: 252,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unavailableCard: {
    width: 252,
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unavailableText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
});