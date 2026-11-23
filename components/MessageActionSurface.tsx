import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


type Props = {
  children: ReactNode;
  onOpenActions: () => void;
  enabled?: boolean;
  align?: 'flex-start' | 'flex-end';
};

export default function MessageActionSurface({
  children,
  onOpenActions,
  enabled = true,
  align = 'flex-start',
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [hovered, setHovered] = useState(false);

  const handleContextMenu = (event: any) => {
    event.preventDefault?.();
    event.stopPropagation?.();

    if (enabled) {
      onOpenActions();
    }
  };

  return (
    <Pressable
      style={[lumoStyles.container, { alignSelf: align }]}
      onHoverIn={
        Platform.OS === 'web' && enabled
          ? () => setHovered(true)
          : undefined
      }
      onHoverOut={
        Platform.OS === 'web' && enabled
          ? () => setHovered(false)
          : undefined
      }
      {...(
        Platform.OS === 'web' && enabled
          ? ({ onContextMenu: handleContextMenu } as any)
          : {}
      )}
    >
      {children}

      {Platform.OS === 'web' && enabled && (
        <Pressable
          onPress={onOpenActions}
          onHoverIn={() => setHovered(true)}
          style={({ pressed }) => [
            lumoStyles.moreButton,
            align === 'flex-end'
              ? lumoStyles.moreButtonStart
              : lumoStyles.moreButtonEnd,
            hovered && lumoStyles.moreButtonHovered,
            pressed && lumoStyles.moreButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Message actions"
          accessibilityHint="Open reply, forward, reaction and delete options"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={18}
            color={resolveThemeColor("#F2F5F7", "color")}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    maxWidth: '100%',
  },
  moreButton: {
    position: 'absolute',
    top: 4,
    zIndex: 50,
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20251C',
    borderWidth: 1,
    borderColor: '#414A35',
  },
  moreButtonStart: {
    left: -35,
  },
  moreButtonEnd: {
    right: -35,
  },
  moreButtonHovered: {
    backgroundColor: '#303A27',
    borderColor: '#B9C7D6',
  },
  moreButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
});