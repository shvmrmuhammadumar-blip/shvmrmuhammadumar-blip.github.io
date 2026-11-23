import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteTrack,
} from "livekit-client";
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

type TrackEntry = {
  id: string;
  track: LocalTrack | RemoteTrack;
  local: boolean;
  name: string;
};

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function WebVideoTile({ entry }: { entry: TrackEntry }) {
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const element = entry.track.attach();
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.objectFit = "cover";
    if (element instanceof HTMLVideoElement) {
      element.autoplay = true;
      element.playsInline = true;
      element.muted = entry.local;
    }
    root.appendChild(element);
    return () => {
      entry.track.detach(element);
      element.remove();
    };
  }, [entry.track]);

  return (
    <View style={[styles.videoTile, entry.local && styles.localTile]}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <Text style={styles.videoLabel}>{entry.local ? "You" : entry.name}</Text>
    </View>
  );
}

export default function DirectCallRoomWeb(props: Props) {
  const roomRef = useRef<Room | null>(null);
  const audioRootRef = useRef<HTMLDivElement | null>(null);
  const audioElementsRef = useRef<Map<string, { track: RemoteTrack; element: HTMLAudioElement }>>(new Map());
  const onConnectedRef = useRef(props.onConnected);
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(props.callType === "video");
  const [controlBusy, setControlBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    onConnectedRef.current = props.onConnected;
  }, [props.onConnected]);

  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  const addVideoTrack = useCallback((
    track: LocalTrack | RemoteTrack,
    identity: string,
    name: string,
    local: boolean,
  ) => {
    setTracks((current) => {
      const id = track.sid || `${identity}-${local ? "local" : "remote"}`;
      if (current.some((entry) => entry.id === id)) return current;
      return [...current, { id, track, local, name: local ? "You" : name }];
    });
  }, []);

  useEffect(() => {
    let active = true;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
    });
    roomRef.current = room;

    const attachSubscribedTrack = (
      track: RemoteTrack,
      publication: { trackSid: string; source?: Track.Source },
      participant: { identity: string; name?: string },
    ) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach() as HTMLAudioElement;
        element.autoplay = true;
        element.muted = false;
        element.volume = 1;
        element.style.display = "none";
        audioRootRef.current?.appendChild(element);
        audioElementsRef.current.set(publication.trackSid, { track, element });
        void element.play()
          .then(() => { if (active) setAudioBlocked(false); })
          .catch(() => { if (active) setAudioBlocked(true); });
        return;
      }
      if (track.kind !== Track.Kind.Video || publication.source !== Track.Source.Camera) return;
      addVideoTrack(track, participant.identity, participant.name || participant.identity, false);
    };

    const onUnsubscribed = (track: RemoteTrack, publication: { trackSid: string }) => {
      const audio = audioElementsRef.current.get(publication.trackSid);
      if (audio) {
        audio.track.detach(audio.element);
        audio.element.remove();
        audioElementsRef.current.delete(publication.trackSid);
      }
      setTracks((current) => current.filter((entry) => entry.id !== publication.trackSid && entry.track !== track));
    };

    const onLocalPublished = (publication: { track?: LocalTrack; trackSid: string; source?: Track.Source }) => {
      if (!publication.track || publication.track.kind !== Track.Kind.Video || publication.source !== Track.Source.Camera) return;
      const participant = room.localParticipant;
      addVideoTrack(publication.track, participant.identity, participant.name || "You", true);
    };

    room
      .on(RoomEvent.TrackSubscribed, attachSubscribedTrack)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        setTracks((current) => current.filter((entry) => entry.id !== publication.trackSid));
      })
      .on(RoomEvent.Disconnected, () => {
        if (active) setConnected(false);
      });

    void (async () => {
      try {
        setConnecting(true);
        setError("");
        await room.connect(props.url, props.token);
        if (!active) {
          await room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (props.callType === "video") {
          await room.localParticipant.setCameraEnabled(true);
          const camera = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camera?.track) {
            addVideoTrack(camera.track as LocalTrack, room.localParticipant.identity, "You", true);
          }
        }
        setMicEnabled(true);
        setCameraEnabled(props.callType === "video");
        setConnected(true);
        onConnectedRef.current();

        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((publication) => {
            if (publication.track) {
              attachSubscribedTrack(
                publication.track as RemoteTrack,
                { trackSid: publication.trackSid, source: publication.source },
                participant,
              );
            }
          });
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not connect this call.");
      } finally {
        if (active) setConnecting(false);
      }
    })();

    return () => {
      active = false;
      room.removeAllListeners();
      audioElementsRef.current.forEach(({ track, element }) => {
        track.detach(element);
        element.remove();
      });
      audioElementsRef.current.clear();
      void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [props.url, props.token, props.callType, addVideoTrack]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room || controlBusy) return;
    setControlBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(!micEnabled);
      setMicEnabled((value) => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Microphone could not be changed.");
    } finally {
      setControlBusy(false);
    }
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room || props.callType !== "video" || controlBusy) return;
    setControlBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(!cameraEnabled);
      setCameraEnabled((value) => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Camera could not be changed.");
    } finally {
      setControlBusy(false);
    }
  };

  const enableRemoteAudio = async () => {
    let blocked = false;
    await Promise.all([...audioElementsRef.current.values()].map(async ({ element }) => {
      try {
        element.muted = false;
        await element.play();
      } catch {
        blocked = true;
      }
    }));
    setAudioBlocked(blocked);
  };

  return (
    <View style={styles.overlay}>
      <div ref={audioRootRef} aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }} />
      <View style={styles.header}>
        <View style={styles.liveBadge}>
          <View style={[styles.dot, connected && styles.dotActive]} />
          <Text style={styles.badgeText}>{props.callType === "video" ? "LUMO VIDEO CALL" : "LUMO VOICE CALL"}</Text>
        </View>
        <Text style={styles.duration}>{connected ? formatDuration(seconds) : "Connecting…"}</Text>
      </View>

      {audioBlocked ? (
        <Pressable onPress={() => void enableRemoteAudio()} style={styles.enableAudio}>
          <Ionicons name="volume-high-outline" size={16} color="#081009" />
          <Text style={styles.enableAudioText}>Enable sound</Text>
        </Pressable>
      ) : null}

      <View style={styles.stage}>
        {props.callType === "video" && tracks.length > 0 ? (
          <View style={styles.videoGrid}>
            {tracks.map((entry) => <WebVideoTile key={entry.id} entry={entry} />)}
          </View>
        ) : (
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <Avatar uri={props.remoteAvatar} name={props.remoteName} size={126} hasStory={false} />
            </View>
            <Text style={styles.remoteName}>{props.remoteName}</Text>
            <Text style={styles.subTitle}>
              {connecting ? "Connecting securely…" : error || (props.callType === "video" ? "Waiting for camera…" : "Secure audio connection")}
            </Text>
            {connecting ? <ActivityIndicator color="#D8FF72" style={{ marginTop: 16 }} /> : null}
          </View>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.controls}>
        <Pressable onPress={() => void toggleMic()} disabled={!connected || controlBusy} style={[styles.control, !micEnabled && styles.controlOff]}>
          <Ionicons name={micEnabled ? "mic" : "mic-off"} size={23} color="#FFFFFF" />
          <Text style={styles.controlText}>{micEnabled ? "Mute" : "Unmute"}</Text>
        </Pressable>
        {props.callType === "video" ? (
          <Pressable onPress={() => void toggleCamera()} disabled={!connected || controlBusy} style={[styles.control, !cameraEnabled && styles.controlOff]}>
            <Ionicons name={cameraEnabled ? "videocam" : "videocam-off"} size={23} color="#FFFFFF" />
            <Text style={styles.controlText}>{cameraEnabled ? "Camera" : "Camera off"}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={props.onHangup} style={[styles.control, styles.hangup]}>
          <Ionicons name="call" size={25} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
          <Text style={styles.controlText}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10000, backgroundColor: "#090C12", alignItems: "center", justifyContent: "space-between", paddingVertical: 26, paddingHorizontal: 20 },
  header: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1A2415", borderWidth: 1, borderColor: "#35452A", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#E6B85C" },
  dotActive: { backgroundColor: "#D8FF72" },
  badgeText: { color: "#D8FF72", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  duration: { color: "#E9EDE4", fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  enableAudio: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#D8FF72", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  enableAudioText: { color: "#081009", fontSize: 10, fontWeight: "900" },
  stage: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", padding: 10 },
  videoGrid: { width: "100%", height: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 10 },
  videoTile: { width: "48%", minWidth: 220, maxWidth: 580, height: "80%", maxHeight: 640, borderRadius: 22, backgroundColor: "#171D24", overflow: "hidden", position: "relative" },
  localTile: { width: 160, height: 210, minWidth: 0, position: "absolute", right: 12, top: 12, zIndex: 2, borderWidth: 1, borderColor: "#D8FF72" },
  videoLabel: { position: "absolute", left: 10, bottom: 10, color: "#FFFFFF", fontSize: 11, fontWeight: "800", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9 },
  avatarWrap: { alignItems: "center", justifyContent: "center", gap: 12 },
  avatarRing: { padding: 9, borderRadius: 90, backgroundColor: "rgba(216,255,114,0.08)", borderWidth: 1, borderColor: "rgba(216,255,114,0.42)" },
  remoteName: { color: "#F3F5EF", fontSize: 27, fontWeight: "900", marginTop: 10 },
  subTitle: { color: "#9FA99A", fontSize: 13, fontWeight: "600", textAlign: "center" },
  errorText: { color: "#FF98A5", fontSize: 11, textAlign: "center", maxWidth: 520 },
  controls: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 10, paddingBottom: 8 },
  control: { minWidth: 66, height: 66, paddingHorizontal: 12, borderRadius: 22, backgroundColor: "#232A31", borderWidth: 1, borderColor: "#3A444D", alignItems: "center", justifyContent: "center", gap: 4 },
  controlOff: { backgroundColor: "#50303A", borderColor: "#8C4754" },
  controlText: { color: "#E7ECE4", fontSize: 9, fontWeight: "800" },
  hangup: { backgroundColor: "#C93650", borderColor: "#DB6275", minWidth: 72 },
});
