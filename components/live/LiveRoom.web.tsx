import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteTrack,
} from 'livekit-client';
import { getLiveConnectionToken, type LiveRole } from '../../lib/live';

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

function TrackTile({ entry }: { entry: TrackEntry }) {
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
    <View style={styles.tile}>
      <div ref={container} className="lumo-live-track" />
      <View style={styles.tileLabel}>
        <Text style={styles.tileName} numberOfLines={1}>
          {entry.local ? 'You' : entry.name || entry.identity}
        </Text>
        {entry.local ? <Text style={styles.localTag}>YOU</Text> : null}
      </View>
    </View>
  );
}

export default function LiveRoomWeb({ sessionId, onConnectionChange }: Props) {
  const roomRef = useRef<Room | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);
  const [role, setRole] = useState<LiveRole>('viewer');
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
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

    const onSubscribed = (track: RemoteTrack, publication: { trackSid: string }, participant: { identity: string; name?: string }) => {
      addTrack(track, participant.identity, participant.name || participant.identity, publication.trackSid, false);
    };
    const onUnsubscribed = (track: RemoteTrack, publication: { trackSid: string }) => {
      setTracks(current => current.filter(item => item.id !== publication.trackSid && item.track !== track));
    };
    const onLocalPublished = (publication: { track?: LocalTrack; trackSid: string }) => {
      if (!publication.track) return;
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
                { trackSid: publication.trackSid },
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
      void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [sessionId, addTrack]);

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

  return (
    <View style={styles.container}>
      <View style={styles.stageHeader}>
        <View style={styles.stageStatus}>
          <View style={styles.liveDot} />
          <Text style={styles.stageStatusText}>{connected ? 'CONNECTED' : connecting ? 'CONNECTING' : 'OFFLINE'}</Text>
        </View>
        <Text style={styles.stageMeta}>{publishable ? 'Your camera is on stage' : 'You are watching'}</Text>
      </View>

      {connecting ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color="#C9D9A4" size="large" />
          <Text style={styles.placeholderTitle}>Entering the live room</Text>
          <Text style={styles.placeholderCopy}>Securely connecting your session</Text>
        </View>
      ) : error ? (
        <View style={styles.placeholder}>
          <Ionicons name="videocam-off-outline" size={34} color="#D8B879" />
          <Text style={styles.placeholderTitle}>Video is not connected</Text>
          <Text style={styles.placeholderCopy}>{error}</Text>
        </View>
      ) : tracks.length ? (
        <View style={styles.trackGrid}>
          {tracks.map(entry => <TrackTile key={entry.id} entry={entry} />)}
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="people-outline" size={34} color="#9AA5B2" />
          <Text style={styles.placeholderTitle}>The stage is ready</Text>
          <Text style={styles.placeholderCopy}>Video appears here when the host or guests turn on their cameras</Text>
        </View>
      )}

      <View style={styles.controls}>
        {publishable ? (
          <>
            <Pressable onPress={() => void toggleMic()} style={[styles.controlButton, !micEnabled && styles.controlDisabled]}>
              <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={18} color="#F2F5F7" />
              <Text style={styles.controlText}>{micEnabled ? 'Mute' : 'Unmute'}</Text>
            </Pressable>
            <Pressable onPress={() => void toggleCamera()} style={[styles.controlButton, !cameraEnabled && styles.controlDisabled]}>
              <Ionicons name={cameraEnabled ? 'videocam' : 'videocam-off'} size={18} color="#F2F5F7" />
              <Text style={styles.controlText}>{cameraEnabled ? 'Camera' : 'Camera off'}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.viewerNote}>Your microphone and camera stay off while watching.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 10 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(232, 85, 92, 0.16)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F16D73' },
  stageStatusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#FFD3D3' },
  stageMeta: { fontSize: 10, color: '#9AA5B2' },
  trackGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', minWidth: 130, height: 205, borderRadius: 17, overflow: 'hidden', backgroundColor: '#171D24', position: 'relative' },
  placeholder: { minHeight: 210, borderRadius: 18, backgroundColor: '#151A21', borderWidth: 1, borderColor: '#2B3440', alignItems: 'center', justifyContent: 'center', padding: 22, gap: 10 },
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
