import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioSession,
  AndroidAudioTypePresets,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useTracks,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Avatar from "./Avatar";

type Props = {
  url: string;
  token: string;
  callType: "audio" | "video";
  remoteName: string;
  remoteAvatar: string | null;
  onConnected: () => void;
  onHangup: () => void;
};

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function NativeCallStage({
  callType,
  onHangup,
  remoteName,
  remoteAvatar,
}: Omit<Props, "url" | "token" | "onConnected">) {
  const tracks = useTracks([Track.Source.Camera]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [seconds, setSeconds] = useState(0);
  const [controlBusy, setControlBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleMicrophone = async () => {
    if (controlBusy) return;
    setControlBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setControlBusy(false);
    }
  };

  const toggleCamera = async () => {
    if (controlBusy) return;
    setControlBusy(true);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } finally {
      setControlBusy(false);
    }
  };

  const cameraTracks = tracks.filter(isTrackReference);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.liveBadge}>
          <View style={styles.connectedDot} />
          <Text style={styles.badgeText}>LUMO {callType === "video" ? "VIDEO" : "VOICE"} CALL</Text>
        </View>
        <Text style={styles.duration}>{formatDuration(seconds)}</Text>
      </View>

      <View style={styles.stage}>
        {callType === "video" && cameraTracks.length > 0 ? (
          <View style={styles.videoGrid}>
            {cameraTracks.map((item: TrackReferenceOrPlaceholder, index: number) => {
              if (!isTrackReference(item)) return null;
              const isLocal = item.participant.isLocal;
              return (
                <View
                  key={`${item.participant.identity}:${item.publication.trackSid || index}`}
                  style={[styles.videoTile, isLocal && styles.localTile]}
                >
                  <VideoTrack
                    trackRef={item}
                    style={StyleSheet.absoluteFill}
                    objectFit="cover"
                    mirror={isLocal}
                  />
                  <Text style={styles.videoLabel}>
                    {isLocal ? "You" : item.participant.name || remoteName}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <Avatar uri={remoteAvatar} name={remoteName} size={126} hasStory={false} />
            </View>
            <Text style={styles.remoteName}>{remoteName}</Text>
            <Text style={styles.subTitle}>
              {callType === "video" ? "Camera is waiting to connect" : "Secure audio connection"}
            </Text>
            {callType === "video" ? (
              <ActivityIndicator color="#D8FF72" style={{ marginTop: 16 }} />
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => void toggleMicrophone()}
          disabled={controlBusy}
          style={[styles.control, !isMicrophoneEnabled && styles.controlOff]}
          accessibilityRole="button"
          accessibilityLabel={isMicrophoneEnabled ? "Mute microphone" : "Enable microphone"}
        >
          <Ionicons name={isMicrophoneEnabled ? "mic" : "mic-off"} size={23} color="#FFFFFF" />
          <Text style={styles.controlText}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</Text>
        </Pressable>

        {callType === "video" ? (
          <Pressable
            onPress={() => void toggleCamera()}
            disabled={controlBusy}
            style={[styles.control, !isCameraEnabled && styles.controlOff]}
            accessibilityRole="button"
            accessibilityLabel={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            <Ionicons name={isCameraEnabled ? "videocam" : "videocam-off"} size={23} color="#FFFFFF" />
            <Text style={styles.controlText}>{isCameraEnabled ? "Camera" : "Camera off"}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onHangup}
          style={[styles.control, styles.hangup]}
          accessibilityRole="button"
          accessibilityLabel="End call"
        >
          <Ionicons name="call" size={25} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
          <Text style={styles.controlText}>End</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function DirectCallRoomNative(props: Props) {
  const [connectionError, setConnectionError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ["bluetooth", "headset", "speaker", "earpiece"],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: { defaultOutput: "speaker" },
        });
        await AudioSession.startAudioSession();
        await AudioSession.setDefaultRemoteAudioTrackVolume(1);
      } catch (error) {
        if (active) setConnectionError(error instanceof Error ? error.message : "Audio could not be initialized.");
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
      void AudioSession.stopAudioSession();
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.overlay}>
        <ActivityIndicator color="#D8FF72" size="large" />
        <Text style={styles.loadingText}>Preparing call…</Text>
      </View>
    );
  }

  if (connectionError) {
    return (
      <View style={styles.overlay}>
        <Text style={styles.errorTitle}>Call audio unavailable</Text>
        <Text style={styles.errorText}>{connectionError}</Text>
        <Pressable style={styles.endButton} onPress={props.onHangup}>
          <Text style={styles.endButtonText}>End call</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <LiveKitRoom
        key={props.token}
        serverUrl={props.url}
        token={props.token}
        connect
        audio
        video={props.callType === "video"}
        options={{ adaptiveStream: { pixelDensity: "screen" }, dynacast: true }}
        onConnected={props.onConnected}
        onError={(error) => setConnectionError(error.message)}
      >
        <NativeCallStage
          callType={props.callType}
          remoteName={props.remoteName}
          remoteAvatar={props.remoteAvatar}
          onHangup={props.onHangup}
        />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: "#090C12",
    alignItems: "center",
    justifyContent: "center",
  },
  safe: { flex: 1, width: "100%", backgroundColor: "#090C12", justifyContent: "space-between" },
  header: { width: "100%", paddingHorizontal: 22, paddingTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1A2415", borderWidth: 1, borderColor: "#35452A", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D8FF72" },
  badgeText: { color: "#D8FF72", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  duration: { color: "#E9EDE4", fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  stage: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", padding: 16 },
  videoGrid: { width: "100%", height: "100%", gap: 9, alignItems: "center", justifyContent: "center" },
  videoTile: { width: "100%", maxWidth: 560, flex: 1, borderRadius: 22, backgroundColor: "#171D24", overflow: "hidden" },
  localTile: { flex: 0, width: 150, maxWidth: 150, maxHeight: 210, position: "absolute", right: 12, top: 12, zIndex: 2, borderWidth: 1, borderColor: "#D8FF72" },
  videoLabel: { position: "absolute", left: 10, bottom: 10, color: "#FFFFFF", fontSize: 11, fontWeight: "800", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9 },
  avatarWrap: { alignItems: "center", justifyContent: "center", gap: 12 },
  avatarRing: { padding: 9, borderRadius: 90, backgroundColor: "rgba(216,255,114,0.08)", borderWidth: 1, borderColor: "rgba(216,255,114,0.42)" },
  remoteName: { color: "#F3F5EF", fontSize: 27, fontWeight: "900", marginTop: 10 },
  subTitle: { color: "#9FA99A", fontSize: 13, fontWeight: "600" },
  controls: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 18, paddingBottom: 24 },
  control: { minWidth: 66, height: 66, paddingHorizontal: 12, borderRadius: 22, backgroundColor: "#232A31", borderWidth: 1, borderColor: "#3A444D", alignItems: "center", justifyContent: "center", gap: 4 },
  controlOff: { backgroundColor: "#50303A", borderColor: "#8C4754" },
  controlText: { color: "#E7ECE4", fontSize: 9, fontWeight: "800" },
  hangup: { backgroundColor: "#C93650", borderColor: "#DB6275", minWidth: 72 },
  loadingText: { color: "#F4F6F0", marginTop: 16, fontWeight: "700" },
  errorTitle: { color: "#F4F6F0", fontSize: 20, fontWeight: "900" },
  errorText: { color: "#AAB2A5", marginTop: 10, textAlign: "center", paddingHorizontal: 24 },
  endButton: { marginTop: 22, backgroundColor: "#C93650", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 16 },
  endButtonText: { color: "#FFFFFF", fontWeight: "900" },
});
