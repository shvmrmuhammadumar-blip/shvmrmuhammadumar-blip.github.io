import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StudioFrame } from '../../../components/studio/StudioFrame';
import { colors } from '../../../lib/theme';

type ModuleItem = {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  href: string;
};

const moduleGroups: { title: string; items: ModuleItem[] }[] = [
  { title: 'INSIGHTS', items: [
    { title: 'Analytics', subtitle: 'Account performance', icon: 'analytics-outline', href: '/creator-studio/analytics' },
    { title: 'Audience', subtitle: 'Followers and activity', icon: 'people-outline', href: '/creator-studio/audience' },
  ] },
  { title: 'CONTENT', items: [
    { title: 'Content library', subtitle: 'Posts, videos and stories', icon: 'images-outline', href: '/creator-studio/content' },
    { title: 'Planner', subtitle: 'Ideas and publishing queue', icon: 'calendar-outline', href: '/creator-studio/planner' },
  ] },
  { title: 'COMMUNITY', items: [
    { title: 'Community', subtitle: 'Comments and conversations', icon: 'chatbubbles-outline', href: '/creator-studio/community' },
  ] },
  { title: 'GROWTH', items: [
    { title: 'Growth Lab', subtitle: 'Profile and content guidance', icon: 'trending-up-outline', href: '/creator-studio/growth' },
    { title: 'Media Kit', subtitle: 'Shareable creator profile', icon: 'document-text-outline', href: '/creator-studio/media-kit' },
  ] },
  { title: 'BUSINESS', items: [
    { title: 'Monetization', subtitle: 'Earnings and collaborations', icon: 'wallet-outline', href: '/creator-studio/monetization' },
    { title: 'Account', subtitle: 'Professional account settings', icon: 'briefcase-outline', href: '/creator-studio/account' },
  ] },
];

export default function StudioHomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 3 : width >= 650 ? 2 : 1;
  const open = (href: string) => router.push(href as never);

  return (
    <StudioFrame title="Studio" subtitle="Creator and business workspace" icon="layers-outline">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LUMO / STUDIO</Text>
          <Text style={styles.title}>Your workspace</Text>
          <Text style={styles.subtitle}>One place to create, understand and grow.</Text>
        </View>
        <Pressable onPress={() => open('/creator-studio')} style={styles.dashboardButton} accessibilityRole="button">
          <Ionicons name="grid-outline" size={18} color={colors.bg} />
          <Text style={styles.dashboardButtonText}>Open Dashboard</Text>
          <Ionicons name="arrow-up-right-box" size={15} color={colors.bg} />
        </Pressable>
      </View>

      <Pressable onPress={() => open('/creator-studio')} style={styles.dashboardHero} accessibilityRole="button">
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><Ionicons name="pulse-outline" size={22} color={colors.accentStrong} /></View>
          <View style={styles.heroMeta}>
            <Text style={styles.heroLabel}>FULL OVERVIEW</Text>
            <Text style={styles.heroTitle}>Creator Dashboard</Text>
            <Text style={styles.heroSubtitle}>Performance · audience · content · activity</Text>
          </View>
          <View style={styles.heroArrow}><Ionicons name="arrow-forward" size={19} color={colors.accentStrong} /></View>
        </View>
        <View style={styles.heroSignals}>
          <View style={styles.signal}><View style={styles.signalDot} /><Text style={styles.signalText}>Analytics</Text></View>
          <View style={styles.signal}><View style={styles.signalDot} /><Text style={styles.signalText}>Content insights</Text></View>
          <View style={styles.signal}><View style={styles.signalDot} /><Text style={styles.signalText}>Audience growth</Text></View>
          <View style={styles.signal}><View style={styles.signalDot} /><Text style={styles.signalText}>Business tools</Text></View>
        </View>
        <View style={styles.heroChart}>
          {[24, 36, 29, 48, 41, 58, 46, 66, 54, 74, 62, 88, 72, 96, 80, 100].map((height, index) => (
            <View key={index} style={styles.heroChartColumn}>
              <View style={[styles.heroChartBar, { height: (height + '%') as DimensionValue }]} />
            </View>
          ))}
        </View>
      </Pressable>

      {moduleGroups.map((group) => (
        <View key={group.title} style={styles.group}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupCount}>{group.items.length.toString().padStart(2, '0')}</Text>
          </View>
          <View style={[styles.moduleGrid, { flexDirection: columns === 1 ? 'column' : 'row' }]}>
            {group.items.map((item) => (
              <Pressable
                key={item.href}
                onPress={() => open(item.href)}
                style={[styles.moduleCard, columns > 1 && { width: ((100 / columns - 1.2) + '%') as DimensionValue }]}
                accessibilityRole="button"
              >
                <View style={styles.moduleIcon}><Ionicons name={item.icon} size={19} color={colors.accentStrong} /></View>
                <View style={styles.moduleCopy}>
                  <Text style={styles.moduleTitle}>{item.title}</Text>
                  <Text style={styles.moduleSubtitle}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark-outline" size={15} color={colors.dim} />
        <Text style={styles.footerText}>Your LUMO account · one connected workspace</Text>
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 },
  headerCopy: { flex: 1, minWidth: 220, gap: 5 },
  eyebrow: { color: colors.accentStrong, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 11 },
  dashboardButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.accent },
  dashboardButtonText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  dashboardHero: { overflow: 'hidden', minHeight: 214, padding: 20, borderRadius: 19, borderWidth: 1, borderColor: colors.accentDark, backgroundColor: '#111B19', gap: 17 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(145, 184, 163, 0.12)', borderWidth: 1, borderColor: 'rgba(145, 184, 163, 0.2)' },
  heroMeta: { flex: 1, minWidth: 0, gap: 4 },
  heroLabel: { color: colors.accentStrong, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  heroTitle: { color: colors.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  heroSubtitle: { color: colors.muted, fontSize: 10 },
  heroArrow: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(145, 184, 163, 0.1)' },
  heroSignals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  signalDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accentStrong },
  signalText: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  heroChart: { height: 46, flexDirection: 'row', alignItems: 'flex-end', gap: 5, opacity: 0.72 },
  heroChartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  heroChartBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.accentStrong },
  group: { gap: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  groupTitle: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  groupCount: { color: colors.dim, fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  moduleGrid: { flexWrap: 'wrap', gap: 9 },
  moduleCard: { minHeight: 72, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  moduleIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised },
  moduleCopy: { flex: 1, minWidth: 0, gap: 4 },
  moduleTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  moduleSubtitle: { color: colors.dim, fontSize: 9 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 7 },
  footerText: { color: colors.dim, fontSize: 9 },
});