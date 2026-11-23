import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { colors } from '../lib/theme';
import { usePreferences } from '../lib/preferences';
import { getAppContentWidth } from '../lib/responsive';
import { useThemedStyles } from "../lib/theme-styles";

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  iconName: IconName;
  children?: React.ReactNode;
};

export function LumoPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  const lumoStyles = useThemedStyles(styles);
  const { palette } = usePreferences();
  return <View style={[lumoStyles.panel, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

export function LumoModulePage({
  eyebrow,
  title,
  description,
  iconName,
  children,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { palette } = usePreferences();
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const contentWidth = getAppContentWidth(width, segments[0] === '(tabs)');
  const horizontalPadding = contentWidth < 520 ? 16 : contentWidth < 900 ? 24 : 36;

  return (
    <ScrollView
      style={[lumoStyles.root, { backgroundColor: palette.bg }]}
      contentContainerStyle={[
        lumoStyles.content,
        { paddingHorizontal: horizontalPadding },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={lumoStyles.maxWidth}>
        <Pressable
          onPress={() => router.back()}
          style={[lumoStyles.backButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={18} color={palette.muted} />
          <Text style={[lumoStyles.backText, { color: palette.muted }]}>Back</Text>
        </Pressable>

        <View style={lumoStyles.headingRow}>
          <View style={[lumoStyles.iconWrap, { backgroundColor: palette.glass, borderColor: palette.glassBorder }]}>
            <Ionicons name={iconName} size={22} color={palette.accentStrong} />
          </View>
          <View style={lumoStyles.headingCopy}>
            <Text style={[lumoStyles.eyebrow, { color: palette.muted }]}>{eyebrow.toUpperCase()}</Text>
            <Text style={[lumoStyles.title, { color: palette.text }]}>{title}</Text>
            <Text style={[lumoStyles.description, { color: palette.muted }]}>{description}</Text>
          </View>
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

export function UnavailableModule({
  eyebrow,
  title,
  description,
  iconName,
  requirements,
}: Props & { requirements: string[] }) {
  const lumoStyles = useThemedStyles(styles);
  const { palette } = usePreferences();
  return (
    <LumoModulePage
      eyebrow={eyebrow}
      title={title}
      description={description}
      iconName={iconName}
    >
      <LumoPanel style={lumoStyles.statusPanel}>
        <View style={lumoStyles.statusIcon}>
          <Ionicons name="construct-outline" size={22} color={palette.muted} />
        </View>
        <View style={lumoStyles.statusCopy}>
          <Text style={lumoStyles.statusTitle}>Not connected yet</Text>
          <Text style={lumoStyles.statusBody}>
            This module is not backed by a live service in the supplied project. No demo transactions or placeholder records are shown.
          </Text>
        </View>
      </LumoPanel>

      <Text style={lumoStyles.sectionLabel}>REQUIRED BEFORE ACTIVATION</Text>
      <LumoPanel style={lumoStyles.requirementsPanel}>
        {requirements.map((requirement, index) => (
          <View key={`${index}-${requirement}`} style={lumoStyles.requirementRow}>
            <View style={lumoStyles.requirementIndex}>
              <Text style={lumoStyles.requirementIndexText}>{index + 1}</Text>
            </View>
            <Text style={lumoStyles.requirementText}>{requirement}</Text>
          </View>
        ))}
      </LumoPanel>
    </LumoModulePage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 12, paddingBottom: 42, alignItems: 'center' },
  maxWidth: { width: '100%', maxWidth: 1160, gap: 22 },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: { flex: 1, minWidth: 0, gap: 5 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 720 },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
  },
  statusPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 4 },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1, gap: 5 },
  statusTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statusBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  sectionLabel: { color: colors.dim, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: -12 },
  requirementsPanel: { gap: 14 },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requirementIndex: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requirementIndexText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  requirementText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
});
