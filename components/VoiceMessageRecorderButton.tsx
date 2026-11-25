import React, { useRef, useState } from "react";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

const MAX_RECORDING_SECONDS = 60;
const MIN_RECORDING_MS = 650;

type Props = {
  disabled?: boolean;
  onSend: (uri: string, durationMs: number) => Promise<void>;
};

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VoiceMessageRecorderButton({ disabled = false, onSend }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);

  const startRecording = async () => {
    if (disabled || busy || recordingRef.current) return;
    setBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Microphone permission needed",
          "Allow Lumo to use your microphone in Android Settings to record voice messages.",
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_RECORDING_SECONDS });
      startedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecording(true);
    } catch (error) {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
      Alert.alert(
        "Recording failed",
        error instanceof Error ? error.message : "Lumo could not start the microphone.",
      );
    } finally {
      setBusy(false);
    }
  };

  const finishRecording = async (cancel = false) => {
    if (!recordingRef.current || busy) return;
    recordingRef.current = false;
    setRecording(false);
    setBusy(true);

    const elapsedMs = Math.min(
      Date.now() - startedAtRef.current,
      MAX_RECORDING_SECONDS * 1000,
    );

    try {
      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (cancel || elapsedMs < MIN_RECORDING_MS || !uri) return;
      await onSend(uri, elapsedMs);
    } catch (error) {
      Alert.alert(
        "Voice message not sent",
        error instanceof Error ? error.message : "Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, recording && styles.wrapRecording]}>
      {recording ? (
        <>
          <Pressable
            onPress={() => void finishRecording(true)}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel voice recording"
            style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
          <View pointerEvents="none" style={styles.recordingHint}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingHintText}>
              {formatDuration(recorderState.durationMillis)} · tap to send
            </Text>
          </View>
          <Pressable
            onPress={() => void finishRecording(false)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Stop and send voice message"
            style={({ pressed }) => [styles.button, styles.buttonRecording, pressed && styles.buttonPressed]}
          >
            <Ionicons name="arrow-up" size={21} color="#FFFFFF" />
          </Pressable>
        </>
      ) : (
        <Pressable
          onPress={() => void startRecording()}
          disabled={disabled || busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Start voice recording"
          accessibilityHint="Tap once to start recording, then tap send to finish. Maximum 60 seconds."
          style={({ pressed }) => [
            styles.button,
            (disabled || busy) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <Ionicons name="time-outline" size={21} color={colors.muted} />
          ) : (
            <Ionicons name="mic" size={21} color={colors.lime} />
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  wrapRecording: {
    width: 90,
    flexDirection: "row",
    gap: 6,
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonRecording: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  cancelButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordingHint: {
    position: "absolute",
    right: 0,
    bottom: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 154,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 20,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E34858",
  },
  recordingHintText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
  },
});
