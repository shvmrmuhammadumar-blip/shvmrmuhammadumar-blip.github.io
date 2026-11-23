import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteTrack,
} from 'livekit-client';
import { getLiveConnectionToken, type LiveRole } from '../../lib/live';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


type TrackEntry = {
  id: string;
  identity: string;
  name: string;
  track: LocalTrack | RemoteTrack;
  local: boolean;
};

type Props = {
  sessionId: string;
  onConnectionChange?: (connected: boolean) => void;
};

function TrackTile({ entry, single = false }: { entry: TrackEntry; single?: boolean }) {
  const lumoStyles = useThemedStyles(styles);
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const element = entry.track.attach();
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.objectFit = 'cover';
    if (element instanceof HTMLVideoElement) {
      element.autoplay = true;
      element.playsInline = true;
      element.muted = entry.local;
    } else if (element instanceof HTMLAudioElement) {
      element.autoplay = true;
      element.controls = false;
      element.style.display = 'none';
    }
    container.current.appendChild(element);

    return () => {
      entry.track.detach(element);
      element.remove();
    };
  }, [entry.track]);

  return (
    <View style={[lumoStyles.tile, single && lumoStyles.singleTile]}>
      <div ref={container} className="lumo-live-track" />
      <View style={lumoStyles.tileLabel}>
        <Text style={lumoStyles.tileName} numberOfLines={1}>
          {entry.local ? 'You' : entry.name || entry.identity}
        </Text>
        {entry.local ? <Text style={lumoStyles.localTag}>YOU</Text> : null}
      </View>
    </View>
  );
}

