import React, { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CHANNEL_MEDIA_BUCKET,
  formatChannelFileSize,
  pickChannelMedia,
  createChannelResumableUpload,
  type ChannelPickerMode,
  type PickedChannelMedia,
} from '../../lib/channel-upload';
import { publishChannelPost } from '../../lib/channels';
import { supabase } from '../../lib/supabase';
import {
  ResumableUpload,
  type UploadProgress,
} from '../../lib/resumable-upload';
import { useThemedStyles } from "../../lib/theme-styles";
import { colors } from '../../lib/theme';

const COLORS = {
  get background() { return colors.bg; },
  get panel() { return colors.surface; },
  get panelRaised() { return colors.surfaceRaised; },
  get border() { return colors.border; },
  get lime() { return colors.accent; },
  get text() { return colors.text; },
  get muted() { return colors.muted; },
  get danger() { return colors.danger; },
};

type Props = {
  channelId: string;
  userId: string;
  canPost: boolean;
  onPublished?: () => void | Promise<void>;
};

function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  return `${formatChannelFileSize(bytesPerSecond)}/s`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'Hisoblanmoqda';
  if (seconds <= 0) return 'Deyarli tayyor';
  if (seconds < 60) return `${seconds} soniya`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} daq ${remainder} soniya` : `${minutes} daqiqa`;
}

function getStatusLabel(status: UploadProgress['status']): string {
  switch (status) {
    case 'preparing': return 'Tayyorlanmoqda';
    case 'uploading': return 'Yuklanmoqda';
    case 'paused': return 'To‘xtatildi';
    case 'retrying': return 'Aloqa tiklanmoqda';
    case 'completed': return 'Yuklandi';
    default: return 'Kutilmoqda';
  }
}

export function ChannelMediaUpload({
  channelId,
  userId,
  canPost,
  onPublished,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<PickedChannelMedia | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const uploadRef = useRef<ResumableUpload | null>(null);
  const uploadedPathRef = useRef<string | null>(null);

  if (!canPost) return null;

  const close = () => {
    if (busy) return;
    setVisible(false);
    setSelected(null);
    setProgress(null);
    setErrorMessage(null);
    uploadRef.current = null;
    uploadedPathRef.current = null;
  };

  const choose = async (mode: ChannelPickerMode) => {
    setPicking(true);
    setErrorMessage(null);

    try {
      const media = await pickChannelMedia(mode);
      if (!media) return;
      setSelected(media);
      setProgress(null);
      uploadRef.current = null;
      uploadedPathRef.current = null;
      setVisible(true);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Faylni tanlashda xatolik yuz berdi.';

      setErrorMessage(message);
      Alert.alert('Attachment unavailable', message);
    } finally {
      setPicking(false);
    }
  };

  const openAttachmentMenu = () => {
    if (picking || busy) return;
    void choose('file');
  };
  const publish = async () => {
    if (!selected || busy) return;

    setBusy(true);
    setErrorMessage(null);

    try {
      const activeUpload = uploadRef.current ?? createUploadForSelected();
      uploadRef.current = activeUpload;

      const path = uploadedPathRef.current ?? await activeUpload.start();
      uploadedPathRef.current = path;

      await publishChannelPost({
        channelId,
        senderId: userId,
        body: '',
        messageType: selected.type,
        mediaPath: path,
        mediaMimeType: selected.mimeType,
        mediaFileName: selected.fileName,
      });

      setVisible(false);
      setSelected(null);
      setProgress(null);
      uploadRef.current = null;
      uploadedPathRef.current = null;
      try {
        await onPublished?.();
      } catch {
        // The media post is already published; a feed refresh must not delete it.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Yuklashda xatolik yuz berdi.';
      setErrorMessage(message);

      // If the object reached Storage but the post row failed, remove the orphaned file.
      if (uploadedPathRef.current) {
        const { error: removeError } = await supabase.storage
          .from(CHANNEL_MEDIA_BUCKET)
          .remove([uploadedPathRef.current]);
        if (!removeError) {
          uploadedPathRef.current = null;
          uploadRef.current = null;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const createUploadForSelected = () => {
    if (!selected) throw new Error('Avval fayl tanlang.');
    // The actual owner/admin check is enforced by Storage RLS, not by this UI.
    return createChannelResumableUpload({
      channelId,
      userId,
      media: selected,
      onProgress: setProgress,
    });
  };

  const pause = () => uploadRef.current?.pause();
  const resume = () => uploadRef.current?.resume();

  const cancel = async () => {
    await uploadRef.current?.cancel();
    uploadRef.current = null;
    uploadedPathRef.current = null;
    setBusy(false);
    setProgress(null);
    setErrorMessage('Yuklash bekor qilindi.');
  };

  const isPaused = progress?.status === 'paused';
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));

  return (
    <>
      <View style={lumoStyles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach media or file"
          disabled={picking || busy}
          onPress={openAttachmentMenu}
          style={({ pressed }) => [
            lumoStyles.attachButton,
            pressed && lumoStyles.actionPressed,
          ]}
        >
          {picking ? (
            <ActivityIndicator color={COLORS.lime} size="small" />
          ) : (
            <Ionicons name="attach" size={21} color={COLORS.lime} />
          )}
        </Pressable>
      </View>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={lumoStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} disabled={busy} />
          <View style={lumoStyles.sheet}>
            <View style={lumoStyles.handle} />
            <View style={lumoStyles.header}>
              <View>
                <Text style={lumoStyles.eyebrow}>CHANNEL ATTACHMENT</Text>
                <Text style={lumoStyles.title}>Fayl yuborish</Text>
              </View>
              <Pressable onPress={close} disabled={busy} hitSlop={12} style={lumoStyles.closeButton}>
                <Text style={lumoStyles.closeText}>×</Text>
              </Pressable>
            </View>

            {selected ? (
              <View style={lumoStyles.fileCard}>
                <View style={lumoStyles.fileIcon}><Text style={lumoStyles.fileIconText}>{selected.type === 'image' ? '▧' : selected.type === 'video' ? '▶' : selected.type === 'audio' ? '♫' : '↧'}</Text></View>
                <View style={lumoStyles.fileMeta}>
                  <Text numberOfLines={1} style={lumoStyles.fileName}>{selected.fileName}</Text>
                  <Text style={lumoStyles.fileInfo}>{formatChannelFileSize(selected.fileSize)}  ·  {selected.mimeType}</Text>
                </View>
                <View style={lumoStyles.limitBadge}><Text style={lumoStyles.limitText}>50 MB MAX</Text></View>
              </View>
            ) : null}

            {progress ? (
              <View style={lumoStyles.progressCard}>
                <View style={lumoStyles.progressTop}>
                  <Text style={lumoStyles.progressLabel}>{getStatusLabel(progress.status)}</Text>
                  <Text style={lumoStyles.progressPercent}>{Math.round(percent)}%</Text>
                </View>
                <View style={lumoStyles.track}>
                  <View style={[lumoStyles.fill, { width: `${percent}%` }]} />
                </View>
                <View style={lumoStyles.metrics}>
                  <Text style={lumoStyles.metric}>{formatChannelFileSize(progress.bytesUploaded)} / {formatChannelFileSize(progress.totalBytes)}</Text>
                  <Text style={lumoStyles.metric}>{formatSpeed(progress.bytesPerSecond)}</Text>
                  <Text style={lumoStyles.metric}>Qolgan: {formatEta(progress.etaSeconds)}</Text>
                </View>
              </View>
            ) : null}

            {errorMessage ? <Text accessibilityRole="alert" style={lumoStyles.error}>{errorMessage}</Text> : null}

            <View style={lumoStyles.footer}>
              {busy ? (
                <>
                  <Pressable onPress={isPaused ? resume : pause} style={lumoStyles.secondaryButton}>
                    <Text style={lumoStyles.secondaryText}>{isPaused ? 'Davom ettirish' : 'Pauza'}</Text>
                  </Pressable>
                  <Pressable onPress={cancel} style={lumoStyles.cancelButton}>
                    <Text style={lumoStyles.cancelText}>Bekor qilish</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={close} style={lumoStyles.secondaryButton}>
                    <Text style={lumoStyles.secondaryText}>Yopish</Text>
                  </Pressable>
                  <Pressable onPress={publish} disabled={!selected} style={[lumoStyles.primaryButton, !selected && lumoStyles.disabledButton]}>
                    <Text style={lumoStyles.primaryText}>{errorMessage ? 'Qayta urinish' : 'Kanalga yuborish'}  ↗</Text>
                  </Pressable>
                </>
              )}
            </View>
            <Text style={lumoStyles.footnote}>Faqat kanal egasi va adminlari fayl yubora oladi.</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    width: 40,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButton: {
    width: 40,
    height: 43,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  actionIcon: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: COLORS.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: { color: COLORS.lime, fontSize: 16, fontWeight: '700' },
  actionLabel: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  pickerSpinner: { marginLeft: 2 },
  inlineError: { color: COLORS.danger, fontSize: 12, paddingHorizontal: 4, paddingBottom: 6 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: '#444A40', alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { color: COLORS.lime, fontSize: 9, fontWeight: '800', letterSpacing: 1.6, marginBottom: 5 },
  title: { color: COLORS.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  closeButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.panelRaised, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: COLORS.muted, fontSize: 25, lineHeight: 27 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.panel, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 13 },
  fileIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#252D1C', alignItems: 'center', justifyContent: 'center' },
  fileIconText: { color: COLORS.lime, fontSize: 19, fontWeight: '800' },
  fileMeta: { flex: 1, minWidth: 0 },
  fileName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  fileInfo: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  limitBadge: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: '#232A1B' },
  limitText: { color: COLORS.lime, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  progressCard: { backgroundColor: COLORS.panel, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginTop: 12 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  progressPercent: { color: COLORS.lime, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 8, backgroundColor: '#2B3440', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8, backgroundColor: COLORS.lime },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  metric: { color: COLORS.muted, fontSize: 9, fontVariant: ['tabular-nums'] },
  error: { color: COLORS.danger, fontSize: 11, lineHeight: 16, marginTop: 11 },
  footer: { flexDirection: 'row', gap: 9, marginTop: 18 },
  secondaryButton: { flex: 1, minHeight: 47, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  cancelButton: { flex: 1, minHeight: 47, borderRadius: 14, backgroundColor: '#27191D', borderWidth: 1, borderColor: '#5A2933', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' },
  primaryButton: { flex: 1.4, minHeight: 47, borderRadius: 14, backgroundColor: COLORS.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  primaryText: { color: '#12170C', fontSize: 12, fontWeight: '900' },
  disabledButton: { opacity: 0.4 },
  footnote: { color: '#687061', textAlign: 'center', fontSize: 9, marginTop: 13 },
});
