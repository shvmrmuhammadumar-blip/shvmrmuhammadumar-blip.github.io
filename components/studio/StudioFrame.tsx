import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { getAppContentWidth, getStudioBodyWidth } from '../../lib/responsive';
import { colors, radii } from '../../lib/theme';
import { useThemedStyles } from "../../lib/theme-styles";

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type NavItem = { label: string; href: string; icon: IconName };

const groups: { label: string; items: NavItem[] }[] = [
  { label: 'WORKSPACE', items: [
    { label: 'Dashboard', href: '/creator-studio', icon: 'grid-outline' },
  ] },
  { label: 'INSIGHTS', items: [
    { label: 'Analytics', href: '/creator-studio/analytics', icon: 'analytics-outline' },
    { label: 'Audience', href: '/creator-studio/audience', icon: 'people-outline' },
  ] },
  { label: 'CONTENT', items: [
    { label: 'Content library', href: '/creator-studio/content', icon: 'images-outline' },
    { label: 'Planner', href: '/creator-studio/planner', icon: 'calendar-outline' },
  ] },
  { label: 'COMMUNITY', items: [{ label: 'Community', href: '/creator-studio/community', icon: 'chatbubbles-outline' }] },
  { label: 'GROWTH', items: [
    { label: 'Growth Lab', href: '/creator-studio/growth', icon: 'trending-up-outline' },
    { label: 'Media Kit', href: '/creator-studio/media-kit', icon: 'document-text-outline' },
  ] },
  { label: 'BUSINESS', items: [
    { label: 'Monetization', href: '/creator-studio/monetization', icon: 'wallet-outline' },
    { label: 'Account', href: '/creator-studio/account', icon: 'briefcase-outline' },
  ] },
];

type Props = { title: string; subtitle?: string; icon?: IconName; wide?: boolean; children: React.ReactNode };

