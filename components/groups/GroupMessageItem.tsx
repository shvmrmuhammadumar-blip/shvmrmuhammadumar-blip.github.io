import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Avatar from '../Avatar';
import SharedPostCard from '../SharedPostCard';
import ChatMediaAttachment from '../ChatMediaAttachment';
import MessageActionSurface from '../MessageActionSurface';
import { colors } from '../../lib/theme';
import type { GroupMessageWithSender } from '../../lib/groups';
import { useThemedStyles } from "../../lib/theme-styles";

export type GroupReaction = {
  group_message_id: string;
  user_id: string;
  reaction: string;
};

export type GroupChatMessage = GroupMessageWithSender & {
  media_url: string | null;
  reactions: GroupReaction[];
};

type Props = {
  message: GroupChatMessage;
  replyMessage?: GroupChatMessage | null;
  currentUserId?: string;
  onJumpToReply: (messageId: string) => void;
  highlighted?: boolean;
  onLongPress: (message: GroupChatMessage) => void;
  onToggleReaction: (message: GroupChatMessage, reaction: string) => void;
  onOpenMedia: (url: string | null, type: 'image' | 'video') => void;
  onOpenAttachment: (message: GroupChatMessage) => void;
};

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GroupMessageItem({
  message,
  replyMessage,
  currentUserId,
  onJumpToReply,
  highlighted = false,
  onLongPress,
  onToggleReaction,
  onOpenMedia,
  onOpenAttachment,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const mine = message.sender_id === currentUserId;
  const type = message.message_type ?? 'text';

  const reactions = [...new Set(
    message.reactions.map((item) => item.reaction),
  )].map((reaction) => ({
    reaction,
    count: message.reactions.filter(
      (item) => item.reaction === reaction,
    ).length,
    mine: message.reactions.some(
      (item) =>
        item.user_id === currentUserId &&
        item.reaction === reaction,
    ),
  }));

  return (
    <View style={[lumoStyles.line, mine ? lumoStyles.mineLine : lumoStyles.otherLine]}>
      {!mine && (
        <Avatar
          uri={message.sender?.avatar_url}
          name={message.sender?.username ?? 'Member'}
          size={29}
        />
      )}

      <View style={lumoStyles.content}>
        {!mine && (
          <Text style={lumoStyles.sender} numberOfLines={1}>
            {message.sender?.full_name ||
              message.sender?.username ||
              'Member'}
          </Text>
        )}

        <MessageActionSurface
          align={mine ? 'flex-end' : 'flex-start'}
          onOpenActions={() => onLongPress(message)}
        >
        <Pressable
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
          style={[
            lumoStyles.bubble,
            mine ? lumoStyles.mineBubble : lumoStyles.otherBubble,
            type !== 'text' && lumoStyles.bubbleWithMedia,
            highlighted && lumoStyles.highlightedBubble,
          ]}
          accessibilityRole="button"
          accessibilityHint="Long press to open message actions"
        >
          {!!(message as any).forwarded_from_type && (
            <Text style={lumoStyles.forwardedLabel} numberOfLines={1}>
              FORWARDED
              {(message as any).forwarded_from_sender
                ? ` · ${(message as any).forwarded_from_sender}`
                : ''}
            </Text>
          )}

          {(message as any).forwarded_from_type === 'post' &&
            typeof (message as any).forwarded_from_id === 'string' && (
              <SharedPostCard postId={(message as any).forwarded_from_id} />
            )}
          {!!message.reply_to && (
            <Pressable
              style={({ pressed }) => [
                lumoStyles.reply,
                pressed && lumoStyles.replyPressed,
              ]}
              disabled={!replyMessage}
              onPress={() => {
                if (replyMessage) {
                  onJumpToReply(replyMessage.id);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to replied message"
            >
              <Text style={lumoStyles.replyTitle} numberOfLines={1}>
                {replyMessage?.sender_id === currentUserId
                  ? 'You'
                  : replyMessage?.sender?.full_name ||
                    replyMessage?.sender?.username ||
                    'Reply'}
              </Text>
              <Text style={lumoStyles.replyBody} numberOfLines={1}>
                {replyMessage?.body?.trim() ||
                  (replyMessage?.media_path ? 'Attachment' : 'Message')}
              </Text>
            </Pressable>
          )}

          {type !== 'text' && (
            <ChatMediaAttachment
              key={message.id}
              type={type as 'image' | 'video' | 'audio' | 'file'}
              uri={message.media_url}
              fileName={message.media_file_name}
              mine={mine}
              fileAction={
                type === 'audio'
                  ? 'AUDIO · TAP TO DOWNLOAD'
                  : 'FILE · TAP TO DOWNLOAD'
              }
              onLongPress={() => onLongPress(message)}
              onPress={() => {
                if (type === 'image' || type === 'video') {
                  onOpenMedia(message.media_url, type);
                } else {
                  onOpenAttachment(message);
                }
              }}
            />
          )}
          {!!message.body?.trim() && (
            <Text style={[lumoStyles.body, mine ? lumoStyles.ownText : lumoStyles.otherText]}>
              {message.body}
            </Text>
          )}

          {!!message.edited_at && (
            <Text style={[lumoStyles.edited, mine && lumoStyles.ownText]}>
              edited
            </Text>
          )}

          <View style={lumoStyles.meta}>
            <Text style={[lumoStyles.time, mine && lumoStyles.ownText]}>
              {formatTime(message.created_at)}
            </Text>
            {mine && (
              <Ionicons name="checkmark-done" size={14} color={colors.bg} />
            )}
          </View>
        </Pressable>
        </MessageActionSurface>

        <View style={lumoStyles.reactionRow}>
          {reactions.map((item) => (
            <Pressable
              key={item.reaction}
              onPress={() => onToggleReaction(message, item.reaction)}
              style={[
                lumoStyles.reaction,
                item.mine && lumoStyles.reactionActive,
              ]}
            >
              <Text style={lumoStyles.reactionText}>
                {item.reaction} {item.count}
              </Text>
            </Pressable>
          ))}

          <Pressable
            onPress={() => onToggleReaction(message, '❤️')}
            style={lumoStyles.addReaction}
            accessibilityLabel="React with heart"
          >
            <Ionicons name="heart-outline" size={14} color={colors.muted} />
          </Pressable>
        </View>
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
    paddingHorizontal: 11,
  },
  mineLine: { justifyContent: 'flex-end' },
  otherLine: { justifyContent: 'flex-start' },
  content: { maxWidth: '82%', minWidth: 55 },
  sender: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
    marginLeft: 5,
  },
  bubble: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 6,
    borderRadius: 16,
    minWidth: 90,
  },
  mineBubble: {
    backgroundColor: colors.lime,
    borderBottomRightRadius: 5,
  },
  otherBubble: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 5,
  },
  highlightedBubble: {
    borderWidth: 2,
    borderColor: colors.lime,
    shadowColor: colors.lime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  bubbleWithMedia: {
    padding: 6,
    overflow: 'hidden',
  },
  body: { fontSize: 13, lineHeight: 19 },
  ownText: { color: colors.bg },
  otherText: { color: colors.text },
  forwardedLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  reply: {
    maxWidth: 245,
    alignSelf: 'stretch',
    borderLeftWidth: 2,
    borderLeftColor: colors.lime,
    paddingLeft: 9,
    paddingRight: 8,
    paddingVertical: 5,
    marginBottom: 6,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#00000012',
  },
  replyPressed: {
    opacity: 0.68,
  },
  replyTitle: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '800',
  },
  replyBody: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  image: {
    width: 220,
    height: 190,
    borderRadius: 11,
    marginBottom: 5,
  },
  unavailable: {
    minWidth: 180,
    minHeight: 85,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  video: {
    width: 210,
    height: 125,
    borderRadius: 11,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 190,
    backgroundColor: '#00000012',
    borderRadius: 10,
    padding: 10,
    marginBottom: 5,
  },
  fileCopy: { flex: 1, marginHorizontal: 9 },
  fileName: { color: colors.text, fontSize: 11, fontWeight: '800' },
  fileHint: { color: colors.muted, fontSize: 8, marginTop: 3 },
  edited: {
    color: colors.muted,
    fontSize: 8,
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
  time: { color: colors.muted, fontSize: 8 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reaction: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionActive: {
    borderColor: colors.lime,
    backgroundColor: colors.accentDark,
  },
  reactionText: { color: colors.text, fontSize: 9 },
  addReaction: {
    width: 25,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.surfaceRaised,
  },
});
