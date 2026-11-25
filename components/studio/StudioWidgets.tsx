import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radii } from '../../lib/theme';
import { StudioPanel } from './StudioFrame';
import { useStudioStyles } from '../../lib/theme-styles';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function StudioMetric({ label, value, icon, note }: {
  label: string; value: string | number; icon: IconName; note?: string;
}) {
  const lumoStyles = useStudioStyles(styles);
  return (
    <StudioPanel style={lumoStyles.metric}>
      <View style={lumoStyles.metricTop}>
        <View style={lumoStyles.metricIcon}><Ionicons name={icon} size={18} color={colors.accentStrong} /></View>
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
  const lumoStyles = useStudioStyles(styles);
  return (
    <View style={lumoStyles.sectionRow}>
      <Text style={lumoStyles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={lumoStyles.sectionAction} accessibilityRole="button">
          <Text style={lumoStyles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function StudioLink({ title, description, icon, href, badge }: {
  title: string; description?: string; icon: IconName; href: string; badge?: string;
}) {
  const lumoStyles = useStudioStyles(styles);
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href as never)} style={lumoStyles.linkRow} accessibilityRole="button">
      <View style={lumoStyles.linkIcon}><Ionicons name={icon} size={20} color={colors.accentStrong} /></View>
      <View style={lumoStyles.linkCopy}>
        <Text style={lumoStyles.linkTitle}>{title}</Text>
        {description ? <Text style={lumoStyles.linkDescription} numberOfLines={2}>{description}</Text> : null}
      </View>
      {badge ? <Text style={lumoStyles.linkBadge}>{badge}</Text> : null}
      <Ionicons name="chevron-forward" size={17} color={colors.dim} />
    </Pressable>
  );
}

export function StudioChip({ label, active, onPress }: {
  label: string; active: boolean; onPress: () => void;
}) {
  const lumoStyles = useStudioStyles(styles);
  return (
    <Pressable
      onPress={onPress}
      style={[lumoStyles.chip, active && lumoStyles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[lumoStyles.chipText, active && lumoStyles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function StudioEmpty({ icon, title, action, onAction }: {
  icon: IconName; title: string; action?: string; onAction?: () => void;
}) {
  const lumoStyles = useStudioStyles(styles);
  return (
    <View style={lumoStyles.empty}>
      <View style={lumoStyles.emptyIcon}><Ionicons name={icon} size={24} color={colors.accentStrong} /></View>
      <Text style={lumoStyles.emptyTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={lumoStyles.emptyAction} accessibilityRole="button">
          <Text style={lumoStyles.emptyActionText}>{action}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accentStrong} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metric: {
    flexGrow: 1,
    flexBasis: 184,
    minWidth: 152,
    minHeight: 148,
    justifyContent: 'space-between',
    padding: 19,
    gap: 13,
    borderRadius: 21,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  metricIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.15 },
  metricValue: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
  metricNote: { color: colors.dim, fontSize: 11, lineHeight: 15 },
  sectionRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.25 },
  sectionAction: { minHeight: 40, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 11 },
  sectionActionText: { color: colors.accentStrong, fontSize: 11, fontWeight: '700' },
  linkRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  linkCopy: { flex: 1, minWidth: 0, gap: 5 },
  linkTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  linkDescription: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  linkBadge: { color: colors.muted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginRight: 3 },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  chipTextActive: { color: colors.bg },
  empty: {
    minHeight: 224,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 26,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  emptyIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 20 },
  emptyAction: { minHeight: 42, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, marginTop: 2 },
  emptyActionText: { color: colors.accentStrong, fontSize: 11, fontWeight: '800' },
});
