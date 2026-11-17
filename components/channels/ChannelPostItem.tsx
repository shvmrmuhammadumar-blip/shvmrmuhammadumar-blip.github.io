import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Avatar from '../Avatar';
import SharedPostCard from '../SharedPostCard';
import MessageActionSurface from '../MessageActionSurface';
import { colors } from '../../lib/theme';
import type { ChannelPostWithSender } from '../../lib/channels';
import { ChannelMediaPreview } from './ChannelMediaPreview';

type Props = {
  post: ChannelPostWithSender;
  currentUserId?: string;
  onLongPress?: (post: ChannelPostWithSender) => void;
  onOpenMedia?: (
    post: ChannelPostWithSender,
    url: string,
    type: 'image' | 'video',
  ) => void;
};

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChannelPostItem({
  post,
  currentUserId,
  onLongPress,
  onOpenMedia,
}: Props) {
  const mine = post.sender_id === currentUserId;

  const senderName =
    post.sender?.full_name ||
    post.sender?.username ||
    'Channel admin';

  const type = post.message_type ?? 'text';
  const hasMedia = type !== 'text';

  const isPinned = Boolean(
    (post as ChannelPostWithSender & { is_pinned?: boolean }).is_pinned,
  );

  const fallbackMimeType =
    type === 'image' ? 'image/*' :
    type === 'video' ? 'video/*' :
    type === 'audio' ? 'audio/*' :
    null;

  return (
    <View style={[styles.line, mine ? styles.mineLine : styles.otherLine]}>
      {!mine && (
        <Avatar
          uri={post.sender?.avatar_url}
          name={senderName}
          size={29}
        />
      )}

      <View style={styles.content}>
        {!mine && (
          <Text style={styles.sender} numberOfLines={1}>
            {senderName}
          </Text>
        )}

        <MessageActionSurface
          align={mine ? 'flex-end' : 'flex-start'}
          enabled={Boolean(onLongPress)}
          onOpenActions={() => onLongPress?.(post)}
        >
        <Pressable
          onLongPress={onLongPress ? () => onLongPress(post) : undefined}
          delayLongPress={300}
          style={[
            styles.bubble,
            mine ? styles.mineBubble : styles.otherBubble,
            hasMedia && styles.bubbleWithMedia,
          ]}
          accessibilityRole="button"
          accessibilityHint="Long press to open post actions"
        >
          {isPinned && (
            <View style={styles.pinnedNotice}>
              <Ionicons name="pin" size={12} color={colors.lime} />
              <Text style={styles.pinnedText}>PINNED MESSAGE</Text>
            </View>
          )}

          {!!(post as any).forwarded_from_type && (
            <Text style={styles.forwardedLabel} numberOfLines={1}>
              FORWARDED
              {(post as any).forwarded_from_sender
                ? ` · ${(post as any).forwarded_from_sender}`
                : ''}
            </Text>
          )}

          {(post as any).forwarded_from_type === 'post' &&
            typeof (post as any).forwarded_from_id === 'string' && (
              <SharedPostCard postId={(post as any).forwarded_from_id} />
            )}
          {hasMedia && post.media_path ? (
            <View style={styles.media}>
              <ChannelMediaPreview
                mediaPath={post.media_path}
                mimeType={post.media_mime_type || fallbackMimeType}
                fileName={post.media_file_name}
                onLongPress={
                  onLongPress ? () => onLongPress(post) : undefined
                }
                onOpenMedia={
                  onOpenMedia
                    ? (url, mediaType) => onOpenMedia(post, url, mediaType)
                    : undefined
                }
              />
            </View>
          ) : hasMedia ? (
            <View style={styles.unavailable}>
              <Ionicons
                name="document-outline"
                size={20}
                color={colors.muted}
              />
              <Text style={styles.unavailableText}>
                Attachment unavailable
              </Text>
            </View>
          ) : null}

          {!!post.body?.trim() && (
            <Text style={[styles.body, mine ? styles.ownText : styles.otherText]}>
              {post.body}
            </Text>
          )}

          {!!post.edited_at && (
            <Text style={[styles.edited, mine && styles.ownText]}>
              edited
            </Text>
          )}

          <View style={styles.meta}>
            <Text style={[styles.time, mine && styles.ownText]}>
              {formatTime(post.created_at)}
            </Text>
            {mine && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color={colors.bg}
              />
            )}
          </View>
        </Pressable>
        </MessageActionSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
    marginVertical: 4,
    paddingHorizontal: 1,
    marginBottom: 10,
  },
  mineLine: {
    justifyContent: 'flex-end',
  },
  otherLine: {
    justifyContent: 'flex-start',
  },
  content: {
    maxWidth: '82%',
    minWidth: 55,
  },
  sender: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
    marginLeft: 5,
  },
  forwardedLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 6,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 90,
  },
  mineBubble: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
    borderBottomRightRadius: 5,
  },
  otherBubble: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderBottomLeftRadius: 5,
  },
  bubbleWithMedia: {
    padding: 6,
    overflow: 'hidden',
  },
  pinnedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  pinnedText: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  media: {
    marginBottom: 5,
    overflow: 'hidden',
    borderRadius: 11,
  },
  unavailable: {
    minWidth: 180,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  unavailableText: {
    color: colors.muted,
    fontSize: 10,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
  },
  ownText: {
    color: colors.bg,
    fontWeight: '600',
  },
  otherText: {
    color: colors.text,
  },
  edited: {
    color: colors.muted,
    fontSize: 8,
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 3,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  time: {
    color: colors.muted,
    fontSize: 8,
  },
});