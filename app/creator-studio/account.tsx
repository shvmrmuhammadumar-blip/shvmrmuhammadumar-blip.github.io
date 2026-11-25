import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StudioFrame, StudioPanel } from '../../components/studio/StudioFrame';
import { getPlatformRoles, resolvePlatformAccessRole, type PlatformAccessRole, type PlatformRole } from '../../lib/market-official';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { useStudioStyles } from '../../lib/theme-styles';

type AccountType = 'personal' | 'creator' | 'business';
type CreatorSettings = {
  account_type: AccountType;
  category: string | null;
  contact_email: string | null;
  website_url: string | null;
};

const accountTypes: { key: AccountType; label: string; description: string }[] = [
  { key: 'personal', label: 'Personal', description: 'For everyday sharing' },
  { key: 'creator', label: 'Creator', description: 'For audience and content growth' },
  { key: 'business', label: 'Business', description: 'For a brand or organisation' },
];

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
    description: 'Platform development and management access across Lumo.',
    icon: 'code-slash-outline',
  },
};

const emptySettings: CreatorSettings = {
  account_type: 'personal',
  category: '',
  contact_email: '',
  website_url: '',
};

export default function StudioAccountScreen() {
  const lumoStyles = useStudioStyles(styles);
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [settings, setSettings] = useState<CreatorSettings>(emptySettings);
  const [role, setRole] = useState<PlatformAccessRole>('personal');
  const [rawRoles, setRawRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [settingsResult, roles] = await Promise.all([
      supabase.from('creator_settings')
        .select('account_type, category, contact_email, website_url')
        .eq('user_id', userId)
        .maybeSingle(),
      getPlatformRoles(userId),
    ]);
    if (settingsResult.error) throw settingsResult.error;

    const row = settingsResult.data;
    setSettings({
      account_type: (row?.account_type ?? 'personal') as AccountType,
      category: row?.category ?? '',
      contact_email: row?.contact_email ?? '',
      website_url: row?.website_url ?? '',
    });
    setRawRoles(roles);
    setRole(resolvePlatformAccessRole(roles));
    setError('');
    setSaved(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Account settings could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]));

  const update = (field: keyof CreatorSettings, value: string | AccountType) => {
    setSettings((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setError('');
  };

  const save = async () => {
    if (!userId || saving) return;

    const category = settings.category?.trim() ?? '';
    const email = settings.contact_email?.trim() ?? '';
    const rawWebsite = settings.website_url?.trim() ?? '';

    if (category && (category.length < 2 || category.length > 60)) {
      setError('Category must contain 2–60 characters.');
      return;
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setError('Enter a valid contact email address.');
      return;
    }

    let website: string | null = null;
    if (rawWebsite) {
      const candidate = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : 'https://' + rawWebsite;
      try {
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error('invalid');
        website = parsed.toString();
      } catch {
        setError('Enter a valid website address, such as example.com.');
        return;
      }
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { error: saveError } = await supabase.from('creator_settings').upsert({
        user_id: userId,
        account_type: settings.account_type,
        category: category || null,
        contact_email: email || null,
        website_url: website,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (saveError) throw saveError;
      setSettings((current) => ({ ...current, category, contact_email: email, website_url: website ?? '' }));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Account settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const detail = roleDetails[role];

  return (
    <StudioFrame title="Account" subtitle="Creator profile and platform access" icon="person-circle-outline">
      <View style={lumoStyles.headingBlock}>
        <Text style={lumoStyles.heading}>Account settings</Text>
        <Text style={lumoStyles.subheading}>Choose how your profile is presented across Lumo Studio.</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.accentStrong} style={lumoStyles.loading} /> : null}
      {error ? (
        <StudioPanel style={lumoStyles.errorPanel}>
          <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
          <Text style={lumoStyles.errorText}>{error}</Text>
        </StudioPanel>
      ) : null}
      {saved ? (
        <View style={lumoStyles.successLine}>
          <Ionicons name="checkmark-circle" size={17} color={colors.success} />
          <Text style={lumoStyles.successText}>Your Studio account settings have been saved.</Text>
        </View>
      ) : null}

      <StudioPanel style={lumoStyles.formPanel}>
        <View style={lumoStyles.sectionHeading}>
          <View style={lumoStyles.sectionIcon}><Ionicons name="briefcase-outline" size={18} color={colors.accentStrong} /></View>
          <View style={lumoStyles.sectionCopy}>
            <Text style={lumoStyles.sectionTitle}>Account type</Text>
            <Text style={lumoStyles.sectionMeta}>This only changes your Studio classification.</Text>
          </View>
        </View>
        <View style={lumoStyles.typeGrid}>
          {accountTypes.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => update('account_type', item.key)}
              style={[lumoStyles.typeOption, settings.account_type === item.key && lumoStyles.typeOptionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.account_type === item.key }}
            >
              <Text style={[lumoStyles.typeTitle, settings.account_type === item.key && lumoStyles.typeTitleActive]}>{item.label}</Text>
              <Text style={lumoStyles.typeDescription}>{item.description}</Text>
            </Pressable>
          ))}
        </View>

        <View style={lumoStyles.field}>
          <Text style={lumoStyles.fieldLabel}>CATEGORY</Text>
          <TextInput
            value={settings.category ?? ''}
            onChangeText={(value) => update('category', value)}
            placeholder="e.g. Photography, Design, Technology"
            placeholderTextColor={colors.dim}
            style={lumoStyles.input}
            maxLength={60}
            accessibilityLabel="Creator category"
          />
          <Text style={lumoStyles.helper}>Optional · 2–60 characters</Text>
        </View>

        <View style={lumoStyles.field}>
          <Text style={lumoStyles.fieldLabel}>CONTACT EMAIL</Text>
          <TextInput
            value={settings.contact_email ?? ''}
            onChangeText={(value) => update('contact_email', value)}
            placeholder="hello@example.com"
            placeholderTextColor={colors.dim}
            style={lumoStyles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            maxLength={254}
            accessibilityLabel="Studio contact email"
          />
        </View>

        <View style={lumoStyles.field}>
          <Text style={lumoStyles.fieldLabel}>WEBSITE</Text>
          <TextInput
            value={settings.website_url ?? ''}
            onChangeText={(value) => update('website_url', value)}
            placeholder="example.com"
            placeholderTextColor={colors.dim}
            style={lumoStyles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={500}
            accessibilityLabel="Creator website"
          />
        </View>

        <Pressable
          onPress={() => void save()}
          disabled={loading || saving}
          style={[lumoStyles.saveButton, (loading || saving) && lumoStyles.saveButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Save Studio account settings"
        >
          {saving ? <ActivityIndicator color={colors.bg} /> : (
            <>
              <Ionicons name="checkmark" size={17} color={colors.bg} />
              <Text style={lumoStyles.saveText}>Save changes</Text>
            </>
          )}
        </Pressable>
      </StudioPanel>

      <StudioPanel style={lumoStyles.rolePanel}>
        <View style={lumoStyles.sectionHeading}>
          <View style={lumoStyles.sectionIcon}><Ionicons name={detail.icon} size={18} color={colors.accentStrong} /></View>
          <View style={lumoStyles.sectionCopy}>
            <Text style={lumoStyles.sectionTitle}>Platform access</Text>
            <Text style={lumoStyles.sectionMeta}>Permissions are managed separately from your creator type.</Text>
          </View>
          <View style={lumoStyles.activeBadge}><Text style={lumoStyles.activeBadgeText}>ACTIVE</Text></View>
        </View>
        <Text style={lumoStyles.roleTitle}>{detail.title}</Text>
        <Text style={lumoStyles.roleDescription}>{detail.description}</Text>
        {rawRoles.length > 0 ? (
          <View style={lumoStyles.permissionList}>
            {rawRoles.map((item) => (
              <View key={item} style={lumoStyles.permissionRow}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.success} />
                <Text style={lumoStyles.permissionText}>{item === 'admin' ? 'Platform administration' : 'Platform development'}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={lumoStyles.roleNote}>Platform roles cannot be changed here. They are assigned through Lumo’s trusted role-management controls.</Text>
      </StudioPanel>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 5 },
  heading: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  loading: { marginVertical: 22 },
  errorPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: colors.danger },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17 },
  successLine: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.successSoft },
  successText: { flex: 1, color: colors.success, fontSize: 12, fontWeight: '700' },
  formPanel: { gap: 19 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  sectionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  sectionCopy: { flex: 1, minWidth: 0, gap: 4 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  sectionMeta: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  typeOption: { flexGrow: 1, flexBasis: 155, minWidth: 0, minHeight: 88, padding: 13, gap: 6, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  typeOptionActive: { borderColor: colors.accentStrong, backgroundColor: colors.accentSoft },
  typeTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  typeTitleActive: { color: colors.accentStrong },
  typeDescription: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  field: { gap: 7 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, fontSize: 14 },
  helper: { color: colors.dim, fontSize: 11, lineHeight: 15 },
  saveButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: colors.accent },
  saveButtonDisabled: { opacity: 0.55 },
  saveText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  rolePanel: { gap: 13 },
  activeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.successSoft },
  activeBadgeText: { color: colors.success, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  roleTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  roleDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  permissionList: { gap: 8 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permissionText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  roleNote: { color: colors.dim, fontSize: 11, lineHeight: 16 },
});
