import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioSection } from '../../../components/studio/StudioWidgets';
import { colors } from '../../../lib/theme';

export default function StudioMonetizationScreen() {
  const router = useRouter();
  return (
    <StudioFrame title="Monetization" subtitle="Creator earnings and payouts" icon="wallet-outline">
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>Monetization</Text>
        <Text style={styles.subheading}>Earnings appear here when Lumo creator payouts are enabled.</Text>
      </View>

      <StudioPanel style={styles.statusPanel}>
        <View style={styles.statusIcon}><Ionicons name="wallet-outline" size={22} color={colors.muted} /></View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>Creator payouts are not connected</Text>
          <Text style={styles.statusText}>No estimated earnings or payment totals are shown until Lumo payment services are active.</Text>
        </View>
        <View style={styles.statusBadge}><Text style={styles.statusBadgeText}>INACTIVE</Text></View>
      </StudioPanel>

      <StudioSection title="Creator revenue tools" />
      <View style={styles.toolList}>
        <View style={styles.toolRow}>
          <View style={styles.toolIcon}><Ionicons name="gift-outline" size={18} color={colors.muted} /></View>
          <View style={styles.toolCopy}><Text style={styles.toolTitle}>Gifts & tips</Text><Text style={styles.toolMeta}>Not available yet</Text></View>
          <Ionicons name="lock-closed-outline" size={15} color={colors.dim} />
        </View>
        <View style={styles.toolRow}>
          <View style={styles.toolIcon}><Ionicons name="people-outline" size={18} color={colors.muted} /></View>
          <View style={styles.toolCopy}><Text style={styles.toolTitle}>Paid subscriptions</Text><Text style={styles.toolMeta}>Not available yet</Text></View>
          <Ionicons name="lock-closed-outline" size={15} color={colors.dim} />
        </View>
        <View style={styles.toolRow}>
          <View style={styles.toolIcon}><Ionicons name="briefcase-outline" size={18} color={colors.muted} /></View>
          <View style={styles.toolCopy}><Text style={styles.toolTitle}>Brand campaigns</Text><Text style={styles.toolMeta}>Use your media kit to introduce your profile</Text></View>
          <Pressable onPress={() => router.push('/studio/media-kit')} hitSlop={8}><Ionicons name="chevron-forward" size={16} color={colors.accentStrong} /></Pressable>
        </View>
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  statusPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 16 },
  statusIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.surfaceRaised },
  statusCopy: { flex: 1, gap: 5 },
  statusTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  statusText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.surfaceRaised },
  statusBadgeText: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  toolList: { paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.surface },
  toolRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  toolIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised },
  toolCopy: { flex: 1, gap: 4 },
  toolTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  toolMeta: { color: colors.muted, fontSize: 9 },
});
