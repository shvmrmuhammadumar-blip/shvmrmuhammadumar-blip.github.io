import React from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../lib/theme';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  hasStory?: boolean;
  storySeen?: boolean;
  online?: boolean;
};

export default function Avatar({
  uri,
  name,
  size = 36,
  hasStory = false,
  storySeen = false,
  online = false,
}: Props) {
  const content = uri ? (
    <Image
      source={{ uri }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceRaised,
      }}
      contentFit="cover"
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.bg, fontWeight: '900', fontSize: size * 0.42 }}>
        {(name?.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );

  const dotSize = Math.max(9, Math.round(size * 0.26));

  if (hasStory) {
    const ringPadding = 2.5;
    const ringBorder = 2;
    const ringColor = storySeen ? colors.border : colors.lime;
    return (
      <View style={{ position: 'relative', width: size + (ringPadding + ringBorder) * 2, height: size + (ringPadding + ringBorder) * 2, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            padding: ringPadding,
            borderRadius: (size + (ringPadding + ringBorder) * 2) / 2,
            borderWidth: ringBorder,
            borderColor: ringColor,
            backgroundColor: colors.bg,
          }}
        >
          {content}
        </View>
        {online && (
          <View
            style={{
              position: 'absolute',
              right: 1,
              bottom: 1,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: colors.lime,
              borderWidth: 1.5,
              borderColor: colors.bg,
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      {content}
      {online && (
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: colors.lime,
            borderWidth: 1.5,
            borderColor: colors.bg,
          }}
        />
      )}
    </View>
  );
}
