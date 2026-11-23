import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
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
  const colorScheme = theme === 'light' ? 'light' : 'dark';
  const html = useMemo(() => uri ? buildGiftViewerHtml(uri, posterUri, palette.surface, colorScheme) : '', [uri, posterUri, palette.surface, colorScheme]);

  if (!uri) return null;

  return (
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      allowsInlineMediaPlayback
      style={[lumoStyles.webview, style]}
      containerStyle={[lumoStyles.container, style]}
      accessibilityLabel={label}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: colors.surface },
});