export default function LiveRoomWeb({ sessionId, onConnectionChange }: Props) {
  const lumoStyles = useThemedStyles(styles);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const audioElementsRef = useRef<Map<string, { track: RemoteTrack; element: HTMLAudioElement }>>(new Map());
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);
  const [role, setRole] = useState<LiveRole>('viewer');
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTrack = useCallback((track: LocalTrack | RemoteTrack, identity: string, name: string, sid: string, local: boolean) => {
    setTracks(current => {
      if (current.some(item => item.id === sid)) return current;
      return [...current, { id: sid, identity, name, track, local }];
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

    const onSubscribed = (track: RemoteTrack, publication: { trackSid: string; source?: Track.Source }, participant: { identity: string; name?: string }) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach() as HTMLAudioElement;
        element.autoplay = true;
        element.muted = false;
        element.volume = 1;
        element.style.display = 'none';
        audioContainerRef.current?.appendChild(element);
        audioElementsRef.current.set(publication.trackSid, { track, element });
        void element.play()
          .then(() => { if (active) setAudioBlocked(false); })
          .catch(() => { if (active) setAudioBlocked(true); });
        return;
      }
      if (track.kind !== Track.Kind.Video || publication.source !== Track.Source.Camera) return;
      addTrack(track, participant.identity, participant.name || participant.identity, publication.trackSid, false);
    };
    const onUnsubscribed = (track: RemoteTrack, publication: { trackSid: string }) => {
      const audioEntry = audioElementsRef.current.get(publication.trackSid);
      if (audioEntry) {
        audioEntry.track.detach(audioEntry.element);
        audioEntry.element.remove();
        audioElementsRef.current.delete(publication.trackSid);
      }
      setTracks(current => current.filter(item => item.id !== publication.trackSid && item.track !== track));
    };
    const onLocalPublished = (publication: { track?: LocalTrack; trackSid: string; source?: Track.Source }) => {
      if (!publication.track || publication.track.kind !== Track.Kind.Video || publication.source !== Track.Source.Camera) return;
      const local = room.localParticipant;
      addTrack(publication.track, local.identity, local.name || 'You', publication.trackSid, true);
    };
    const onLocalUnpublished = (publication: { trackSid: string }) => {
      setTracks(current => current.filter(item => item.id !== publication.trackSid));
    };

    room
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
      .on(RoomEvent.Disconnected, () => {
        if (!active) return;
        setConnected(false);
        onConnectionChangeRef.current?.(false);
      });

    const connect = async () => {
      try {
        setConnecting(true);
        setError(null);
        const credentials = await getLiveConnectionToken(sessionId);
        if (!active) return;
        setRole(credentials.role);
        await room.connect(credentials.url, credentials.token);
        if (!active) {
          await room.disconnect();
          return;
        }

        if (credentials.role === 'host' || credentials.role === 'guest') {
          await room.localParticipant.enableCameraAndMicrophone();
          const camera = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camera?.track) {
            addTrack(camera.track as LocalTrack, room.localParticipant.identity, 'You', camera.trackSid, true);
          }
          setCameraEnabled(true);
          setMicEnabled(true);
        }

        setConnected(true);
        onConnectionChangeRef.current?.(true);

        room.remoteParticipants.forEach(participant => {
          participant.trackPublications.forEach(publication => {
            if (publication.track) {
              onSubscribed(
                publication.track as RemoteTrack,
                { trackSid: publication.trackSid, source: publication.source },
                participant,
              );
            }
          });
        });
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not connect to this live.');
          setConnected(false);
          onConnectionChangeRef.current?.(false);
        }
      } finally {
        if (active) setConnecting(false);
      }
    };

    void connect();

    return () => {
      active = false;
      onConnectionChangeRef.current?.(false);
      room.removeAllListeners();
      audioElementsRef.current.forEach(({ track, element }) => {
        track.detach(element);
        element.remove();
      });
      audioElementsRef.current.clear();
      void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [sessionId, addTrack]);

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

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room || role === 'viewer') return;
    try {
      await room.localParticipant.setCameraEnabled(!cameraEnabled);
      setCameraEnabled(value => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Camera could not be changed.');
    }
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room || role === 'viewer') return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!micEnabled);
      setMicEnabled(value => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Microphone could not be changed.');
    }
  };

  const publishable = role === 'host' || role === 'guest';

  const renderTracks = (isFullscreen = false) => (
    <View style={[
      lumoStyles.trackGrid,
      tracks.length === 1 && lumoStyles.singleTrackGrid,
      isFullscreen && lumoStyles.fullscreenTrackGrid,
    ]}>
      {tracks.map(entry => (
        <TrackTile key={entry.id} entry={entry} single={tracks.length === 1} />
      ))}
    </View>
  );

  const renderStageContent = (isFullscreen = false) => connecting ? (
    <View style={lumoStyles.placeholder}>
      <ActivityIndicator color={resolveThemeColor("#C9D9A4", "color")} size="large" />
      <Text style={lumoStyles.placeholderTitle}>Entering the live room</Text>
      <Text style={lumoStyles.placeholderCopy}>Securely connecting your session</Text>
    </View>
  ) : error ? (
    <View style={lumoStyles.placeholder}>
      <Ionicons name="videocam-off-outline" size={34} color={resolveThemeColor("#D8B879", "color")} />
      <Text style={lumoStyles.placeholderTitle}>Video is not connected</Text>
      <Text style={lumoStyles.placeholderCopy}>{error}</Text>
    </View>
  ) : tracks.length ? renderTracks(isFullscreen) : (
    <View style={lumoStyles.placeholder}>
      <Ionicons name="people-outline" size={34} color={resolveThemeColor("#9AA5B2", "color")} />
      <Text style={lumoStyles.placeholderTitle}>The stage is ready</Text>
      <Text style={lumoStyles.placeholderCopy}>Video appears here when the host or guests turn on their cameras</Text>
    </View>
  );

  const renderControls = () => (
    <View style={lumoStyles.controls}>
      {publishable ? (
        <>
          <Pressable onPress={() => void toggleMic()} style={[lumoStyles.controlButton, !micEnabled && lumoStyles.controlDisabled]}>
            <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={18} color={resolveThemeColor("#F2F5F7", "color")} />
            <Text style={lumoStyles.controlText}>{micEnabled ? 'Mute' : 'Unmute'}</Text>
          </Pressable>
          <Pressable onPress={() => void toggleCamera()} style={[lumoStyles.controlButton, !cameraEnabled && lumoStyles.controlDisabled]}>
            <Ionicons name={cameraEnabled ? 'videocam' : 'videocam-off'} size={18} color={resolveThemeColor("#F2F5F7", "color")} />
            <Text style={lumoStyles.controlText}>{cameraEnabled ? 'Camera' : 'Camera off'}</Text>
          </Pressable>
        </>
      ) : (
        <Text style={lumoStyles.viewerNote}>Your microphone and camera stay off while watching.</Text>
      )}
    </View>
  );

  return (
    <>
      <View style={lumoStyles.container}>
        <div ref={audioContainerRef} aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }} />
        <View style={lumoStyles.stageHeader}>
          <View style={lumoStyles.stageStatus}>
            <View style={lumoStyles.liveDot} />
            <Text style={lumoStyles.stageStatusText}>{connected ? 'CONNECTED' : connecting ? 'CONNECTING' : 'OFFLINE'}</Text>
          </View>
          {audioBlocked ? (
            <Pressable onPress={() => void enableRemoteAudio()} style={lumoStyles.audioEnableButton} accessibilityRole="button" accessibilityLabel="Enable live audio">
              <Ionicons name="volume-high-outline" size={15} color={resolveThemeColor("#11161C", "color")} />
              <Text style={lumoStyles.audioEnableText}>Enable sound</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setFullscreen(true)}
            style={lumoStyles.fullscreenButton}
            accessibilityRole="button"
            accessibilityLabel="Open full screen live"
          >
            <Ionicons name="expand-outline" size={18} color={resolveThemeColor("#F2F5F7", "color")} />
          </Pressable>
        </View>

        {!fullscreen ? renderStageContent() : null}
        {!fullscreen ? renderControls() : null}
      </View>

      {fullscreen ? (
        <Modal visible animationType="fade" onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
          <View style={lumoStyles.fullscreenContainer}>
            <View style={lumoStyles.fullscreenHeader}>
              <View style={lumoStyles.stageStatus}>
                <View style={lumoStyles.liveDot} />
                <Text style={lumoStyles.stageStatusText}>LUMO LIVE</Text>
              </View>
              <Pressable
                onPress={() => setFullscreen(false)}
                style={lumoStyles.fullscreenButton}
                accessibilityRole="button"
                accessibilityLabel="Exit full screen live"
              >
                <Ionicons name="contract-outline" size={19} color={resolveThemeColor("#F2F5F7", "color")} />
              </Pressable>
            </View>

            <View style={lumoStyles.fullscreenStage}>{renderStageContent(true)}</View>
            {renderControls()}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 10 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  fullscreenButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#202831', borderWidth: 1, borderColor: '#39434D', alignItems: 'center', justifyContent: 'center' },
  audioEnableButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#B9C7D6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  audioEnableText: { color: '#090C12', fontSize: 9, fontWeight: '900' },
  stageStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(232, 85, 92, 0.16)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F16D73' },
  stageStatusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#FFD3D3' },
  stageMeta: { fontSize: 10, color: '#9AA5B2' },
  trackGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', justifyContent: 'center' },
  singleTrackGrid: { alignItems: 'center' },
  fullscreenTrackGrid: { flex: 1, alignItems: 'center', justifyContent: 'center', alignContent: 'center' },
  tile: { width: '48%', minWidth: 0, maxWidth: '100%', aspectRatio: 1, borderRadius: 17, overflow: 'hidden', backgroundColor: '#171D24', position: 'relative' },
  singleTile: { width: '100%', maxWidth: 560 },
  fullscreenContainer: { flex: 1, backgroundColor: '#05070B', paddingHorizontal: 14, paddingTop: 34, paddingBottom: 26 },
  fullscreenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullscreenStage: { flex: 1, justifyContent: 'center', paddingVertical: 14 },
  placeholder: { width: '100%', maxWidth: 560, aspectRatio: 1, alignSelf: 'center', borderRadius: 18, backgroundColor: '#151A21', borderWidth: 1, borderColor: '#2B3440', alignItems: 'center', justifyContent: 'center', padding: 22, gap: 10 },
  placeholderTitle: { color: '#F2F5F7', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  placeholderCopy: { color: '#9AA5B2', fontSize: 11, textAlign: 'center', lineHeight: 16 },
  tileLabel: { position: 'absolute', left: 9, right: 9, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(7,10,14,0.72)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  tileName: { color: '#F2F5F7', fontSize: 10, fontWeight: '800', flex: 1 },
  localTag: { color: '#D6E3B4', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 10, alignItems: 'center' },
  controlButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#202831', borderWidth: 1, borderColor: '#39434D', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  controlDisabled: { backgroundColor: '#3A292C', borderColor: '#6D3B43' },
  controlText: { color: '#F2F5F7', fontSize: 10, fontWeight: '800' },
  viewerNote: { color: '#9AA5B2', fontSize: 10, textAlign: 'center' },
});
