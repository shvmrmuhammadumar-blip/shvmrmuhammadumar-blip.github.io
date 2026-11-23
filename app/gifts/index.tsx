import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GiftModelViewer from '../../components/GiftModelViewer';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import {
  createGiftRequestKey, findGiftRecipient, formatCoinAmount, getGiftCatalog,
  getMyCoinBalance, getMyGiftInventory, purchaseGift, transferGift,
  type GiftCatalogItem, type GiftInventoryItem,
} from '../../lib/gifts';
import { getPlatformRoles } from '../../lib/market-official';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


type StoreTab = 'store' | 'collection';
const rarityLabel: Record<string, string> = {
  common: 'COMMON', rare: 'RARE', epic: 'EPIC',
  legendary: 'LEGENDARY', mythic: 'MYTHIC / LIMITED',
};
const rarityColor: Record<string, string> = {
  get common() { return colors.muted; },
  get rare() { return colors.verified; },
  get epic() { return colors.accent; },
  get legendary() { return colors.accentStrong; },
  get mythic() { return colors.accentStrong; },
};

function GiftArtwork({ item, compact = false, mobile = false }: { item: GiftCatalogItem; compact?: boolean; mobile?: boolean }) {
  const lumoStyles = useThemedStyles(styles);
  const accent = rarityColor[item.rarity] ?? colors.accentStrong;
  return (
    <View style={[lumoStyles.artwork, compact && lumoStyles.artworkCompact, mobile && lumoStyles.artworkMobile]}>
      {item.preview_url ? (
        <Image
          source={{ uri: item.preview_url }}
          style={[lumoStyles.artworkImage, compact && lumoStyles.artworkImageCompact, mobile && lumoStyles.artworkImageMobile]}
          resizeMode="contain"
        />
      ) : (
        <Ionicons name="gift-outline" size={compact ? 24 : 34} color={accent} />
      )}
    </View>
  );
}

