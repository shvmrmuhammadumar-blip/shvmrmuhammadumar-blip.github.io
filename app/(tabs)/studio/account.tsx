import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { getPlatformRoles, resolvePlatformAccessRole, type PlatformAccessRole, type PlatformRole } from '../../../lib/market-official';
import { useAuth } from '../../../lib/auth';
import { colors } from '../../../lib/theme';

const roleDetails: Record<PlatformAccessRole, { title: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  personal: {
    title: 'Personal',
    description: 'Standard Lumo account. Platform management controls are not available.',
    icon: 'person-outline',
  },
  admin: {
    title: 'Admin',
    description: 'Moderation and delegated platform management access.',
    icon: 'shield-checkmark-outline',
  },
  developer: {
    title: 'Developer',
    description: 'Full platform development and management access across Lumo.',
    icon: 'code-slash-outline',
  },
};

export default function StudioAccountScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [role, setRole] = useState<PlatformAccessRole>('personal');
  const [rawRoles, setRawRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const roles = await getPlatformRoles(userId);
    setRawRoles(roles);
    setRole(resolvePlatformAccessRole(roles));
    setError('');
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Platform access could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const detail = roleDetails[role];

  return (
    <StudioFrame title="Platform access" subtitle="Your Lumo account role" icon="shield-checkmark-outline">
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>Platform role</Text>
        <Text style={styles.subheading}>Your access is assigned by Lumo platform permissions.</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 20 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error ? (
        <>
          <StudioPanel style={styles.rolePanel}>
            <View style={styles.roleTop}>
              <View style={styles.roleIcon}>
                <Ionicons name={detail.icon} size={23} color={colors.accentStrong} />
              </View>
              <View style={styles.roleCopy}>
                <Text style={styles.roleTitle}>{detail.title}</Text>
                <Text style={styles.roleDescription}>{detail.description}</Text>
              </View>
              <View style={styles.status}><Text style={styles.statusText}>ACTIVE</Text></View>
            </View>
          </StudioPanel>

          <StudioPanel style={styles.scopePanel}>
            <Text style={styles.sectionTitle}>Role boundaries</Text>
            <View style={styles.scopeRow}>
              <Ionicons name="globe-outline" size={17} color={colors.accentStrong} />
              <View style={styles.scopeCopy}>
                <Text style={styles.scopeTitle}>Lumo platform</Text>
                <Text style={styles.scopeDescription}>Personal · Admin · Developer</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.scopeRow}>
              <Ionicons name="people-outline" size={17} color={colors.accentStrong} />
              <View style={styles.scopeCopy}>
                <Text style={styles.scopeTitle}>Groups and channels</Text>
                <Text style={styles.scopeDescription}>Member · Admin · Owner</Text>
              </View>
            </View>
          </StudioPanel>

          {role === 'developer' ? (
            <StudioPanel style={styles.developerPanel}>
              <Ionicons name="code-slash-outline" size={19} color={colors.accentStrong} />
              <View style={styles.developerCopy}>
                <Text style={styles.developerTitle}>Developer access enabled</Text>
                <Text style={styles.developerText}>Platform-level tools and management actions are available. Group and channel membership roles remain separate.</Text>
              </View>
            </StudioPanel>
          ) : null}

          <Text style={styles.note}>Platform roles cannot be changed from this screen. They are assigned through Lumo’s trusted role-management controls.</Text>
          <Text style={styles.debugMeta}>ACTIVE PERMISSIONS: {rawRoles.length ? rawRoles.map((item) => item.toUpperCase()).join(' · ') : 'PERSONAL'}</Text>
        </>
      ) : null}
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 11 },
  rolePanel: { padding: 18 },
  roleTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  roleIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.surfaceRaised },
  roleCopy: { flex: 1, gap: 4 },
  roleTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  roleDescription: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  statusText: { color: colors.success, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  scopePanel: { gap: 14 },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  scopeCopy: { flex: 1, gap: 3 },
  scopeTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  scopeDescription: { color: colors.muted, fontSize: 10 },
  divider: { height: 1, backgroundColor: colors.border },
  developerPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderColor: colors.accentDark },
  developerCopy: { flex: 1, gap: 4 },
  developerTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  developerText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  note: { color: colors.dim, fontSize: 9, lineHeight: 14 },
  debugMeta: { color: colors.dim, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
});
