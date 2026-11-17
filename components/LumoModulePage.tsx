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
import { useRouter } from 'expo-router';
import { colors } from '../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  iconName: IconName;
  children?: React.ReactNode;
};

export function LumoPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function LumoModulePage({
  eyebrow,
  title,
  description,
  iconName,
  children,
}: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 520 ? 16 : width < 900 ? 24 : 36;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: horizontalPadding },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.maxWidth}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={18} color={colors.muted} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.headingRow}>
          <View style={styles.iconWrap}>
            <Ionicons name={iconName} size={22} color={colors.accentStrong} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
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
  return (
    <LumoModulePage
      eyebrow={eyebrow}
      title={title}
      description={description}
      iconName={iconName}
    >
      <LumoPanel style={styles.statusPanel}>
        <View style={styles.statusIcon}>
          <Ionicons name="construct-outline" size={22} color={colors.muted} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>Not connected yet</Text>
          <Text style={styles.statusBody}>
            This module is not backed by a live service in the supplied project. No demo transactions or placeholder records are shown.
          </Text>
        </View>
      </LumoPanel>

      <Text style={styles.sectionLabel}>REQUIRED BEFORE ACTIVATION</Text>
      <LumoPanel style={styles.requirementsPanel}>
        {requirements.map((requirement, index) => (
          <View key={`${index}-${requirement}`} style={styles.requirementRow}>
            <View style={styles.requirementIndex}>
              <Text style={styles.requirementIndexText}>{index + 1}</Text>
            </View>
            <Text style={styles.requirementText}>{requirement}</Text>
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
