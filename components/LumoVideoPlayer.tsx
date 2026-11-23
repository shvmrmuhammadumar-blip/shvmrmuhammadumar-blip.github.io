import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useEvent, useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { createContentSessionKey, trackContentPlayback } from "../lib/studio-analytics";
import { colors } from "../lib/theme";
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


const SPEEDS = [1, 1.5, 2, 0.5];

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Bo'sh joy tepada (masalan, yuqoridagi panel ostida qolmasligi uchun) */
  topInset?: number;
  /** Bo'sh joy pastda */
  bottomInset?: number;
  autoPlay?: boolean;
  muteOnAutoplay?: boolean;
  compact?: boolean;
  onOpenClip?: () => void;
  analytics?: { ownerId: string; contentId: string; contentType?: 'post' | 'story' };
};

export default function LumoVideoPlayer({
  uri,
  style,
  topInset = 0,
  bottomInset = 16,
  autoPlay = false,
  muteOnAutoplay = true,
  compact = false,
  onOpenClip,
  analytics,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const { session } = useAuth();
  const viewerId = session?.user.id ?? '';
  const sessionKeyRef = useRef<string | null>(null);
  if (!sessionKeyRef.current) sessionKeyRef.current = createContentSessionKey();
  const watchedMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const lastPlaybackTickRef = useRef<number | null>(null);
  const lastFlushAtRef = useRef(0);
  const lastPersistedMsRef = useRef(0);
  const lastPersistedCompleteRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const flushQueuedRef = useRef(false);
  const completedRef = useRef(false);
  const flushPlaybackRef = useRef<() => void>(() => {});
  flushPlaybackRef.current = () => {
    if (!analytics || !viewerId || analytics.ownerId === viewerId || !analytics.contentId) return;
    const watchedMs = watchedMsRef.current;
    const completed = completedRef.current;
    const hasNewWatchTime = watchedMs > lastPersistedMsRef.current;
    const hasNewCompletion = completed && !lastPersistedCompleteRef.current;
    if (!hasNewWatchTime && !hasNewCompletion) return;
    if (pendingFlushRef.current) {
      flushQueuedRef.current = true;
      return;
    }
    pendingFlushRef.current = true;
    void trackContentPlayback({
      ownerId: analytics.ownerId,
      viewerId,
      contentId: analytics.contentId,
      contentType: analytics.contentType ?? 'post',
      sessionKey: sessionKeyRef.current ?? createContentSessionKey(),
      watchMs: watchedMs,
      durationMs: durationMsRef.current,
      completed,
    }).then((saved) => {
      if (saved) {
        lastPersistedMsRef.current = Math.max(lastPersistedMsRef.current, watchedMs);
        if (completed) lastPersistedCompleteRef.current = true;
      }
    }).finally(() => {
      pendingFlushRef.current = false;
      if (flushQueuedRef.current) {
        flushQueuedRef.current = false;
        flushPlaybackRef.current();
      }
    });
  };
  useEffect(() => {
    if (!autoPlay) {
      player.pause();
      player.muted = muteOnAutoplay;
      setMuted(muteOnAutoplay);
      return;
    }

    player.muted = muteOnAutoplay;
    setMuted(muteOnAutoplay);

    player.play();
  }, [autoPlay, muteOnAutoplay, player]);
  const [scrub, setScrub] = useState<number | null>(null);
  const barWidth = useRef(1);

  useEventListener(player, "timeUpdate", (e) => {
    if (player.duration > 0) {
      durationMsRef.current = Math.min(3_600_000, Math.round(player.duration * 1000));
      if (e.currentTime >= player.duration - 0.55) completedRef.current = true;
    }
    setTime(e.currentTime);
    if (player.duration > 0) setDuration(player.duration);
  });
  useEventListener(player, "sourceLoad", (e) => {
    if (e.duration > 0) {
      setDuration(e.duration);
      durationMsRef.current = Math.min(3_600_000, Math.round(e.duration * 1000));
    }
  });
  useEffect(() => {
    if (!isPlaying) {
      lastPlaybackTickRef.current = null;
      flushPlaybackRef.current();
      return;
    }

    let previousTick = Date.now();
    lastPlaybackTickRef.current = previousTick;
    lastFlushAtRef.current = previousTick;

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - previousTick;
      previousTick = now;
      lastPlaybackTickRef.current = now;

      if (!player.playing || status !== "readyToPlay") return;
      if (elapsed > 0 && elapsed <= 1500) {
        watchedMsRef.current = Math.min(3_600_000, watchedMsRef.current + elapsed);
      }

      if (player.duration > 0) {
        durationMsRef.current = Math.min(3_600_000, Math.round(player.duration * 1000));
        if (player.currentTime >= player.duration - 0.55) completedRef.current = true;
      }

      if (now - lastFlushAtRef.current >= 5000) {
        lastFlushAtRef.current = now;
        flushPlaybackRef.current();
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      lastPlaybackTickRef.current = null;
    };
  }, [isPlaying, player, status]);
  useEffect(() => () => {
    lastPlaybackTickRef.current = null;
    flushPlaybackRef.current();
  }, []);

  const ratioFrom = (x: number) =>
    Math.max(0, Math.min(1, x / (barWidth.current || 1)));

  const shownTime = scrub != null ? scrub * duration : time;
  const progress =
    scrub != null
      ? scrub
      : duration > 0
        ? Math.min(1, time / duration)
        : 0;

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
      return;
    }
    if (duration > 0 && time >= duration - 0.3) player.currentTime = 0;
    player.play();
  };

  const seekBy = (delta: number) => {
    const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    player.currentTime = Math.max(0, Math.min(max, player.currentTime + delta));
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    player.playbackRate = SPEEDS[next];
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const loading = status === "loading";
  const failed = status === "error";

  return (
    <View style={[lumoStyles.root, { paddingTop: topInset }, style]}>
      <View style={lumoStyles.videoArea}>
        <VideoView
          player={player}
          surfaceType="textureView"
          style={lumoStyles.video}
          nativeControls={false}
          contentFit="contain"
        />

        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onOpenClip ?? togglePlay}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
        />

        {!compact && !isPlaying && !loading && !failed && (
          <View style={lumoStyles.centerOverlay} pointerEvents="none">
            <View style={lumoStyles.bigPlay}>
              <Ionicons
                name="play"
                size={30}
                color={resolveThemeColor("#090C12", "color")}
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>
        )}

        {loading && (
          <View style={lumoStyles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={resolveThemeColor("#B9C7D6", "color")} />
          </View>
        )}

        {failed && (
          <View style={lumoStyles.centerOverlay} pointerEvents="none">
            <Ionicons name="alert-circle-outline" size={34} color={resolveThemeColor("#FF647C", "color")} />
            <Text style={lumoStyles.errorText}>Video ochilmadi</Text>
          </View>
        )}

{compact && (
          <Pressable
            onPress={toggleMute}
            style={({ pressed }) => [
              lumoStyles.compactMuteButton,
              pressed && lumoStyles.pressed,
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute video" : "Mute video"}
          >
            <Ionicons
              name={muted ? "volume-mute" : "volume-high"}
              size={20}
              color={resolveThemeColor("#F2F5F7", "color")}
            />
          </Pressable>
        )}
      </View>

      <View style={[lumoStyles.panel, compact && lumoStyles.compactPanel, { marginBottom: bottomInset }]}>
        <View style={lumoStyles.progressRow}>
          <Text style={lumoStyles.time}>{fmt(shownTime)}</Text>

          <View
            style={lumoStyles.barHit}
            onLayout={(e: LayoutChangeEvent) => {
              barWidth.current = e.nativeEvent.layout.width || 1;
            }}
            onStartShouldSetResponder={() => duration > 0}
            onMoveShouldSetResponder={() => duration > 0}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) =>
              setScrub(ratioFrom(e.nativeEvent.locationX))
            }
            onResponderMove={(e) =>
              setScrub(ratioFrom(e.nativeEvent.locationX))
            }
            onResponderRelease={(e) => {
              const r = ratioFrom(e.nativeEvent.locationX);
              if (duration > 0) {
                player.currentTime = r * duration;
                setTime(r * duration);
              }
              setScrub(null);
            }}
            onResponderTerminate={() => setScrub(null)}
          >
            <View style={lumoStyles.track} pointerEvents="none">
              <View style={[lumoStyles.fill, { width: `${progress * 100}%` }]} />
            </View>
            <View
              pointerEvents="none"
              style={[
                lumoStyles.thumb,
                scrub != null && lumoStyles.thumbActive,
                { left: `${progress * 100}%` },
              ]}
            />
          </View>

          <Text style={lumoStyles.time}>{fmt(duration)}</Text>
        </View>

        <View style={lumoStyles.row}>
          <Pressable
            onPress={cycleSpeed}
            style={({ pressed }) => [lumoStyles.pill, pressed && lumoStyles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Change playback speed"
          >
            <Text style={lumoStyles.pillText}>{SPEEDS[speedIndex]}x</Text>
          </Pressable>

          <View style={lumoStyles.center}>
            <Pressable
              onPress={() => seekBy(-10)}
              style={({ pressed }) => [lumoStyles.side, pressed && lumoStyles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back 10 seconds"
            >
              <Ionicons name="play-back" size={20} color={resolveThemeColor("#F2F5F7", "color")} />
              <Text style={lumoStyles.sideText}>10</Text>
            </Pressable>

            <Pressable
              onPress={togglePlay}
              style={({ pressed }) => [
                lumoStyles.playBtn,
                pressed && lumoStyles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={26}
                color={resolveThemeColor("#090C12", "color")}
                style={!isPlaying ? { marginLeft: 3 } : undefined}
              />
            </Pressable>

            <Pressable
              onPress={() => seekBy(10)}
              style={({ pressed }) => [lumoStyles.side, pressed && lumoStyles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Forward 10 seconds"
            >
              <Ionicons name="play-forward" size={20} color={resolveThemeColor("#F2F5F7", "color")} />
              <Text style={lumoStyles.sideText}>10</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={toggleMute}
            style={({ pressed }) => [lumoStyles.pill, pressed && lumoStyles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute" : "Mute"}
          >
            <Ionicons
              name={muted ? "volume-mute" : "volume-high"}
              size={17}
              color={resolveThemeColor("#B9C7D6", "color")}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#090C12",
    flexDirection: "column",
    overflow: "hidden",
  },
  videoArea: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: colors.mediaBg,
    alignItems: "center",
    justifyContent: "center",
  },
  video: { width: "100%", height: "100%" },
  compactMuteButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(9,12,18,0.78)",
    borderWidth: 1,
    borderColor: "rgba(185,199,214,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  bigPlay: {
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: "rgba(216,255,114,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { color: "#FFC4CF", fontSize: 13, fontWeight: "700" },

  compactPanel: { display: "none" },
  panel: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 14,
    borderRadius: 22,
    gap: 8,
    backgroundColor: "#12161C",
    borderWidth: 1,
    borderColor: "#2B3440",
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  time: {
    color: "#9AA5B2",
    fontSize: 11,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "center",
  },
  barHit: { flex: 1, height: 32, justifyContent: "center" },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#2B3440",
    overflow: "hidden",
  },
  fill: { height: 5, backgroundColor: "#B9C7D6" },
  thumb: {
    position: "absolute",
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#B9C7D6",
  },
  thumbActive: {
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  center: { flexDirection: "row", alignItems: "center", gap: 24 },
  side: { alignItems: "center", justifyContent: "center", minWidth: 36 },
  sideText: { color: "#9AA5B2", fontSize: 9, fontWeight: "800", marginTop: 1 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: "#B9C7D6",
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    minWidth: 46,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: "#1E2717",
    borderWidth: 1,
    borderColor: "#4A5E33",
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { color: "#B9C7D6", fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
