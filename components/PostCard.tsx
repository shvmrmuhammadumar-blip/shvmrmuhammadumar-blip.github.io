import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSegments } from 'expo-router';
import { getAppContentWidth } from '../lib/responsive';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import LumoVideoPlayer from './LumoVideoPlayer';
import { colors } from '../lib/theme';
import { timeAgo } from '../lib/api';
import type { Post } from '../lib/types';
import { useThemedStyles } from "../lib/theme-styles";

type Props = {
  post: Post;
  myId: string;
  onLike: (post: Post) => void;
  onOpenComments: (post: Post) => void;
  onOpenUser: (userId: string) => void;
  onSave?: (post: Post) => void;
  isSaved?: boolean;
  onDeletePost?: (post: Post) => void;
  onShare: (post: Post) => void;
  onOpenVideo?: (post: Post) => void;
  autoPlayVideo?: boolean;
};

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export default function PostCard({
  post,
  myId,
  onLike,
  onOpenComments,
  onOpenUser,
  onSave,
  isSaved = false,
  onDeletePost,
  onShare,
  onOpenVideo,
  autoPlayVideo = false,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [menuVisible, setMenuVisible] = useState(false);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const segments = useSegments();
  const availableWidth = getAppContentWidth(viewportWidth, segments[0] === '(tabs)');
  const isWideLayout = availableWidth >= 900;
  const cardWidth = isWideLayout
    ? Math.min(availableWidth - 80, 720)
    : availableWidth - 24;
  const mediaHeight = isWideLayout
    ? Math.min(560, cardWidth * 0.72)
    : Math.min(560, Math.max(280, cardWidth * 1.05));
  const videoHeight = Math.min(720, Math.max(420, viewportHeight * 0.72));
  const isVideoPost =
    post.media_type === "video" || Boolean(post.video_url);
  const likes = post.likes ?? [];
  const comments = post.comments ?? [];
  const liked = likes.some((l) => l.user_id === myId);
  const likeCount = likes.length;
  const commentCount = comments[0]?.count ?? 0;
  const username = post.profiles?.username ?? 'user';
  const isMine = post.user_id === myId;

  const handleShare = () => onShare(post);

  return (
    <View style={[lumoStyles.card, { width: cardWidth }]}>
      {/* Header */}
      <View style={lumoStyles.header}>
        <Pressable
          style={lumoStyles.authorRow}
          onPress={() => onOpenUser(post.user_id)}
          accessibilityRole="button"
          accessibilityLabel={`Open profile of ${username}`}
        >
          <Avatar uri={post.profiles?.avatar_url} name={username} size={38} hasStory={false} />
          <View style={lumoStyles.authorMeta}>
            <View style={lumoStyles.nameRow}>
              <Text style={lumoStyles.username}>{username}</Text>
              <Ionicons name="checkmark-circle" size={14} color={colors.verified} style={lumoStyles.verifiedIcon} />
            </View>
            <Text style={lumoStyles.timeMeta}>{timeAgo(post.created_at)} ago</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setMenuVisible(true)}
          hitSlop={10}
          style={lumoStyles.menuTrigger}
          accessibilityRole="button"
          accessibilityLabel="Post options"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {/* Media */}
      {isVideoPost ? (
        post.video_url ? (
          <View style={[lumoStyles.mediaContainer, { height: videoHeight }]}>
            <LumoVideoPlayer
              uri={post.video_url}
              analytics={{ ownerId: post.user_id, contentId: post.id, contentType: 'post' }}
              style={lumoStyles.videoPlayer}
              bottomInset={8}
              autoPlay={autoPlayVideo}
              compact
              onOpenClip={() => onOpenVideo?.(post)}
            />
          </View>
        ) : (
          <View style={[lumoStyles.mediaUnavailable, { height: mediaHeight }]}>
            <Ionicons name="videocam-off-outline" size={34} color={colors.muted} />
            <Text style={lumoStyles.mediaUnavailableText}>Video unavailable</Text>
          </View>
        )
      ) : post.image_url ? (
        <View style={[lumoStyles.mediaContainer, { height: mediaHeight }]}>
          <Image
            source={{ uri: post.image_url }}
            style={lumoStyles.image}
            contentFit="contain"
            transition={250}
          />
        </View>
      ) : null}

      {/* Action Bar */}
      <View style={lumoStyles.actionBar}>
        <View style={lumoStyles.leftActions}>
          <Pressable
            onPress={() => onLike(post)}
            hitSlop={8}
            style={lumoStyles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unlike post' : 'Like post'}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={26}
              color={liked ? colors.like : colors.text}
            />
            {likeCount > 0 && (
              <Text style={[lumoStyles.actionCount, liked && { color: colors.like }]}>
                {formatCount(likeCount)}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => onOpenComments(post)}
            hitSlop={8}
            style={lumoStyles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="View comments"
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
            {commentCount > 0 && (
              <Text style={lumoStyles.actionCount}>{formatCount(commentCount)}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleShare}
            hitSlop={8}
            style={lumoStyles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Forward post"
          >
            <Ionicons name="arrow-redo-outline" size={22} color={colors.lime} />
          </Pressable>
        </View>

        {onSave && (
          <Pressable
            onPress={() => onSave(post)}
            hitSlop={8}
            style={lumoStyles.saveBtn}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Remove from saved' : 'Save post'}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={25}
              color={isSaved ? colors.lime : colors.text}
            />
          </Pressable>
        )}
      </View>

      {/* Body & Caption */}
      <View style={lumoStyles.body}>
        {likeCount > 0 && (
          <Text style={lumoStyles.likesSnippet}>
            Liked by <Text style={lumoStyles.boldText}>{formatCount(likeCount)}</Text>{' '}
            {likeCount === 1 ? 'person' : 'people'}
          </Text>
        )}

        {!!post.caption && (
          <Text style={lumoStyles.caption}>
            <Text style={lumoStyles.captionUsername}>{username} </Text>
            {post.caption}
          </Text>
        )}

        {commentCount > 0 && (
          <Pressable onPress={() => onOpenComments(post)} hitSlop={6}>
            <Text style={lumoStyles.viewComments}>
              View all {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Options Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={lumoStyles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={lumoStyles.modalSheet}>
            <View style={lumoStyles.modalHandle} />
            <Pressable
              style={lumoStyles.modalItem}
              onPress={() => {
                setMenuVisible(false);
                void handleShare();
              }}
            >
              <Ionicons name="share-outline" size={22} color={colors.text} />
              <Text style={lumoStyles.modalItemText}>Forward to...</Text>
            </Pressable>

            {onSave && (
              <Pressable
                style={lumoStyles.modalItem}
                onPress={() => {
                  setMenuVisible(false);
                  onSave(post);
                }}
              >
                <Ionicons
                  name={isSaved ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={isSaved ? colors.lime : colors.text}
                />
                <Text style={lumoStyles.modalItemText}>
                  {isSaved ? 'Remove from Saved' : 'Save Post'}
                </Text>
              </Pressable>
            )}

            {isMine && onDeletePost && (
              <Pressable
                style={lumoStyles.modalItem}
                onPress={() => {
                  setMenuVisible(false);
                  onDeletePost(post);
                }}
              >
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
                <Text style={[lumoStyles.modalItemText, { color: colors.danger }]}>
                  Delete Post
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[lumoStyles.modalItem, lumoStyles.modalCancelItem]}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={lumoStyles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    marginBottom: 26,
    marginHorizontal: 0,
    backgroundColor: "#12161C",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#252D23",
    overflow: "hidden",
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  authorMeta: {
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  username: {
    fontWeight: '800',
    fontSize: 15,
    color: colors.text,
    letterSpacing: -0.2,
  },
  verifiedIcon: {
    marginTop: 1,
  },
  timeMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  menuTrigger: {
    padding: 6,
  },
  mediaContainer: {
    width: "100%",
    backgroundColor: "#090C12",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
  },
  mediaUnavailable: {
    width: "100%",
    backgroundColor: "#12161C",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  mediaUnavailableText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    padding: 2,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 5,
  },
  likesSnippet: {
    color: colors.muted,
    fontSize: 13,
  },
  boldText: {
    color: colors.text,
    fontWeight: '700',
  },
  caption: {
    color: colors.text,
    lineHeight: 20,
    fontSize: 14,
  },
  captionUsername: {
    fontWeight: '800',
    color: colors.text,
  },
  viewComments: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 6,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalCancelItem: {
    borderBottomWidth: 0,
    justifyContent: 'center',
    marginTop: 6,
  },
  modalCancelText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