function GiftCard({ item, onPreview, isMobile = false, isDeveloper = false }: { item: GiftCatalogItem; onPreview: () => void; isMobile?: boolean; isDeveloper?: boolean }) {
  const lumoStyles = useThemedStyles(styles);
  const accent = rarityColor[item.rarity] ?? colors.accentStrong;
  return (
    <Pressable onPress={onPreview} style={({ pressed }) => [
      lumoStyles.giftCard,
      isMobile && lumoStyles.giftCardMobile,
      { borderColor: resolveThemeColor("#252525", "borderColor") },
      pressed && lumoStyles.giftCardPressed,
    ]}>
      <GiftArtwork item={item} mobile={isMobile} />
      <View style={[lumoStyles.cardBody, isMobile && lumoStyles.cardBodyMobile]}>
        <View style={lumoStyles.cardEyebrowRow}>
          <View style={[lumoStyles.rarityMark, { backgroundColor: accent }]} />
          <Text style={[lumoStyles.rarity, isMobile && lumoStyles.rarityMobile, { color: accent }]}>
            {item.rarity.toUpperCase()}
          </Text>
        </View>
        <Text style={[lumoStyles.giftName, isMobile && lumoStyles.giftNameMobile]} numberOfLines={1}>{item.title}</Text>
        {item.description ? <Text style={[lumoStyles.giftDescription, isMobile && lumoStyles.giftDescriptionMobile]} numberOfLines={2}>{item.description}</Text> : null}
        <View style={[lumoStyles.cardFooter, isMobile && lumoStyles.cardFooterMobile]}>
          <View style={lumoStyles.coinTag}>
            {isDeveloper ? (
              <>
                <Ionicons name="flask-outline" size={12} color={colors.accentStrong} />
                <Text style={[lumoStyles.priceValue, isMobile && lumoStyles.priceValueMobile]}>$0.10</Text>
                <Text style={lumoStyles.coinTagLabel}>TEST</Text>
              </>
            ) : (
              <>
                <Ionicons name="aperture" size={12} color={colors.accentStrong} />
                <Text style={[lumoStyles.priceValue, isMobile && lumoStyles.priceValueMobile]}>{formatCoinAmount(item.coin_price)}</Text>
                <Text style={lumoStyles.coinTagLabel}>COINS</Text>
              </>
            )}
          </View>
          <View style={lumoStyles.openHint}>
            <Text style={lumoStyles.openHintText}>OPEN</Text>
            <Ionicons name="arrow-up-right-box" size={12} color={accent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

type GiftsStoreScreenProps = { embedded?: boolean; onOpenWallet?: () => void; initialTab?: StoreTab };

export default function GiftsStoreScreen({ embedded = false, onOpenWallet, initialTab }: GiftsStoreScreenProps = {}) {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const isWide = width >= 920;
  const isMobile = width < 600;
  const [activeTab, setActiveTab] = useState<StoreTab>(initialTab ?? 'store');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (params.tab === 'collection') setActiveTab('collection');
    else if (params.tab === 'store') setActiveTab('store');
  }, [params.tab]);

  const [catalog, setCatalog] = useState<GiftCatalogItem[]>([]);
  const [inventory, setInventory] = useState<GiftInventoryItem[]>([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [platformRoles, setPlatformRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedGift, setSelectedGift] = useState<GiftCatalogItem | null>(null);
  const [selectedInventory, setSelectedInventory] = useState<GiftInventoryItem | null>(null);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [recipientMessage, setRecipientMessage] = useState('');
  const [recipient, setRecipient] = useState<{ id: string; username: string; full_name: string | null } | null>(null);
  const pendingKeys = useRef<Record<string, string>>({});
  const isManager = platformRoles.some((role) => ['owner', 'developer', 'admin'].includes(role));
  const isDeveloper = platformRoles.some((role) => String(role) === 'developer');

  const load = useCallback(async () => {
    if (!userId) {
      setCatalog([]); setInventory([]); setCoinBalance(0); setLoading(false);
      return;
    }
    setLoading(true); setError('');
    try {
      const [nextCatalog, nextInventory, nextBalance, nextRoles] = await Promise.all([
        getGiftCatalog(), getMyGiftInventory(), getMyCoinBalance(),
        getPlatformRoles(userId).catch(() => []),
      ]);
      setCatalog(nextCatalog);
      setInventory(nextInventory);
      setCoinBalance(nextBalance);
      setPlatformRoles(nextRoles);
      if (nextRoles.some((role) => String(role) === 'developer')) {
        const { data: providerOrders, error: ordersError } = await (supabase as any)
          .from('developer_payment_orders')
          .select('gift_id, provider, status, idempotency_key')
          .eq('user_id', userId)
          .eq('product_type', 'gift')
          .order('created_at', { ascending: false })
          .limit(30);
        if (ordersError) throw ordersError;
        for (const order of providerOrders ?? []) {
          const slot = `provider-purchase:${order.gift_id}:${order.provider}`;
          if (order.status !== 'pending' && pendingKeys.current[slot] === order.idempotency_key) {
            delete pendingKeys.current[slot];
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The gift collection could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openSend = (item: GiftInventoryItem) => {
    setSelectedInventory(item); setRecipientUsername(''); setRecipientMessage('');
    setRecipient(null); setError(''); setNotice('');
  };

  const resolveRecipient = async () => {
    setBusy(true); setError(''); setRecipient(null);
    try { setRecipient(await findGiftRecipient(recipientUsername)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not find this member.'); }
    finally { setBusy(false); }
  };

  const sendGift = async () => {
    if (!selectedInventory || !recipient) return;
    setBusy(true); setError('');
    const requestSlot = `transfer:${selectedInventory.id}:${recipient.id}`;
    const idempotencyKey = pendingKeys.current[requestSlot] ?? createGiftRequestKey();
    pendingKeys.current[requestSlot] = idempotencyKey;
    try {
      await transferGift(selectedInventory.id, recipient.id, idempotencyKey, recipientMessage);
      delete pendingKeys.current[requestSlot];
      setSelectedInventory(null);
      setNotice('Gift delivered to @' + recipient.username + '.');
      setRecipient(null);
      await load();
    } catch (e) {
      // Keep the same key so a retry can safely recover if the server committed the transfer
      // but the response was lost before the client received it.
      setError(e instanceof Error ? e.message : 'The gift could not be sent.');
    } finally { setBusy(false); }
  };

  const buyGift = async () => {
    if (!selectedGift) return;
    setBusy(true); setError('');
    try {
      const key = pendingKeys.current[selectedGift.id] ?? createGiftRequestKey();
      pendingKeys.current[selectedGift.id] = key;
      const result = await purchaseGift(selectedGift.id, key);
      delete pendingKeys.current[selectedGift.id];
      setCoinBalance(result.coin_balance);
      setNotice(selectedGift.title + ' added to your collection.');
      setSelectedGift(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The purchase could not be completed.');
    } finally { setBusy(false); }
  };

  const startDeveloperGiftPayment = async (provider: 'payme' | 'click') => {
    if (!selectedGift || !isDeveloper || busy) return;
    setBusy(true);
    setError('');
    const requestSlot = `provider-purchase:${selectedGift.id}:${provider}`;
    const idempotencyKey = pendingKeys.current[requestSlot] ?? createGiftRequestKey();
    pendingKeys.current[requestSlot] = idempotencyKey;
    try {
      const { data, error: paymentError } = await supabase.functions.invoke(
        'developer-payment-create',
        {
          body: {
            product_type: 'gift',
            provider,
            gift_id: selectedGift.id,
            idempotency_key: idempotencyKey,
          },
        },
      );
      if (paymentError) throw paymentError;
      if (!data?.success || typeof data.checkout_url !== 'string') {
        throw new Error(data?.error ?? 'The payment provider did not return a checkout link.');
      }
      await Linking.openURL(data.checkout_url);
      setNotice(`${selectedGift.title}: ${provider.toUpperCase()} Sandbox checkout opened for $0.10. The gift appears in your collection only after provider confirmation.`);
      setSelectedGift(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test checkout could not be opened. Retry safely.');
    } finally {
      setBusy(false);
    }
  };

  const giftContent = (
    <View style={[lumoStyles.container, isWide && lumoStyles.containerWide]}>
          <View style={[lumoStyles.topBar, isMobile && lumoStyles.topBarMobile]}>
            {!embedded ? (
              <Pressable onPress={() => router.replace('/' as never)} style={({ pressed }) => [lumoStyles.homeButton, pressed && lumoStyles.pressed]} accessibilityRole="button" accessibilityLabel="Go to Home">
                <Ionicons name="home-outline" size={15} color={colors.text} />
                <Text style={lumoStyles.homeButtonText}>Home</Text>
              </Pressable>
            ) : null}
            <View style={lumoStyles.brandLockup}>
              <View style={[lumoStyles.brandMark, isMobile && lumoStyles.brandMarkMobile]}><Text style={lumoStyles.brandMarkText}>L</Text></View>
              <View><Text style={[lumoStyles.eyebrow, isMobile && lumoStyles.eyebrowMobile]}>LUMO / DIGITAL COLLECTIBLES</Text><Text style={[lumoStyles.brandTitle, isMobile && lumoStyles.brandTitleMobile]}>GIFT VAULT</Text></View>
            </View>
            <Pressable onPress={onOpenWallet ?? (() => router.push('/wallet' as never))} style={({ pressed }) => [lumoStyles.balancePill, isMobile && lumoStyles.balancePillMobile, pressed && lumoStyles.pressed]}>
              <Ionicons name="aperture" size={17} color={colors.accentStrong} />
              <Text style={[lumoStyles.balanceValue, isMobile && lumoStyles.balanceValueMobile]}>{formatCoinAmount(coinBalance)}</Text>
              <Text style={[lumoStyles.balanceCurrency, isMobile && lumoStyles.balanceCurrencyMobile]}>COINS</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.muted} />
            </Pressable>
          </View>

          {!embedded && !isMobile ? (
            <View style={[lumoStyles.hero, isWide && lumoStyles.heroWide]}>
              <View style={lumoStyles.heroCopy}>
                <Text style={lumoStyles.heroEyebrow}>LUMO DIGITAL COLLECTIBLES</Text>
                <Text style={lumoStyles.heroTitle}>Gifts with a life of their own.</Text>
                <Text style={lumoStyles.heroDescription}>Discover animated 3D objects, collect your favourites and send them to someone on LUMO.</Text>
                <View style={lumoStyles.heroMetaRow}><View style={lumoStyles.heroMetaDot} /><Text style={lumoStyles.heroMetaText}>COLLECT · KEEP · SEND</Text></View>
              </View>
              {isWide ? (
                <View style={lumoStyles.heroVisual}>
                  <View style={lumoStyles.heroVisualRing} />
                  <View style={lumoStyles.heroVisualCore}><Ionicons name="gift-outline" size={54} color={colors.accentStrong} /></View>
                  <Text style={lumoStyles.heroVisualLabel}>OBJECTS WITH PRESENCE</Text>
                </View>
              ) : null}
            </View>
          ) : !embedded ? <View style={lumoStyles.mobileIntro}><Text style={lumoStyles.mobileIntroText}>A WORLD OF DIGITAL COLLECTIBLES</Text></View> : null}

          <View style={[lumoStyles.sectionHeader, isMobile && lumoStyles.sectionHeaderMobile]}>
            <View style={lumoStyles.tabRow}>
              <Pressable onPress={() => setActiveTab('store')} style={[lumoStyles.tabButton, isMobile && lumoStyles.tabButtonMobile, activeTab === 'store' && lumoStyles.tabButtonActive]}>
                <Ionicons name="sparkles-outline" size={15} color={activeTab === 'store' ? colors.text : colors.muted} />
                <Text style={[lumoStyles.tabText, isMobile && lumoStyles.tabTextMobile, activeTab === 'store' && lumoStyles.tabTextActive]}>Discover</Text>
              </Pressable>
              <Pressable onPress={() => setActiveTab('collection')} style={[lumoStyles.tabButton, isMobile && lumoStyles.tabButtonMobile, activeTab === 'collection' && lumoStyles.tabButtonActive]}>
                <Ionicons name="albums-outline" size={15} color={activeTab === 'collection' ? colors.text : colors.muted} />
                <Text style={[lumoStyles.tabText, isMobile && lumoStyles.tabTextMobile, activeTab === 'collection' && lumoStyles.tabTextActive]}>My gifts</Text>
                <Text style={lumoStyles.tabCount}>{inventory.length}</Text>
              </Pressable>
            </View>
            {isManager ? (
              <Pressable onPress={() => router.push('/gifts/manage' as never)} style={lumoStyles.manageButton}>
                <Ionicons name="options-outline" size={15} color={colors.accentStrong} />
                <Text style={lumoStyles.manageButtonText}>Manage</Text>
              </Pressable>
            ) : null}
          </View>

          {notice ? <View style={lumoStyles.notice}><Ionicons name="checkmark-circle" size={17} color={colors.success} /><Text style={lumoStyles.noticeText}>{notice}</Text></View> : null}
          {error && !selectedInventory ? <Text style={lumoStyles.errorText}>{error}</Text> : null}

          {loading ? (
            <View style={lumoStyles.loadingState}><ActivityIndicator color={colors.accentStrong} /><Text style={lumoStyles.stateText}>Preparing your collection…</Text></View>
          ) : activeTab === 'store' ? (
            catalog.length ? (
              <View style={[lumoStyles.giftGrid, isMobile && lumoStyles.giftGridMobile]}>{catalog.map((item) => <GiftCard key={item.id} item={item} isMobile={isMobile} isDeveloper={isDeveloper} onPreview={() => { setError(''); setSelectedGift(item); }} />)}</View>
            ) : (
              <View style={lumoStyles.emptyState}>
                <View style={lumoStyles.emptyIcon}><Ionicons name="cube-outline" size={28} color={colors.accentStrong} /></View>
                <Text style={lumoStyles.emptyEyebrow}>THE FIRST DROP IS IN PROGRESS</Text>
                <Text style={lumoStyles.emptyTitle}>The first gift drop is being prepared.</Text>
                <Text style={lumoStyles.emptyDescription}>Original 3D gifts will appear here after the LUMO team uploads and publishes their GLB models.</Text>
                {isManager ? <Text style={lumoStyles.managerHint}>Open Manage to upload a 3D gift and publish it.</Text> : null}
              </View>
            )
          ) : (
            inventory.length ? (
              <View style={lumoStyles.giftGrid}>
                {inventory.map((entry) => entry.gift ? (
                  <View key={entry.id} style={lumoStyles.inventoryCard}>
                    <GiftArtwork item={entry.gift} compact />
                    <View style={lumoStyles.inventoryInfo}>
                      <Text style={lumoStyles.rarity}>{rarityLabel[entry.gift.rarity] ?? entry.gift.rarity.toUpperCase()}</Text>
                      <Text style={lumoStyles.giftName} numberOfLines={1}>{entry.gift.title}</Text>
                      <Text style={lumoStyles.inventoryDate}>ADDED {new Date(entry.created_at).toLocaleDateString()}</Text>
                      <Pressable onPress={() => openSend(entry)} style={({ pressed }) => [lumoStyles.sendButton, pressed && lumoStyles.pressed]}>
                        <Ionicons name="paper-plane-outline" size={14} color={colors.bg} />
                        <Text style={lumoStyles.sendButtonText}>Send gift</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null)}
              </View>
            ) : (
              <View style={lumoStyles.emptyState}>
                <View style={lumoStyles.emptyIcon}><Ionicons name="albums-outline" size={28} color={colors.accentStrong} /></View>
                <Text style={lumoStyles.emptyEyebrow}>YOUR PERSONAL COLLECTION</Text>
                <Text style={lumoStyles.emptyTitle}>Nothing collected yet.</Text>
                <Text style={lumoStyles.emptyDescription}>Gifts you acquire or receive will be kept here, ready to send to another LUMO member.</Text>
                <Pressable onPress={() => setActiveTab('store')} style={lumoStyles.emptyAction}><Text style={lumoStyles.emptyActionText}>Explore gift store</Text><Ionicons name="arrow-forward" size={15} color={colors.bg} /></Pressable>
              </View>
            )
          )}

          <View style={lumoStyles.footerNote}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.dim} />
            <Text style={lumoStyles.footerText}>Coin purchases and gift transfers are processed by the LUMO ledger. Coin top-ups and cash payouts are not enabled yet.</Text>
          </View>
    </View>
  );

  return (
    <View style={[lumoStyles.root, embedded && lumoStyles.rootEmbedded]}>
      {embedded ? (
        <View style={[lumoStyles.scrollContent, isMobile && lumoStyles.scrollContentMobile, lumoStyles.embeddedContent]}>{giftContent}</View>
      ) : (
        <ScrollView
          contentContainerStyle={[lumoStyles.scrollContent, isMobile && lumoStyles.scrollContentMobile]}
          showsVerticalScrollIndicator={false}
        >
          {giftContent}
        </ScrollView>
      )}

      <Modal visible={!!selectedGift} transparent animationType="fade" onRequestClose={() => { if (!busy) setSelectedGift(null); }}>
        <View style={lumoStyles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setSelectedGift(null)} />
          <View style={[lumoStyles.modalCard, isMobile && lumoStyles.modalCardMobile]}>
            <View style={lumoStyles.modalTop}><Text style={lumoStyles.modalEyebrow}>INTERACTIVE 3D PREVIEW</Text><Pressable onPress={() => !busy && setSelectedGift(null)}><Ionicons name="close" size={20} color={colors.muted} /></Pressable></View>
            <View style={[lumoStyles.previewViewerWrap, isMobile && lumoStyles.previewViewerWrapMobile]}>
              {selectedGift?.model_url ? (
                <GiftModelViewer uri={selectedGift.model_url} posterUri={selectedGift.preview_url} style={lumoStyles.previewViewer} label={selectedGift.title} />
              ) : selectedGift?.preview_url ? (
                <Image source={{ uri: selectedGift.preview_url }} style={lumoStyles.previewFallback} resizeMode="contain" />
              ) : null}
            </View>
            <Text style={lumoStyles.modalTitle}>{selectedGift?.title}</Text>
            <Text style={lumoStyles.modalDescription}>Rotate the gift with your finger or mouse, then add it to your collection.</Text>
            {isDeveloper ? (
              <>
                <View style={lumoStyles.modalPrice}>
                  <Text style={lumoStyles.modalPriceLabel}>DEVELOPER TEST PRICE</Text>
                  <View style={lumoStyles.priceRow}>
                    <Ionicons name="flask-outline" size={18} color={colors.accentStrong} />
                    <Text style={lumoStyles.modalPriceValue}>$0.10 USD</Text>
                  </View>
                  <Text style={lumoStyles.modalDescription}>Approximately 1,200 UZS. This test price is for Developer accounts only.</Text>
                </View>
                {error ? <Text style={lumoStyles.errorText}>{error}</Text> : null}
                <Pressable disabled={busy} onPress={() => void startDeveloperGiftPayment('payme')} style={[lumoStyles.modalPrimary, busy && lumoStyles.disabled]}>
                  {busy ? <ActivityIndicator color={colors.bg} /> : <><Text style={lumoStyles.modalPrimaryText}>Payme Sandbox · $0.10</Text><Ionicons name="arrow-forward" size={16} color={colors.bg} /></>}
                </Pressable>
                <Pressable disabled={busy} onPress={() => void startDeveloperGiftPayment('click')} style={[lumoStyles.modalPrimary, busy && lumoStyles.disabled]}>
                  {busy ? <ActivityIndicator color={colors.bg} /> : <><Text style={lumoStyles.modalPrimaryText}>Click Sandbox · $0.10</Text><Ionicons name="arrow-forward" size={16} color={colors.bg} /></>}
                </Pressable>
                <Text style={lumoStyles.balanceAvailable}>The gift is added only after the payment provider confirms the transaction.</Text>
              </>
            ) : (
              <>
                <View style={lumoStyles.modalPrice}><Text style={lumoStyles.modalPriceLabel}>TOTAL</Text><View style={lumoStyles.priceRow}><Ionicons name="aperture-outline" size={18} color={colors.accentStrong} /><Text style={lumoStyles.modalPriceValue}>{formatCoinAmount(selectedGift?.coin_price ?? 0)} LUMO Coins</Text></View></View>
                <Text style={lumoStyles.balanceAvailable}>Available balance: {formatCoinAmount(coinBalance)} Coins</Text>
                {error ? <Text style={lumoStyles.errorText}>{error}</Text> : null}
                <Pressable disabled={busy} onPress={() => void buyGift()} style={[lumoStyles.modalPrimary, busy && lumoStyles.disabled]}>
                  {busy ? <ActivityIndicator color={colors.bg} /> : <><Text style={lumoStyles.modalPrimaryText}>Confirm gift</Text><Ionicons name="arrow-forward" size={16} color={colors.bg} /></>}
                </Pressable>
              </>
            )}
            <Pressable disabled={busy} onPress={() => setSelectedGift(null)} style={lumoStyles.modalCancel}><Text style={lumoStyles.modalCancelText}>Not now</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedInventory} transparent animationType="slide" onRequestClose={() => { if (!busy) setSelectedInventory(null); }}>
        <View style={lumoStyles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setSelectedInventory(null)} />
          <View style={lumoStyles.modalCard}>
            <View style={lumoStyles.modalTop}><Text style={lumoStyles.modalEyebrow}>SEND A GIFT</Text><Pressable onPress={() => !busy && setSelectedInventory(null)}><Ionicons name="close" size={20} color={colors.muted} /></Pressable></View>
            <Text style={lumoStyles.modalTitle}>{selectedInventory?.gift?.title ?? 'Your gift'}</Text>
            <Text style={lumoStyles.modalDescription}>Enter the exact LUMO username of the person receiving this gift.</Text>
            <Text style={lumoStyles.fieldLabel}>RECIPIENT USERNAME</Text>
            <View style={lumoStyles.inputRow}>
              <Text style={lumoStyles.atSign}>@</Text>
              <TextInput value={recipientUsername} onChangeText={(value) => { setRecipientUsername(value); setRecipient(null); }} autoCapitalize="none" autoCorrect={false} placeholder="username" placeholderTextColor={colors.dim} style={lumoStyles.textInput} />
              <Pressable onPress={() => void resolveRecipient()} disabled={busy || !recipientUsername.trim()} style={[lumoStyles.findButton, (busy || !recipientUsername.trim()) && lumoStyles.disabled]}>
                {busy ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={lumoStyles.findButtonText}>Find</Text>}
              </Pressable>
            </View>
            {recipient ? <Text style={lumoStyles.recipientFound}>Recipient: {recipient.full_name || '@' + recipient.username} (@{recipient.username})</Text> : null}
            <Text style={lumoStyles.fieldLabel}>PERSONAL NOTE · OPTIONAL</Text>
            <TextInput value={recipientMessage} onChangeText={setRecipientMessage} multiline maxLength={240} placeholder="Add a short message…" placeholderTextColor={colors.dim} style={[lumoStyles.textInput, lumoStyles.messageInput]} />
            {error ? <Text style={lumoStyles.errorText}>{error}</Text> : null}
            <Pressable disabled={busy || !recipient} onPress={() => void sendGift()} style={[lumoStyles.modalPrimary, (busy || !recipient) && lumoStyles.disabled]}>
              {busy ? <ActivityIndicator color={colors.bg} /> : <><Text style={lumoStyles.modalPrimaryText}>Send gift</Text><Ionicons name="paper-plane" size={15} color={colors.bg} /></>}
            </Pressable>
            <Pressable disabled={busy} onPress={() => setSelectedInventory(null)} style={lumoStyles.modalCancel}><Text style={lumoStyles.modalCancelText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootEmbedded: { flex: 0, backgroundColor: 'transparent' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 48 },
  scrollContentMobile: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28 },
  embeddedContent: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  containerWide: { maxWidth: 1180 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22 },
  topBarMobile: { gap: 6, marginBottom: 12 },
  homeButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  homeButtonText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  brandMarkMobile: { width: 30, height: 30, borderRadius: 10 },
  eyebrowMobile: { display: 'none' },
  brandTitleMobile: { fontSize: 13, letterSpacing: 1.1, marginTop: 0 },
  balancePillMobile: { minHeight: 38, gap: 4, paddingHorizontal: 8 },
  balanceValueMobile: { fontSize: 11 },
  balanceCurrencyMobile: { fontSize: 7 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#090909', borderWidth: 1, borderColor: '#252525', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.accentStrong, fontSize: 23, fontWeight: '800' },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  brandTitle: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 2.4, marginTop: 2 },
  balancePill: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#080808', borderWidth: 1, borderColor: '#252525' },
  balanceValue: { color: colors.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  balanceCurrency: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  mobileIntro: { marginBottom: 12, paddingVertical: 7 },
  mobileIntroText: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  hero: { minHeight: 205, padding: 22, borderRadius: 22, backgroundColor: '#050505', borderWidth: 1, borderColor: '#202020', overflow: 'hidden', marginBottom: 26 },
  heroWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 34, minHeight: 242 },
  heroCopy: { flex: 1, maxWidth: 580 },
  heroEyebrow: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.8, marginBottom: 12 },
  heroTitle: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2 },
  heroDescription: { maxWidth: 460, color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  heroMetaDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  heroMetaText: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  heroVisual: { width: 240, height: 190, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  heroVisualRing: { position: 'absolute', width: 165, height: 165, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(224,232,240,0.15)' },
  heroVisualCore: { width: 110, height: 110, borderRadius: 34, borderWidth: 1, borderColor: 'rgba(224,232,240,0.2)', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  heroVisualLabel: { position: 'absolute', bottom: 0, color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 15 },
  sectionHeaderMobile: { marginBottom: 10, gap: 5 },
  tabButtonMobile: { minHeight: 34, paddingHorizontal: 8, gap: 5 },
  tabTextMobile: { fontSize: 9 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabButton: { minHeight: 39, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  tabButtonActive: { backgroundColor: '#0A0A0A', borderColor: '#252525' },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: colors.text },
  tabCount: { color: colors.dim, fontSize: 9, fontWeight: '800' },
  manageButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  manageButtonText: { color: colors.accentStrong, fontSize: 10, fontWeight: '800' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 14 },
  giftGridMobile: { gap: 10, justifyContent: 'space-between' },
  giftCard: { width: '23.5%', minWidth: 220, flexGrow: 0, flexDirection: 'column', borderRadius: 17, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  giftCardMobile: { width: '48%', maxWidth: '49%', minWidth: 0, flexGrow: 0 },
  giftCardPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  artwork: { width: '100%', height: 170, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.mediaBg },
  artworkCompact: { width: 76, height: 88, flexShrink: 0, backgroundColor: colors.mediaBg },
  artworkMobile: { width: '100%', height: 128, backgroundColor: colors.mediaBg },
  artworkImage: { width: 150, height: 150 },
  artworkImageCompact: { width: 66, height: 72 },
  artworkImageMobile: { width: 108, height: 112 },
  cardBody: { flex: 1, minWidth: 0, padding: 12, gap: 4 },
  cardBodyMobile: { padding: 9, gap: 3 },
  cardEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  rarityMark: { width: 5, height: 5, borderRadius: 3 },
  rarity: { color: colors.muted, fontSize: 7, letterSpacing: 1.1, fontWeight: '900' },
  rarityMobile: { fontSize: 6, letterSpacing: 0.8 },
  giftName: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  giftNameMobile: { fontSize: 12 },
  giftDescription: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 1, minHeight: 26 },
  giftDescriptionMobile: { fontSize: 8, lineHeight: 11, minHeight: 22 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 7 },
  cardFooterMobile: { marginTop: 5 },
  coinTag: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  coinTagLabel: { color: colors.dim, fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceValue: { color: colors.text, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  priceValueMobile: { fontSize: 10 },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openHintText: { color: colors.dim, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  inventoryCard: { width: '48%', minWidth: 260, flexGrow: 1, flexDirection: 'row', borderRadius: 17, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  inventoryInfo: { flex: 1, minWidth: 0, padding: 13, justifyContent: 'center' },
  inventoryDate: { color: colors.dim, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginTop: 7 },
  sendButton: { alignSelf: 'flex-start', minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, paddingHorizontal: 11, borderRadius: 9, backgroundColor: colors.accentStrong },
  sendButtonText: { color: colors.bg, fontSize: 9, fontWeight: '900' },
  emptyState: { minHeight: 290, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 60, height: 60, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  emptyEyebrow: { color: colors.accent, fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginTop: 19, textAlign: 'center' },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  emptyDescription: { maxWidth: 420, color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  managerHint: { color: colors.accentStrong, fontSize: 10, marginTop: 14, textAlign: 'center' },
  emptyAction: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.accentStrong },
  emptyActionText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, padding: 11, borderRadius: 10, backgroundColor: 'rgba(158,190,174,0.09)', borderWidth: 1, borderColor: 'rgba(158,190,174,0.18)' },
  noticeText: { flex: 1, color: colors.success, fontSize: 11 },
  errorText: { color: colors.danger, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  loadingState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { color: colors.muted, fontSize: 11 },
  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 26, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { flex: 1, color: colors.dim, fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.78 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(4,7,11,0.76)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 460, padding: 18, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modalCardMobile: { padding: 14, maxWidth: 420 },
  previewViewerWrapMobile: { height: 160, marginTop: 9 },
  previewViewerWrap: { width: '100%', height: 210, marginTop: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.mediaBg, alignItems: 'center', justifyContent: 'center' },
  previewViewer: { width: '100%', height: '100%' },
  previewFallback: { width: '100%', height: '100%' },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalEyebrow: { color: colors.accent, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 14 },
  modalDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  modalPrice: { padding: 13, marginTop: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  modalPriceLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7 },
  modalPriceValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  balanceAvailable: { color: colors.muted, fontSize: 10, marginTop: 12 },
  modalPrimary: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, borderRadius: 11, backgroundColor: colors.accentStrong },
  modalPrimaryText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  modalCancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  modalCancelText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  fieldLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 18, marginBottom: 7 },
  inputRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 5, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  atSign: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  textInput: { flex: 1, minHeight: 44, color: colors.text, fontSize: 12, padding: 0 },
  findButton: { minWidth: 56, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.accentStrong },
  findButtonText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  recipientFound: { color: colors.success, fontSize: 10, marginTop: 8 },
  messageInput: { minHeight: 76, padding: 11, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
});
