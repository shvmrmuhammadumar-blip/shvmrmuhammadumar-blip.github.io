import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

type Props = {
  uri?: string | null;
  mine?: boolean;
  onDownload?: () => void;
};

const WAVEFORM = [5, 10, 7, 15, 9, 18, 11, 7, 14, 19, 8, 13, 6, 17, 10, 7, 15, 11, 5, 13, 8, 16, 9, 6];

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function VoiceMessageBubble({ uri, mine = false, onDownload }: Props) {
  const player = useAudioPlayer(uri || null, {
    updateInterval: 250,
    downloadFirst: true,
  });
  const status = useAudioPlayerStatus(player);
  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const accent = mine ? colors.bg : colors.lime;
  const primary = mine ? colors.bg : colors.text;
  const muted = mine ? "rgba(9,12,18,0.62)" : colors.muted;

  const togglePlayback = async () => {
    if (!uri) return;

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: "doNotMix",
      });

      if (status.error) {
        Alert.alert("Audio playback failed", status.error);
        return;
      }

      if (status.playing) {
        player.pause();
        return;
      }

      if (duration > 0 && currentTime >= duration - 0.15) {
        await player.seekTo(0);
      }
      player.play();
    } catch (error) {
      Alert.alert(
        "Audio playback failed",
        error instanceof Error ? error.message : "Lumo could not play this voice message.",
      );
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: mine ? colors.lime : colors.surfaceRaised, borderColor: mine ? colors.lime : colors.border }]}>
      <Pressable
        onPress={() => void togglePlayback()}
        disabled={!uri}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause voice message" : "Play voice message"}
        style={({ pressed }) => [styles.playButton, { backgroundColor: mine ? "rgba(9,12,18,0.12)" : colors.surface }, pressed && styles.pressed]}
      >
        <Ionicons name={status.playing ? "pause" : "play"} size={20} color={accent} />
      </Pressable>

      <View style={styles.track}>
        <View style={styles.waveform}>
          {WAVEFORM.map((height, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: index / WAVEFORM.length <= progress ? primary : muted,
                  opacity: index / WAVEFORM.length <= progress ? 0.95 : 0.58,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.meta}>
          <Text style={[styles.label, { color: primary }]}>
            {status.error ? "Audio unavailable" : status.isLoaded ? "Voice message" : "Loading audio…"}
          </Text>
          <Text style={[styles.duration, { color: muted }]}>
            {formatDuration(currentTime > 0 ? currentTime : duration)}
          </Text>
        </View>
      </View>

      {onDownload && (
        <Pressable
          onPress={onDownload}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Download audio attachment"
          style={styles.downloadButton}
        >
          <Ionicons name="download-outline" size={17} color={primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 252,
    maxWidth: "100%",
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
  playButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  waveform: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
  },
  bar: {
    flex: 1,
    minWidth: 2,
    maxWidth: 4,
    borderRadius: 3,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
  duration: {
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  downloadButton: {
    width: 26,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
});