export function StudioFrame({ title, subtitle, icon = 'grid-outline', wide = false, children }: Props) {
  const lumoStyles = useThemedStyles(styles);
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const appContentWidth = getAppContentWidth(width, segments[0] === '(tabs)');
  const bodyWidth = getStudioBodyWidth(appContentWidth);
  const desktop = appContentWidth >= 960;
  const compactHeader = bodyWidth < 520;
  const pathname = usePathname();
  const router = useRouter();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    WORKSPACE: true, INSIGHTS: true, CONTENT: true, COMMUNITY: true, GROWTH: true, BUSINESS: true,
  });

  const active = (item: NavItem) => item.href === '/creator-studio'
    ? pathname === '/creator-studio' || pathname === '/creator-studio/'
    : pathname === item.href || pathname.startsWith(item.href + '/');

  const navItem = (item: NavItem, compact = false) => {
    const selected = active(item);
    return (
      <Pressable
        key={item.href}
        onPress={() => router.push(item.href as never)}
        style={[lumoStyles.navItem, compact && lumoStyles.navItemCompact, selected && lumoStyles.navItemActive]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Ionicons name={item.icon} size={18} color={selected ? colors.accentStrong : colors.muted} />
        <Text numberOfLines={1} style={[lumoStyles.navText, selected && lumoStyles.navTextActive]}>{item.label}</Text>
        {selected && desktop ? <View style={lumoStyles.activeMark} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={lumoStyles.root}>
      <View style={[lumoStyles.topbar, compactHeader && lumoStyles.topbarCompact]}>
        <Pressable onPress={() => router.push('/creator-studio')} style={lumoStyles.brand} accessibilityRole="button">
          <Image source={require('../../assets/lumo-mark.png')} style={lumoStyles.brandMark} contentFit="contain" />
          <View style={lumoStyles.brandCopy}>
            <Text style={lumoStyles.brandName}>LUMO</Text>
            {!compactHeader ? <Text style={lumoStyles.brandSub}>STUDIO</Text> : null}
          </View>
        </Pressable>
        {!compactHeader ? <View style={lumoStyles.topDivider} /> : null}
        <View style={lumoStyles.pageHeading}>
          {!compactHeader ? <View style={lumoStyles.pageIcon}><Ionicons name={icon} size={18} color={colors.accentStrong} /></View> : null}
          <View style={lumoStyles.pageCopy}>
            <Text style={[lumoStyles.pageTitle, compactHeader && lumoStyles.pageTitleCompact]} numberOfLines={1}>{title}</Text>
            {subtitle && !compactHeader ? <Text style={lumoStyles.pageSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </View>
        <Pressable onPress={() => router.push('/profile')} style={[lumoStyles.exitButton, compactHeader && lumoStyles.exitButtonCompact]} accessibilityRole="button">
          <Ionicons name="arrow-up-right-box" size={16} color={colors.muted} />
          {!compactHeader ? <Text style={lumoStyles.exitText}>Lumo</Text> : null}
        </Pressable>
      </View>

      <View style={lumoStyles.main}>
        {desktop ? (
          <View style={lumoStyles.sidebar}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={lumoStyles.sidebarContent}>
              {groups.map((group) => (
                <View key={group.label} style={lumoStyles.navGroup}>
                  <Pressable
                    onPress={() => setExpandedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                    style={lumoStyles.groupHeader}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: Boolean(expandedGroups[group.label]) }}
                  >
                    <Text style={lumoStyles.groupLabel}>{group.label}</Text>
                    <Ionicons name={expandedGroups[group.label] ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.dim} />
                  </Pressable>
                  {expandedGroups[group.label] ? group.items.map((item) => navItem(item)) : null}
                </View>
              ))}
            </ScrollView>
            <View style={lumoStyles.sidebarFooter}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.dim} />
              <Text style={lumoStyles.sidebarFooterText}>Your account workspace</Text>
            </View>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lumoStyles.mobileNav}>
            {groups.flatMap((group) => group.items).map((item) => navItem(item, true))}
          </ScrollView>
        )}
        <ScrollView
          style={lumoStyles.body}
          contentContainerStyle={[lumoStyles.bodyContent, { paddingHorizontal: bodyWidth < 520 ? 16 : bodyWidth < 900 ? 22 : 30 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[lumoStyles.contentWidth, wide && lumoStyles.contentWidthWide]}>{children}</View>
        </ScrollView>
      </View>
    </View>
  );
}

export function StudioPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  const lumoStyles = useThemedStyles(styles);
  return <View style={[lumoStyles.panel, style]}>{children}</View>;
}

export const studioStyles = StyleSheet.create({
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  sectionMeta: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metricValue: { color: colors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  smallLabel: { color: colors.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  divider: { height: 1, backgroundColor: colors.border },
  accentText: { color: colors.accentStrong, fontSize: 12, fontWeight: '800' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, gap: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg },
  topbarCompact: { minHeight: 60, paddingHorizontal: 14, gap: 9 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 112 },
  brandMark: { width: 30, height: 30 },
  brandCopy: { gap: 1 },
  brandName: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.3 },
  brandSub: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 2.2 },
  topDivider: { width: 1, height: 34, backgroundColor: colors.border },
  pageHeading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  pageIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  pageCopy: { flex: 1, minWidth: 0, gap: 2 },
  pageTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  pageTitleCompact: { fontSize: 14, letterSpacing: -0.1 },
  pageSubtitle: { color: colors.muted, fontSize: 10 },
  exitButton: { minHeight: 38, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  exitButtonCompact: { width: 36, minHeight: 36, paddingHorizontal: 0 },
  exitText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  main: { flex: 1, minHeight: 0, flexDirection: 'row' },
  sidebar: { width: 218, flexShrink: 0, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, justifyContent: 'space-between' },
  sidebarContent: { paddingVertical: 20, paddingHorizontal: 13, gap: 20 },
  navGroup: { gap: 4 },
  groupHeader: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 3 },
  groupLabel: { color: colors.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  navItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', position: 'relative' },
  navItemActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  navText: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '600' },
  navTextActive: { color: colors.text, fontWeight: '800' },
  activeMark: { width: 3, height: 18, borderRadius: 4, backgroundColor: colors.accentStrong, position: 'absolute', right: -1 },
  sidebarFooter: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 23, borderTopWidth: 1, borderTopColor: colors.border },
  sidebarFooterText: { color: colors.dim, fontSize: 10, fontWeight: '600' },
  mobileNav: { paddingHorizontal: 14, paddingVertical: 10, gap: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  navItemCompact: { minHeight: 36, flexShrink: 0, paddingHorizontal: 12, gap: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  body: { flex: 1, minWidth: 0 },
  bodyContent: { paddingTop: 26, paddingBottom: 48, alignItems: 'center' },
  contentWidth: { width: '100%', maxWidth: 1380, gap: 20 },
  contentWidthWide: { maxWidth: 1680, gap: 22 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 18 },
});
