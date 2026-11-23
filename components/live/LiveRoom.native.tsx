import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioSession,
  AndroidAudioTypePresets,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { getLiveConnectionToken, type LiveRole } from '../../lib/live';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


type Props = {
  sessionId: string;
  onConnectionChange?: (connected: boolean) => void;
};

function NativeLiveStage({ role, onStageReady }: { role: LiveRole; onStageReady?: () => void }) {
  const lumoStyles = useThemedStyles(styles);
  const tracks = useTracks([Track.Source.Camera]);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const [fullscreen, setFullscreen] = useState(false);
  const publishable = role === 'host' || role === 'guest';

  useEffect(() => {
    if (publishable && isCameraEnabled && isMicrophoneEnabled) onStageReady?.();
  }, [publishable, isCameraEnabled, isMicrophoneEnabled, onStageReady]);

  const renderTrack = ({ item }: { item: TrackReferenceOrPlaceholder }) => {
    if (!isTrackReference(item)) return null;
    return (
      <View style={[lumoStyles.videoTile, tracks.length === 1 && lumoStyles.singleVideoTile]}>
        <VideoTrack
          trackRef={item}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          objectFit="cover"
          mirror={false}
        />
        <View style={lumoStyles.videoLabel}>
          <Text style={lumoStyles.videoLabelText} numberOfLines={1}>
            {item.participant.isLocal ? 'You' : item.participant.name || item.participant.identity}
          </Text>
          {item.participant.isLocal ? <Text style={lumoStyles.youTag}>YOU</Text> : null}
        </View>
      </View>
    );
  };

  const renderGrid = (isFullscreen = false) => (
    <FlatList
      key={tracks.length > 1 ? 'live-grid-two-columns' : 'live-grid-one-column'}
      data={tracks}
      renderItem={renderTrack}
      keyExtractor={(item, index) => isTrackReference(item) ? `${item.participant.identity}:${item.publication.trackSid}` : `empty-${index}`}
      numColumns={tracks.length > 1 ? 2 : 1}
      columnWrapperStyle={tracks.length > 1 ? lumoStyles.videoRow : undefined}
      contentContainerStyle={[
        lumoStyles.videoGrid,
        tracks.length === 1 && lumoStyles.singleVideoGrid,
        isFullscreen && lumoStyles.fullscreenVideoGrid,
      ]}
    />
  );

  const renderControls = () => publishable ? (
    <View style={lumoStyles.controls}>
      <Pressable
        onPress={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        style={[lumoStyles.controlButton, !isMicrophoneEnabled && lumoStyles.controlDisabled]}
      >
        <Ionicons name={isMicrophoneEnabled ? 'mic' : 'mic-off'} size={19} color={resolveThemeColor("#F2F5F7", "color")} />
        <Text style={lumoStyles.controlText}>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</Text>
      </Pressable>
      <Pressable
        onPress={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}
        style={[lumoStyles.controlButton, !isCameraEnabled && lumoStyles.controlDisabled]}
      >
        <Ionicons name={isCameraEnabled ? 'videocam' : 'videocam-off'} size={19} color={resolveThemeColor("#F2F5F7", "color")} />
        <Text style={lumoStyles.controlText}>{isCameraEnabled ? 'Camera' : 'Camera off'}</Text>
      </Pressable>
    </View>
  ) : (
    <Text style={lumoStyles.viewerNote}>Your microphone and camera stay off while watching.</Text>
  );

  return (
    <>
      <View style={lumoStyles.stageBody}>
        <View style={lumoStyles.stageHeader}>
          <View style={lumoStyles.stageStatus}>
            <View style={lumoStyles.liveDot} />
            <Text style={lumoStyles.stageStatusText}>LIVE STAGE</Text>
          </View>
          <Pressable
            onPress={() => setFullscreen(true)}
            style={lumoStyles.fullscreenButton}
            accessibilityRole="button"
            accessibilityLabel="Open full screen live"
          >
            <Ionicons name="expand-outline" size={18} color={resolveThemeColor("#F2F5F7", "color")} />
          </Pressable>
        </View>

        {!fullscreen ? (
          tracks.length ? renderGrid() : (
            <View style={lumoStyles.placeholder}>
              <Ionicons name="people-outline" size={34} color={resolveThemeColor("#9AA5B2", "color")} />
              <Text style={lumoStyles.placeholderTitle}>The stage is ready</Text>
              <Text style={lumoStyles.placeholderCopy}>Video appears here when the host or guests turn on their cameras</Text>
            </View>
          )
        ) : null}

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

            <View style={lumoStyles.fullscreenStage}>
              {tracks.length ? renderGrid(true) : (
                <View style={lumoStyles.placeholder}>
                  <Ionicons name="people-outline" size={34} color={resolveThemeColor("#9AA5B2", "color")} />
                  <Text style={lumoStyles.placeholderTitle}>The stage is ready</Text>
                  <Text style={lumoStyles.placeholderCopy}>Video appears here when the host or guests turn on their cameras</Text>
                </View>
              )}
            </View>

            {renderControls()}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

export default function LiveRoomNative({ sessionId, onConnectionChange }: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [connection, setConnection] = useState<{ url: string; token: string; role: LiveRole } | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    let active = true;
    const connect = async () => {
      try {
        setConnecting(true);
        setError(null);
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: { defaultOutput: 'speaker' },
        });
        await AudioSession.startAudioSession();
        await AudioSession.setDefaultRemoteAudioTrackVolume(1);
        const credentials = await getLiveConnectionToken(sessionId);
        if (active) setConnection(credentials);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not connect to this live.');
      } finally {
        if (active) setConnecting(false);
      }
    };
    void connect();

    return () => {
      active = false;
      onConnectionChangeRef.current?.(false);
      void AudioSession.stopAudioSession();
    };
  }, [sessionId]);

  if (connecting) {
    return (
      <View style={lumoStyles.placeholder}>
        <ActivityIndicator color={resolveThemeColor("#C9D9A4", "color")} size="large" />
        <Text style={lumoStyles.placeholderTitle}>Entering the live room</Text>
        <Text style={lumoStyles.placeholderCopy}>Securely connecting your session</Text>
      </View>
    );
  }

  if (error || !connection) {
    return (
      <View style={lumoStyles.placeholder}>
        <Ionicons name="videocam-off-outline" size={34} color={resolveThemeColor("#D8B879", "color")} />
        <Text style={lumoStyles.placeholderTitle}>Video is not connected</Text>
        <Text style={lumoStyles.placeholderCopy}>{error || 'Live connection is unavailable.'}</Text>
      </View>
    );
  }

  const publishable = connection.role === 'host' || connection.role === 'guest';

  return (
    <View style={lumoStyles.container}>
      <View style={lumoStyles.stageHeader}>
        <View style={lumoStyles.stageStatus}>
          <View style={lumoStyles.liveDot} />
          <Text style={lumoStyles.stageStatusText}>LIVE CONNECTION</Text>
        </View>
        <Text style={lumoStyles.stageMeta}>{publishable ? 'Your camera is on stage' : 'You are watching'}</Text>
      </View>
      <LiveKitRoom
        key={sessionId}
        serverUrl={connection.url}
        token={connection.token}
        connect
        audio={publishable}
        video={publishable}
        options={{ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }}
        onConnected={() => {
          if (!publishable) onConnectionChangeRef.current?.(true);
        }}
        onDisconnected={() => onConnectionChangeRef.current?.(false)}
        onError={(roomError) => {
          setError(roomError.message);
          onConnectionChangeRef.current?.(false);
        }}
      >
        <NativeLiveStage
          role={connection.role}
          onStageReady={() => onConnectionChangeRef.current?.(true)}
        />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 10 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  fullscreenButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#202831', borderWidth: 1, borderColor: '#39434D', alignItems: 'center', justifyContent: 'center' },
  stageStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(232, 85, 92, 0.16)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F16D73' },
  stageStatusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#FFD3D3' },
  stageMeta: { fontSize: 10, color: '#9AA5B2' },
  stageBody: { width: '100%', gap: 12 },
  videoGrid: { gap: 8, width: '100%', flexGrow: 1 },
  singleVideoGrid: { alignItems: 'center' },
  fullscreenVideoGrid: { justifyContent: 'center', alignItems: 'center' },
  videoRow: { gap: 8, width: '100%' },
  videoTile: { flex: 1, minWidth: 0, aspectRatio: 1, borderRadius: 17, overflow: 'hidden', backgroundColor: '#171D24', position: 'relative' },
  singleVideoTile: { flex: 0, width: '100%', maxWidth: 560, alignSelf: 'center' },
  fullscreenContainer: { flex: 1, backgroundColor: '#05070B', paddingHorizontal: 14, paddingTop: 34, paddingBottom: 26 },
  fullscreenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullscreenStage: { flex: 1, justifyContent: 'center', paddingVertical: 14 },
  videoLabel: { position: 'absolute', left: 9, right: 9, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(7,10,14,0.72)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  videoLabelText: { color: '#F2F5F7', fontSize: 10, fontWeight: '800', flex: 1 },
  youTag: { color: '#D6E3B4', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  placeholder: { width: '100%', maxWidth: 560, aspectRatio: 1, alignSelf: 'center', borderRadius: 18, backgroundColor: '#151A21', borderWidth: 1, borderColor: '#2B3440', alignItems: 'center', justifyContent: 'center', padding: 22, gap: 10 },
  placeholderTitle: { color: '#F2F5F7', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  placeholderCopy: { color: '#9AA5B2', fontSize: 11, textAlign: 'center', lineHeight: 16 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 10, alignItems: 'center' },
  controlButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#202831', borderWidth: 1, borderColor: '#39434D', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  controlDisabled: { backgroundColor: '#3A292C', borderColor: '#6D3B43' },
  controlText: { color: '#F2F5F7', fontSize: 10, fontWeight: '800' },
  viewerNote: { color: '#9AA5B2', fontSize: 10, textAlign: 'center' },
});
