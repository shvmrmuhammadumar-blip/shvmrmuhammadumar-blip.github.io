import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ChatMediaAttachment from '../ChatMediaAttachment';
import { CHANNEL_MEDIA_BUCKET } from '../../lib/channel-upload';
import { supabase } from '../../lib/supabase';
import { useThemedStyles } from "../../lib/theme-styles";
import { colors } from '../../lib/theme';

const COLORS = {
  get panel() { return colors.surface; },
  get border() { return colors.border; },
  get lime() { return colors.accent; },
  get text() { return colors.text; },
  get muted() { return colors.muted; },
};

type Props = {
  mediaPath: string;
  mimeType?: string | null;
  fileName?: string | null;
  onOpenMedia?: (url: string, type: 'image' | 'video') => void;
  onLongPress?: () => void;
};


export function ChannelMediaPreview({
  mediaPath,
  mimeType,
  fileName,
  onOpenMedia,
  onLongPress,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSignedUrl(null);

    supabase.storage
      .from(CHANNEL_MEDIA_BUCKET)
      .createSignedUrl(mediaPath, 60 * 60)
      .then(({ data, error: signedError }) => {
        if (!active) return;
        if (signedError || !data?.signedUrl) {
          setError('Media hozircha ochilmadi.');
        } else {
          setSignedUrl(data.signedUrl);
        }
      })
      .catch(() => {
        if (active) setError('Media hozircha ochilmadi.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mediaPath]);

  const type = mimeType || 'application/octet-stream';
  const name = fileName || mediaPath.split('/').pop() || 'Attachment';

  if (loading) {
    return (
      <View style={lumoStyles.loading}>
        <ActivityIndicator color={COLORS.lime} />
        <Text style={lumoStyles.muted}>Media ochilmoqda</Text>
      </View>
    );
  }

  if (error || !signedUrl) {
    return (
      <View style={lumoStyles.unavailable}>
        <Text style={lumoStyles.unavailableText}>{error || 'Media topilmadi.'}</Text>
      </View>
    );
  }

  const mediaType =
    type.startsWith('image/') ? 'image' :
    type.startsWith('video/') ? 'video' :
    type.startsWith('audio/') ? 'audio' :
    'file';

  const extension = name.includes('.')
    ? name.split('.').pop()?.toUpperCase() ?? 'FILE'
    : 'FILE';

  return (
    <ChatMediaAttachment
      type={mediaType}
      uri={signedUrl}
      fileName={name}
      fileAction={`${extension} · TAP TO OPEN`}
      onPress={
        mediaType === 'image' || mediaType === 'video'
          ? onOpenMedia
            ? () => onOpenMedia(signedUrl, mediaType)
            : undefined
          : () => {
              void Linking.openURL(signedUrl);
            }
      }
      onLongPress={onLongPress}
    />
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 72, borderRadius: 13, backgroundColor: COLORS.panel, alignItems: 'center', justifyContent: 'center', gap: 7 },
  muted: { color: COLORS.muted, fontSize: 11 },
  unavailable: { minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel, justifyContent: 'center', paddingHorizontal: 12 },
  unavailableText: { color: COLORS.muted, fontSize: 12 },
  image: { width: '100%', height: 190, borderRadius: 13, backgroundColor: '#050605' },
  videoWrap: { width: '100%', overflow: 'hidden', borderRadius: 13, backgroundColor: '#050605' },
  video: { width: '100%', height: 190 },
  fileCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  fileIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#252D1C', alignItems: 'center', justifyContent: 'center' },
  fileIconText: { color: COLORS.lime, fontSize: 20, fontWeight: '800' },
  fileMeta: { flex: 1, minWidth: 0, gap: 5 },
  fileName: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  openText: { color: COLORS.lime, fontSize: 10, fontWeight: '800' },
});
