import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GiftModelViewer from '../../components/GiftModelViewer';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { getPlatformRoles } from '../../lib/market-official';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import type { GiftRarity } from '../../lib/gifts';
import { useThemedStyles } from "../../lib/theme-styles";

const db = supabase as any;
const BUCKET = 'gift-assets';
const MAX_GLB_BYTES = 100 * 1024 * 1024;
const rarities: GiftRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

type Asset = { uri: string; name: string; size?: number; mimeType?: string };
type Gift = { id: string; title: string; slug: string; coin_price: number; rarity: GiftRarity; is_published: boolean; asset_path: string; preview_path: string | null };

function slugify(value: string) {
  return value.normalize('NFKD').toLowerCase().trim()
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 72);
}
function extension(name: string) { return name.split('.').pop()?.toLowerCase() ?? ''; }

async function uploadAsset(asset: Asset, path: string, contentType: string) {
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Selected file could not be read.');
  const blob = await response.blob();
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
}

export default function GiftsManageScreen() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const [roles, setRoles] = useState<string[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [giftTitle, setGiftTitle] = useState('');
  const [giftDescription, setGiftDescription] = useState('');
  const [coinPrice, setCoinPrice] = useState('');
  const [rarity, setRarity] = useState<GiftRarity>('common');
  const [glbFile, setGlbFile] = useState<Asset | null>(null);
  const [previewFile, setPreviewFile] = useState<Asset | null>(null);

  const canManage = roles.some((role) => ['owner', 'developer', 'admin'].includes(role));

  const load = useCallback(async () => {
    if (!userId) { setRoles([]); setGifts([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [nextRoles, giftResult] = await Promise.all([
        getPlatformRoles(userId),
        db.from('gift_catalog').select('id, title, slug, coin_price, rarity, is_published, asset_path, preview_path').order('created_at', { ascending: false }),
      ]);
      if (giftResult.error) throw giftResult.error;
      setRoles(nextRoles);
      setGifts((giftResult.data ?? []).map((item: Gift) => ({ ...item, coin_price: Number(item.coin_price) })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Gift management data could not be loaded.'); }
    finally { setLoading(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pickGlb = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (extension(asset.name) !== 'glb') { setError('Only .glb files are accepted. Extract the GLB from ZIP first.'); return; }
      if (asset.size != null && asset.size > MAX_GLB_BYTES) { setError('GLB file must be 100 MB or smaller.'); return; }
      setGlbFile({ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not choose the GLB file.'); }
  };

  const pickPreview = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], multiple: false, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension(asset.name))) { setError('Preview must be PNG, JPG or WebP.'); return; }
      if (asset.size != null && asset.size > 12 * 1024 * 1024) { setError('Preview image must be 12 MB or smaller.'); return; }
      setPreviewFile({ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not choose preview image.'); }
  };

  const createGift = async () => {
    const title = giftTitle.trim();
    const slug = slugify(title);
    const price = Number(coinPrice);
    if (title.length < 2 || !slug) { setError('Enter a valid gift title.'); return; }
    if (!Number.isSafeInteger(price) || price <= 0) { setError('Coin price must be a positive whole number.'); return; }
    if (!glbFile) { setError('Choose a GLB 3D model first.'); return; }
    setSaving(true); setError(''); setNotice('');
    let glbPath: string | null = null;
    let previewPath: string | null = null;
    try {
      const stamp = Date.now().toString(36);
      const glbName = glbFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
      glbPath = 'catalog/' + slug + '/' + stamp + '-' + glbName;
      await uploadAsset(glbFile, glbPath, 'model/gltf-binary');
      if (previewFile) {
        const ext = extension(previewFile.name);
        const previewName = previewFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
        previewPath = 'catalog/' + slug + '/' + stamp + '-preview-' + previewName;
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        await uploadAsset(previewFile, previewPath, mime);
      }
      const { error: insertError } = await db.from('gift_catalog').insert({
        slug, title,
        description: giftDescription.trim(), coin_price: price, rarity,
        asset_path: glbPath, preview_path: previewPath, is_published: false,
        is_featured: false, created_by: userId, updated_by: userId,
      });
      if (insertError) throw insertError;
      setGiftTitle(''); setGiftDescription(''); setCoinPrice('');
      setRarity('common'); setGlbFile(null); setPreviewFile(null);
      setNotice('Gift uploaded as a draft. Check it before publishing.');
      await load();
    } catch (e) {
      if (glbPath) await supabase.storage.from(BUCKET).remove([glbPath]);
      if (previewPath) await supabase.storage.from(BUCKET).remove([previewPath]);
      setError(e instanceof Error ? e.message : 'Gift could not be saved.');
    } finally { setSaving(false); }
  };

  const togglePublished = async (item: Gift) => {
    setBusyId(item.id); setError(''); setNotice('');
    try {
      const { error: updateError } = await db.from('gift_catalog').update({
        is_published: !item.is_published, updated_by: userId, updated_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (updateError) throw updateError;
      setGifts((current) => current.map((gift) => gift.id === item.id ? { ...gift, is_published: !gift.is_published } : gift));
      setNotice(item.is_published ? 'Gift moved to draft.' : 'Gift published in the store.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Publication status could not be changed.'); }
    finally { setBusyId(''); }
  };

  if (!loading && !canManage) {
    return (
      <View style={lumoStyles.denied}>
        <Ionicons name="lock-closed-outline" size={30} color={colors.accentStrong} />
        <Text style={lumoStyles.deniedTitle}>Access restricted</Text>
        <Text style={lumoStyles.help}>Only LUMO Owner, Developer or Admin accounts can manage virtual gifts.</Text>
        <Pressable onPress={() => router.back()} style={lumoStyles.actionButton}><Text style={lumoStyles.actionButtonText}>Go back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={lumoStyles.root}>
      <ScrollView contentContainerStyle={lumoStyles.content} keyboardShouldPersistTaps="handled">
        <View style={lumoStyles.container}>
          <View style={lumoStyles.header}>
            <Pressable onPress={() => router.back()} style={lumoStyles.back}><Ionicons name="arrow-back" size={18} color={colors.text} /></Pressable>
            <View style={lumoStyles.headerCopy}><Text style={lumoStyles.eyebrow}>LUMO / PLATFORM TOOLS</Text><Text style={lumoStyles.title}>Gift management</Text></View>
            <View style={lumoStyles.staff}><Ionicons name="shield-checkmark" size={12} color={colors.success} /><Text style={lumoStyles.staffText}>STAFF</Text></View>
          </View>

          {error ? <View style={lumoStyles.message}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={lumoStyles.error}>{error}</Text></View> : null}
          {notice ? <View style={lumoStyles.message}><Ionicons name="checkmark-circle-outline" size={16} color={colors.success} /><Text style={lumoStyles.notice}>{notice}</Text></View> : null}

          {loading ? <View style={lumoStyles.loading}><ActivityIndicator color={colors.accentStrong} /></View> : <>
            <View style={lumoStyles.panel}>
              <Text style={lumoStyles.panelEyebrow}>01 / ADD GIFT</Text>
              <Text style={lumoStyles.panelTitle}>Add a virtual gift</Text>
              <Text style={lumoStyles.help}>Upload the actual GLB model. ZIP archives are not rendered directly — extract the .glb first.</Text>
              <Text style={lumoStyles.fieldLabel}>GIFT NAME</Text>
              <TextInput value={giftTitle} onChangeText={setGiftTitle} placeholder="Gift name" placeholderTextColor={colors.dim} style={lumoStyles.input} />
              <Text style={lumoStyles.fieldLabel}>DESCRIPTION</Text>
              <TextInput value={giftDescription} onChangeText={setGiftDescription} multiline placeholder="Describe the gift" placeholderTextColor={colors.dim} style={[lumoStyles.input, lumoStyles.multiline]} />
              <Text style={lumoStyles.fieldLabel}>PRICE · LUMO COINS</Text>
              <TextInput value={coinPrice} onChangeText={(value) => setCoinPrice(value.replace(/[^0-9]/g, '').slice(0, 12))} keyboardType="number-pad" placeholder="Coin price" placeholderTextColor={colors.dim} style={lumoStyles.input} />
              <Text style={lumoStyles.fieldLabel}>RARITY</Text>
              <View style={lumoStyles.chips}>{rarities.map((item) => <Pressable key={item} onPress={() => setRarity(item)} style={[lumoStyles.chip, rarity === item && lumoStyles.chipActive]}><Text style={[lumoStyles.chipText, rarity === item && lumoStyles.chipTextActive]}>{item.toUpperCase()}</Text></Pressable>)}</View>
              <Text style={lumoStyles.fieldLabel}>3D MODEL · GLB REQUIRED</Text>
              <Pressable onPress={() => void pickGlb()} style={lumoStyles.filePicker}>
                <Ionicons name="cube-outline" size={19} color={colors.accentStrong} />
                <View style={lumoStyles.fileCopy}><Text style={lumoStyles.fileTitle}>{glbFile?.name ?? 'Choose a GLB model'}</Text><Text style={lumoStyles.fileMeta}>{glbFile?.size ? (glbFile.size / 1048576).toFixed(1) + ' MB' : 'GLB only · maximum 100 MB'}</Text></View>
                <Ionicons name="folder-open-outline" size={17} color={colors.muted} />
              </Pressable>
              <Text style={lumoStyles.fieldLabel}>PREVIEW IMAGE · OPTIONAL</Text>
              <Pressable onPress={() => void pickPreview()} style={lumoStyles.filePicker}>
                {previewFile ? <Image source={{ uri: previewFile.uri }} style={lumoStyles.previewThumb} /> : <Ionicons name="image-outline" size={19} color={colors.accentStrong} />}
                <View style={lumoStyles.fileCopy}><Text style={lumoStyles.fileTitle}>{previewFile?.name ?? 'Choose preview image'}</Text><Text style={lumoStyles.fileMeta}>PNG, JPG or WebP · maximum 12 MB</Text></View>
                <Ionicons name="folder-open-outline" size={17} color={colors.muted} />
              </Pressable>
              <Pressable disabled={saving} onPress={() => void createGift()} style={[lumoStyles.actionButton, saving && lumoStyles.disabled]}>
                {saving ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons name="cloud-upload-outline" size={16} color={colors.bg} />}
                <Text style={lumoStyles.actionButtonText}>{saving ? 'Uploading…' : 'Upload gift as draft'}</Text>
              </Pressable>
            </View>

            <View style={lumoStyles.listHeader}><View><Text style={lumoStyles.panelEyebrow}>02 / PUBLISH</Text><Text style={lumoStyles.panelTitle}>Gift catalogue</Text></View><Text style={lumoStyles.listCount}>{gifts.length} ITEMS</Text></View>
            {gifts.length ? gifts.map((item) => {
              const modelUrl = supabase.storage.from(BUCKET).getPublicUrl(item.asset_path).data.publicUrl;
              const posterUrl = item.preview_path ? supabase.storage.from(BUCKET).getPublicUrl(item.preview_path).data.publicUrl : null;
              return <View key={item.id} style={lumoStyles.giftRow}>
                <GiftModelViewer uri={modelUrl} posterUri={posterUrl} style={lumoStyles.modelThumb} label={item.title} />
                <View style={lumoStyles.giftInfo}><Text style={lumoStyles.giftTitle} numberOfLines={1}>{item.title}</Text><Text style={lumoStyles.giftMeta}>{item.coin_price.toLocaleString('en-US')} COINS · {item.rarity.toUpperCase()}</Text><Text style={lumoStyles.giftMeta} numberOfLines={1}>{item.slug}</Text></View>
                <View style={lumoStyles.statusBlock}><Text style={lumoStyles.status}>{item.is_published ? 'LIVE' : 'DRAFT'}</Text><Pressable disabled={busyId === item.id} onPress={() => void togglePublished(item)} style={lumoStyles.publishButton}>{busyId === item.id ? <ActivityIndicator color={colors.accentStrong} size="small" /> : <Text style={lumoStyles.publishText}>{item.is_published ? 'Unpublish' : 'Publish'}</Text>}</Pressable></View>
              </View>;
            }) : <View style={lumoStyles.empty}><Ionicons name="cube-outline" size={24} color={colors.dim} /><Text style={lumoStyles.emptyTitle}>No gifts uploaded yet</Text><Text style={lumoStyles.help}>Create the first item above. It will remain a draft until published.</Text></View>}
          </>}
          <View style={lumoStyles.footer}><Ionicons name="shield-checkmark-outline" size={14} color={colors.dim} /><Text style={lumoStyles.footerText}>Only Owner, Developer and Admin can upload or manage gift assets. Public access is read-only.</Text></View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingTop: 24, paddingBottom: 50 },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 5 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 21, fontWeight: '900' },
  staff: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  staffText: { color: colors.success, fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  panel: { padding: 16, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 9 },
  panelEyebrow: { color: colors.dim, fontSize: 7, fontWeight: '900', letterSpacing: 1.4 },
  panelTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 3 },
  help: { color: colors.muted, fontSize: 10, lineHeight: 15, marginBottom: 4 },
  fieldLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 5 },
  input: { minHeight: 43, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 11 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  actionButton: { minHeight: 43, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.accentStrong, marginTop: 7 },
  actionButtonText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 7, fontWeight: '900' },
  chipTextActive: { color: colors.accentStrong },
  filePicker: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fileCopy: { flex: 1, minWidth: 0, gap: 3 },
  fileTitle: { color: colors.text, fontSize: 10, fontWeight: '800' },
  fileMeta: { color: colors.dim, fontSize: 8 },
  previewThumb: { width: 39, height: 39, borderRadius: 8 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  listCount: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modelThumb: { width: 68, height: 68, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.mediaBg },
  giftInfo: { flex: 1, minWidth: 0, gap: 4 },
  giftTitle: { color: colors.text, fontSize: 11, fontWeight: '900' },
  giftMeta: { color: colors.muted, fontSize: 8 },
  statusBlock: { alignItems: 'flex-end', gap: 7 },
  status: { color: colors.success, fontSize: 7, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.successSoft },
  publishButton: { minWidth: 67, alignItems: 'center', paddingVertical: 5 },
  publishText: { color: colors.accentStrong, fontSize: 8, fontWeight: '900' },
  empty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  emptyTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  error: { flex: 1, color: colors.danger, fontSize: 10, lineHeight: 15 },
  notice: { flex: 1, color: colors.success, fontSize: 10, lineHeight: 15 },
  loading: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { flex: 1, color: colors.dim, fontSize: 9, lineHeight: 14 },
  denied: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  deniedTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
});
