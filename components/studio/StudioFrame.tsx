import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { getAppContentWidth, getStudioBodyWidth } from '../../lib/responsive';
import { colors, radii } from '../../lib/theme';
import { useStudioStyles } from '../../lib/theme-styles';

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
  { label: 'COMMUNITY', items: [
    { label: 'Community', href: '/creator-studio/community', icon: 'chatbubbles-outline' },
  ] },
  { label: 'GROWTH', items: [
    { label: 'Growth Lab', href: '/creator-studio/growth', icon: 'trending-up-outline' },
    { label: 'Media Kit', href: '/creator-studio/media-kit', icon: 'document-text-outline' },
  ] },
  { label: 'BUSINESS', items: [
    { label: 'Monetization', href: '/creator-studio/monetization', icon: 'wallet-outline' },
    { label: 'Account', href: '/creator-studio/account', icon: 'briefcase-outline' },
  ] },
];

const allItems = groups.flatMap((group) => group.items);

type Props = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  wide?: boolean;
  children: React.ReactNode;
};

export function StudioFrame({ title, subtitle, icon = 'grid-outline', wide = false, children }: Props) {
  const lumoStyles = useStudioStyles(styles);
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const appContentWidth = getAppContentWidth(width, segments[0] === '(tabs)');
  const bodyWidth = getStudioBodyWidth(appContentWidth);
  const desktop = appContentWidth >= 1260;
  const compactHeader = appContentWidth < 560;
  const pathname = usePathname();
  const router = useRouter();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    WORKSPACE: true,
    INSIGHTS: true,
    CONTENT: true,
    COMMUNITY: true,
    GROWTH: true,
    BUSINESS: true,
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
        style={[
          lumoStyles.navItem,
          compact && lumoStyles.navItemCompact,
          selected && lumoStyles.navItemActive,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Ionicons
          name={item.icon}
          size={compact ? 17 : 18}
          color={selected ? colors.accentStrong : colors.muted}
        />
        <Text numberOfLines={1} style={[lumoStyles.navText, selected && lumoStyles.navTextActive]}>
          {item.label}
        </Text>
        {selected && !compact ? <View style={lumoStyles.activeMark} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={lumoStyles.root}>
      <View style={[lumoStyles.topbar, compactHeader && lumoStyles.topbarCompact]}>
        <Pressable
          onPress={() => router.push('/creator-studio')}
          style={lumoStyles.brand}
          accessibilityRole="button"
          accessibilityLabel="Lumo Studio home"
        >
          <Image source={require('../../assets/lumo-mark.png')} style={lumoStyles.brandMark} contentFit="contain" />
          <View style={lumoStyles.brandCopy}>
            <Text style={lumoStyles.brandName}>LUMO</Text>
            <Text style={lumoStyles.brandSub}>STUDIO</Text>
          </View>
        </Pressable>

        <View style={lumoStyles.topDivider} />

        <View style={lumoStyles.pageHeading}>
          <View style={[lumoStyles.pageIcon, compactHeader && lumoStyles.pageIconCompact]}>
            <Ionicons name={icon} size={compactHeader ? 16 : 19} color={colors.accentStrong} />
          </View>
          <View style={lumoStyles.pageCopy}>
            <Text style={[lumoStyles.pageTitle, compactHeader && lumoStyles.pageTitleCompact]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={lumoStyles.pageSubtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/profile')}
          style={[lumoStyles.exitButton, compactHeader && lumoStyles.exitButtonCompact]}
          accessibilityRole="button"
          accessibilityLabel="Return to Lumo"
        >
          <Ionicons name="arrow-up-right-box" size={17} color={colors.text} />
          {!compactHeader ? <Text style={lumoStyles.exitText}>Open Lumo</Text> : null}
        </Pressable>
      </View>

      <View style={lumoStyles.main}>
        {desktop ? (
          <View style={lumoStyles.sidebar}>
            <ScrollView
              style={lumoStyles.sidebarScroll}
              contentContainerStyle={lumoStyles.sidebarContent}
              showsVerticalScrollIndicator={false}
            >
              {groups.map((group) => (
                <View key={group.label} style={lumoStyles.navGroup}>
                  <Pressable
                    onPress={() => setExpandedGroups((current) => ({
                      ...current,
                      [group.label]: !current[group.label],
                    }))}
                    style={lumoStyles.groupHeader}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: Boolean(expandedGroups[group.label]) }}
                  >
                    <Text style={lumoStyles.groupLabel}>{group.label}</Text>
                    <Ionicons
                      name={expandedGroups[group.label] ? 'chevron-down' : 'chevron-forward'}
                      size={13}
                      color={colors.dim}
                    />
                  </Pressable>
                  {expandedGroups[group.label] ? group.items.map((item) => navItem(item)) : null}
                </View>
              ))}
            </ScrollView>

            <View style={lumoStyles.sidebarFooter}>
              <View style={lumoStyles.footerStatus} />
              <View style={lumoStyles.footerCopy}>
                <Text style={lumoStyles.footerTitle}>Workspace ready</Text>
                <Text style={lumoStyles.sidebarFooterText}>Your creator space</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={lumoStyles.workspace}>
          {!desktop ? (
            <View style={lumoStyles.mobileNavShell}>
              <ScrollView
                horizontal
                style={lumoStyles.mobileNavScroll}
                contentContainerStyle={lumoStyles.mobileNav}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {allItems.map((item) => navItem(item, true))}
              </ScrollView>
            </View>
          ) : null}

          <ScrollView
            style={lumoStyles.body}
            contentContainerStyle={[
              lumoStyles.bodyContent,
              compactHeader && lumoStyles.bodyContentCompact,
              { paddingHorizontal: bodyWidth < 560 ? 16 : bodyWidth < 920 ? 24 : 32 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[
              lumoStyles.contentWidth,
              wide && lumoStyles.contentWidthWide,
              compactHeader && lumoStyles.contentWidthCompact,
            ]}>
              {children}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

export function StudioPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  const lumoStyles = useStudioStyles(styles);
  return <View style={[lumoStyles.panel, style]}>{children}</View>;
}

export const studioStyles = StyleSheet.create({
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.25 },
  sectionMeta: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metricValue: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  smallLabel: { color: colors.dim, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  divider: { height: 1, backgroundColor: colors.border },
  accentText: { color: colors.accentStrong, fontSize: 12, fontWeight: '800' },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
  topbar: {
    width: '100%',
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  topbarCompact: {
    minHeight: 66,
    paddingHorizontal: 16,
    gap: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 132,
    flexShrink: 0,
  },
  brandMark: { width: 36, height: 36 },
  brandCopy: { gap: 2 },
  brandName: { color: colors.text, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  brandSub: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2.4 },
  topDivider: { width: 1, height: 38, backgroundColor: colors.border },
  pageHeading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageIconCompact: { width: 36, height: 36, borderRadius: 12 },
  pageCopy: { flex: 1, minWidth: 0, gap: 3 },
  pageTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  pageTitleCompact: { fontSize: 15 },
  pageSubtitle: { color: colors.muted, fontSize: 11 },
  exitButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    flexShrink: 0,
  },
  exitButtonCompact: { width: 40, minHeight: 40, paddingHorizontal: 0 },
  exitText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  main: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  sidebar: {
    width: 244,
    flexBasis: 244,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 244,
    minHeight: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'space-between',
  },
  sidebarScroll: { flex: 1, minHeight: 0 },
  sidebarContent: { paddingVertical: 22, paddingHorizontal: 16, gap: 18 },
  navGroup: { gap: 5 },
  groupHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 3,
  },
  groupLabel: { color: colors.dim, fontSize: 10, fontWeight: '900', letterSpacing: 1.45 },
  navItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  navText: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '700' },
  navTextActive: { color: colors.text, fontWeight: '800' },
  activeMark: {
    width: 3,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.accentStrong,
    position: 'absolute',
    right: -1,
  },
  sidebarFooter: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerStatus: { width: 8, height: 8, borderRadius: 5, backgroundColor: colors.success },
  footerCopy: { gap: 3 },
  footerTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  sidebarFooterText: { color: colors.dim, fontSize: 10.5 },
  workspace: {
    flex: 1,
    width: 'auto',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
  mobileNavShell: {
    width: '100%',
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  mobileNavScroll: { flexGrow: 0, flexShrink: 0 },
  mobileNav: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  navItemCompact: {
    minHeight: 40,
    flexShrink: 0,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  body: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
  bodyContent: {
    width: '100%',
    flexGrow: 1,
    paddingTop: 32,
    paddingBottom: 52,
    alignItems: 'center',
  },
  bodyContentCompact: { paddingTop: 22, paddingBottom: 36 },
  contentWidth: { width: '100%', maxWidth: 1480, gap: 24 },
  contentWidthWide: { maxWidth: 1640, gap: 26 },
  contentWidthCompact: { gap: 18 },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 20,
  },
});
