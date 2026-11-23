import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radii } from '../../lib/theme';
import { StudioPanel } from './StudioFrame';
import { useThemedStyles } from "../../lib/theme-styles";

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function StudioMetric({ label, value, icon, note }: {
  label: string; value: string | number; icon: IconName; note?: string;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <StudioPanel style={lumoStyles.metric}>
      <View style={lumoStyles.metricTop}>
        <View style={lumoStyles.metricIcon}><Ionicons name={icon} size={17} color={colors.muted} /></View>
        <Text style={lumoStyles.metricLabel}>{label}</Text>
      </View>
      <Text style={lumoStyles.metricValue}>{value}</Text>
      {note ? <Text style={lumoStyles.metricNote}>{note}</Text> : null}
    </StudioPanel>
  );
}

export function StudioSection({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.sectionRow}>
      <Text style={lumoStyles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={lumoStyles.sectionAction} accessibilityRole="button">
          <Text style={lumoStyles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.accentStrong} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function StudioLink({ title, description, icon, href, badge }: {
  title: string; description?: string; icon: IconName; href: string; badge?: string;
}) {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href as never)} style={lumoStyles.linkRow} accessibilityRole="button">
      <View style={lumoStyles.linkIcon}><Ionicons name={icon} size={19} color={colors.accentStrong} /></View>
      <View style={lumoStyles.linkCopy}>
        <Text style={lumoStyles.linkTitle}>{title}</Text>
        {description ? <Text style={lumoStyles.linkDescription} numberOfLines={1}>{description}</Text> : null}
      </View>
      {badge ? <Text style={lumoStyles.linkBadge}>{badge}</Text> : null}
      <Ionicons name="chevron-forward" size={17} color={colors.dim} />
    </Pressable>
  );
}

export function StudioChip({ label, active, onPress }: {
  label: string; active: boolean; onPress: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <Pressable onPress={onPress} style={[lumoStyles.chip, active && lumoStyles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[lumoStyles.chipText, active && lumoStyles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function StudioEmpty({ icon, title, action, onAction }: {
  icon: IconName; title: string; action?: string; onAction?: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.empty}>
      <View style={lumoStyles.emptyIcon}><Ionicons name={icon} size={22} color={colors.muted} /></View>
      <Text style={lumoStyles.emptyTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={lumoStyles.emptyAction} accessibilityRole="button">
          <Text style={lumoStyles.emptyActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { flexGrow: 1, flexBasis: 160, minWidth: 145, minHeight: 126, justifyContent: 'space-between', padding: 16 },
  metricTop: { gap: 10 },
  metricIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surfaceRaised },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.25 },
  metricValue: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
  metricNote: { color: colors.dim, fontSize: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  sectionAction: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { color: colors.accentStrong, fontSize: 11, fontWeight: '700' },
  linkRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised },
  linkCopy: { flex: 1, minWidth: 0, gap: 4 },
  linkTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  linkDescription: { color: colors.muted, fontSize: 10 },
  linkBadge: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginRight: 4 },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: colors.bg },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  emptyIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.surfaceRaised },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  emptyAction: { minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, marginTop: 2 },
  emptyActionText: { color: colors.accentStrong, fontSize: 11, fontWeight: '800' },
});
