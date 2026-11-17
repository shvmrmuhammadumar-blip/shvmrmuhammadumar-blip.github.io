import React from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../lib/theme";

type MediaType = "image" | "video" | "audio" | "file";

type Props = {
  type: MediaType;
  uri?: string | null;
  fileName?: string | null;
  fileAction?: string;
  mine?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

function InlineVideo({
  uri,
  onExpand,
}: {
  uri: string;
  onExpand?: () => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <View style={styles.videoFrame}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
      />

      {onExpand && (
        <Pressable
          onPress={onExpand}
          style={styles.videoExpand}
          accessibilityRole="button"
          accessibilityLabel="Open video viewer"
          hitSlop={5}
        >
          <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

export default function ChatMediaAttachment({
  type,
  uri,
  fileName,
  fileAction,
  mine = false,
  onPress,
  onLongPress,
}: Props) {
  if (type === "image") {
    if (!uri) {
      return (
        <Pressable
          style={styles.unavailable}
          onPress={onPress}
          onLongPress={onLongPress}
          disabled={!onPress}
        >
          <Ionicons name="image-outline" size={20} color={colors.muted} />
          <Text style={styles.unavailableText}>Attachment unavailable</Text>
        </Pressable>
      );
    }

    const content = (
      <>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          transition={180}
        />
        {onPress && (
          <View style={styles.photoExpandBadge} pointerEvents="none">
            <Ionicons name="expand-outline" size={13} color="#FFFFFF" />
          </View>
        )}
      </>
    );

    return onPress ? (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.imageFrame}
        accessibilityRole="button"
        accessibilityLabel="Open photo attachment"
      >
        {content}
      </Pressable>
    ) : (
      <View style={styles.imageFrame}>{content}</View>
    );
  }

  if (type === "video") {
    return uri ? (
      <InlineVideo uri={uri} onExpand={onPress} />
    ) : (
      <Pressable
        style={styles.unavailable}
        onPress={onPress}
        disabled={!onPress}
      >
        <Ionicons name="videocam-outline" size={20} color={colors.muted} />
        <Text style={styles.unavailableText}>Video unavailable</Text>
      </Pressable>
    );
  }

  const resolvedName =
    fileName || (type === "audio" ? "Audio attachment" : "File attachment");

  return (
    <Pressable
      style={styles.fileCard}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${resolvedName}`}
    >
      <View style={styles.fileIcon}>
        <Ionicons
          name={type === "audio" ? "musical-notes-outline" : "document-outline"}
          size={21}
          color={colors.lime}
        />
      </View>

      <View style={styles.fileDetails}>
        <Text
          style={[styles.fileName, mine && styles.ownText]}
          numberOfLines={2}
        >
          {resolvedName}
        </Text>
        <Text style={[styles.fileAction, mine && styles.ownAction]}>
          {fileAction ||
            (type === "audio"
              ? "AUDIO · TAP TO OPEN"
              : "FILE · TAP TO OPEN")}
        </Text>
      </View>

      <Ionicons
        name="download-outline"
        size={19}
        color={mine ? colors.bg : colors.lime}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageFrame: {
    width: 244,
    maxWidth: "100%",
    aspectRatio: 1,
    alignSelf: "flex-start",
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.bg,
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
    backgroundColor: "rgba(8,10,8,0.74)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  videoFrame: {
    width: 244,
    maxWidth: "100%",
    aspectRatio: 1.47,
    alignSelf: "flex-start",
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  videoExpand: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,10,8,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  unavailable: {
    width: 244,
    maxWidth: "100%",
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unavailableText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  fileCard: {
    width: 244,
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignSelf: "flex-start",
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDark,
  },
  fileDetails: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  fileName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  fileAction: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  ownText: {
    color: colors.bg,
  },
  ownAction: {
    color: "#39452A",
  },
});