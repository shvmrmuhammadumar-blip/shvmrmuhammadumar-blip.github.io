import React, { createElement } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { buildGiftViewerHtml } from '../lib/gift-viewer-html';
import { colors } from '../lib/theme';
import { useThemedStyles } from "../lib/theme-styles";
import { usePreferences } from '../lib/preferences';

type Props = {
  uri: string | null | undefined;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
  label?: string;
};

export default function GiftModelViewer({ uri, posterUri, style, label = 'Interactive 3D gift' }: Props) {
  const lumoStyles = useThemedStyles(styles);
  const { palette, theme } = usePreferences();
  if (!uri) return null;

  return (
    <View style={[lumoStyles.container, style]}>
      {createElement('iframe' as any, {
        title: label,
        srcDoc: buildGiftViewerHtml(uri, posterUri, palette.surface, theme === 'light' ? 'light' : 'dark'),
        loading: 'lazy',
        allow: 'fullscreen',
        referrerPolicy: 'no-referrer',
        style: lumoStyles.frame,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: colors.surface },
  frame: { width: '100%', height: '100%', display: 'block', border: 0, backgroundColor: colors.surface } as any,
});
