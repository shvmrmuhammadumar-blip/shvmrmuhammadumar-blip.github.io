
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LumoVideoPlayer from './LumoVideoPlayer';

export type ChatMediaViewerItem = {
  id: string;
  url: string;
  type: 'image' | 'video';
  senderLabel: string;
  createdAt: string;
  fileName?: string | null;
};

type Props = {
  visible: boolean;
  items: ChatMediaViewerItem[];
  initialIndex: number;
  onClose: () => void;
  onDownload?: (item: ChatMediaViewerItem) => void | Promise<void>;
};

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatMediaViewer({
  visible,
  items,
  initialIndex,
  onClose,
  onDownload,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  const opacity = useRef(new Animated.Value(0)).current;
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const safeIndex = Math.max(
      0,
      Math.min(initialIndex, items.length - 1),
    );

    setActiveIndex(safeIndex);
    setScale(1);

    opacity.setValue(0);

    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, initialIndex, items.length, opacity]);

  const activeItem = items[activeIndex] ?? null;

  const changeMedia = (direction: -1 | 1) => {
    const nextIndex = activeIndex + direction;

    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    setActiveIndex(nextIndex);
    setScale(1);
  };

  const close = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onClose();
      }
    });
  };

  const handleTouchStart = (event: any) => {
    touchStartX.current = event.nativeEvent.pageX;
  };

  const handleTouchEnd = (event: any) => {
    const startX = touchStartX.current;
    touchStartX.current = null;

    if (startX === null || scale > 1) {
      return;
    }

    const endX =
      event.nativeEvent.changedTouches?.[0]?.pageX;

    if (typeof endX !== 'number') {
      return;
    }

    const difference = endX - startX;

    if (Math.abs(difference) < 75) {
      return;
    }

    changeMedia(difference > 0 ? -1 : 1);
  };

  const zoomIn = () => {
    setScale((current) => Math.min(3, current + 0.5));
  };

  const zoomOut = () => {
    setScale((current) => Math.max(1, current - 0.5));
  };

  const resetZoom = () => {
    setScale(1);
  };

  const handleDownload = async () => {
    if (!activeItem || !onDownload) {
      return;
    }

    try {
      await onDownload(activeItem);
    } catch {
      // Download errors should be handled by the parent screen.
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Animated.View
        style={[
          styles.root,
          {
            opacity,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <View style={styles.indicator} />

            <View>
              <Text style={styles.eyebrow}>LUMO MEDIA</Text>
              <Text style={styles.counter}>
                {items.length > 0
                  ? `${activeIndex + 1} of ${items.length}`
                  : 'Media'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close media viewer"
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="close" size={23} color="#F2F5F7" />
          </Pressable>
        </View>

        <View
          style={styles.stage}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeItem?.type === 'image' ? (
            <Image
              key={activeItem.id}
              source={{ uri: activeItem.url }}
              contentFit="contain"
              transition={180}
              style={[
                styles.image,
                {
                  width: width - 24,
                  height: Math.min(height * 0.69, 620),
                  transform: [{ scale }],
                },
              ]}
            />
          ) : activeItem?.type === 'video' ? (
            <LumoVideoPlayer
              key={activeItem.id}
              uri={activeItem.url}
              style={[
                styles.video,
                {
                  width: width - 24,
                  height: Math.min(height * 0.7, 620),
                },
              ]}
            />
          ) : (
            <View style={styles.empty}>
              <Ionicons
                name="image-outline"
                size={36}
                color="#9AA5B2"
              />
              <Text style={styles.emptyText}>
                Media is unavailable
              </Text>
            </View>
          )}
        </View>

        <View style={styles.controls}>
          {activeItem?.type === 'image' && (
            <View style={styles.zoomControls}>
              <Pressable
                onPress={zoomOut}
                disabled={scale <= 1}
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
                style={[
                  styles.controlButton,
                  scale <= 1 && styles.disabled,
                ]}
              >
                <Ionicons
                  name="remove"
                  size={19}
                  color="#F2F5F7"
                />
              </Pressable>

              <Pressable
                onPress={resetZoom}
                accessibilityRole="button"
                accessibilityLabel="Reset zoom"
                style={styles.zoomLabel}
              >
                <Text style={styles.zoomText}>
                  {Math.round(scale * 100)}%
                </Text>
              </Pressable>

              <Pressable
                onPress={zoomIn}
                disabled={scale >= 3}
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
                style={[
                  styles.controlButton,
                  scale >= 3 && styles.disabled,
                ]}
              >
                <Ionicons
                  name="add"
                  size={19}
                  color="#F2F5F7"
                />
              </Pressable>
            </View>
          )}

          <View style={styles.navigation}>
            <Pressable
              onPress={() => changeMedia(-1)}
              disabled={activeIndex <= 0}
              accessibilityRole="button"
              accessibilityLabel="Previous media"
              style={[
                styles.controlButton,
                activeIndex <= 0 && styles.disabled,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color="#F2F5F7"
              />
            </Pressable>

            <View style={styles.mediaInfo}>
              <Text style={styles.sender} numberOfLines={1}>
                {activeItem?.senderLabel ?? ''}
              </Text>

              <Text style={styles.date}>
                {activeItem
                  ? formatDate(activeItem.createdAt)
                  : ''}
              </Text>
            </View>

            <Pressable
              onPress={() => changeMedia(1)}
              disabled={activeIndex >= items.length - 1}
              accessibilityRole="button"
              accessibilityLabel="Next media"
              style={[
                styles.controlButton,
                activeIndex >= items.length - 1 && styles.disabled,
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color="#F2F5F7"
              />
            </Pressable>
          </View>

          <Pressable
            onPress={handleDownload}
            disabled={!activeItem || !onDownload}
            accessibilityRole="button"
            accessibilityLabel="Download media"
            style={[
              styles.downloadButton,
              (!activeItem || !onDownload) && styles.disabled,
            ]}
          >
            <Ionicons
              name="download-outline"
              size={17}
              color="#090C12"
            />
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090C12',
  },
  header: {
    height: 66,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  indicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#B9C7D6',
  },
  eyebrow: {
    color: '#F2F5F7',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  counter: {
    color: '#9AA5B2',
    fontSize: 11,
    marginTop: 3,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2029',
    borderWidth: 1,
    borderColor: '#2B3440',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    alignSelf: 'center',
  },
  video: {
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#9AA5B2',
    fontSize: 13,
  },
  controls: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  navigation: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  controlButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2029',
    borderWidth: 1,
    borderColor: '#2B3440',
  },
  disabled: {
    opacity: 0.3,
  },
  zoomLabel: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  zoomText: {
    color: '#B9C7D6',
    fontSize: 12,
    fontWeight: '800',
  },
  mediaInfo: {
    flex: 1,
    alignItems: 'center',
  },
  sender: {
    maxWidth: '100%',
    color: '#F2F5F7',
    fontSize: 13,
    fontWeight: '700',
  },
  date: {
    color: '#9AA5B2',
    fontSize: 11,
    marginTop: 4,
  },
  downloadButton: {
    height: 44,
    alignSelf: 'center',
    minWidth: 142,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#B9C7D6',
  },
  downloadText: {
    color: '#090C12',
    fontSize: 12,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
