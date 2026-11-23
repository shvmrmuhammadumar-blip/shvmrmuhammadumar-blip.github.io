import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import {
  formatCoinAmount,
  getGiftCatalog,
  getMyCoinBalance,
  getMyGiftInventory,
  type GiftCatalogItem,
  type GiftInventoryItem,
} from '../../lib/gifts';
import { formatMembershipDate, getMyMembership, type MembershipSnapshot } from '../../lib/membership';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import WalletScreen from './wallet';
import GiftsStoreScreen from '../gifts/index';
import { useThemedStyles } from "../../lib/theme-styles";

type PerksPanel = 'overview' | 'wallet' | 'plus' | 'gifts';
type GiftPreviewTab = 'store' | 'collection';
type CoinTransaction = {
  id: string;
  transaction_type: string;
  delta: number;
  balance_after: number;
  created_at: string;
};

const walletDb = supabase as any;

function transactionLabel(type: string) {
  if (type === 'gift_purchase') return 'Gift acquired';
  if (type === 'gift_refund') return 'Gift refund';
  if (type === 'top_up') return 'Coin top-up';
  if (type === 'admin_adjustment') return 'Account adjustment';
  return 'Wallet activity';
}

function GiftPreviewCard({
  title,
  rarity,
  price,
  imageUrl,
  onPress,
}: {
  title: string;
  rarity?: string;
  price?: number;
  imageUrl?: string | null;
  onPress: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={'Open ' + title}
      style={({ pressed }) => [lumoStyles.giftCard, pressed && lumoStyles.pressed]}
    >
      <View style={lumoStyles.giftArtwork}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={lumoStyles.giftImage} resizeMode="contain" />
        ) : (
          <Ionicons name="gift-outline" size={25} color={colors.accentStrong} />
        )}
      </View>
      <View style={lumoStyles.giftCardCopy}>
        {rarity ? <Text style={lumoStyles.giftRarity}>{rarity.toUpperCase()}</Text> : null}
        <Text numberOfLines={1} style={lumoStyles.giftName}>{title}</Text>
        {typeof price === 'number' ? (
          <View style={lumoStyles.giftPrice}>
            <Ionicons name="aperture" size={11} color={colors.accentStrong} />
            <Text style={lumoStyles.giftPriceText}>{formatCoinAmount(price)} Coins</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.dim} />
    </Pressable>
  );
}

export default function PerksScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const isWide = width >= 920;
  const drawerWidth = Math.min(width * 0.88, 360);

  const [panel, setPanel] = useState<PerksPanel>('overview');
  const [giftPreviewTab, setGiftPreviewTab] = useState<GiftPreviewTab>('store');
  const [balance, setBalance] = useState(0);
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [inventory, setInventory] = useState<GiftInventoryItem[]>([]);
  const [catalog, setCatalog] = useState<GiftCatalogItem[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const drawerX = useRef(new Animated.Value(drawerWidth)).current;

  const load = useCallback(async () => {
    if (!userId) {
      setBalance(0);
      setMembership(null);
      setInventory([]);
      setCatalog([]);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const results = await Promise.allSettled([
      getMyCoinBalance(),
      getMyMembership(),
      getMyGiftInventory(),
      getGiftCatalog(),
      walletDb.from('coin_transactions')
        .select('id, transaction_type, delta, balance_after, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const failures: string[] = [];

    if (results[0].status === 'fulfilled') setBalance(results[0].value);
    else failures.push('balance');

    if (results[1].status === 'fulfilled') setMembership(results[1].value);
    else {
      setMembership(null);
      failures.push('membership');
    }

    if (results[2].status === 'fulfilled') setInventory(results[2].value);
    else {
      setInventory([]);
      failures.push('gifts');
    }

    if (results[3].status === 'fulfilled') setCatalog(results[3].value);
    else {
      setCatalog([]);
      failures.push('store');
    }

    if (results[4].status === 'fulfilled' && !results[4].value.error) {
      setTransactions((results[4].value.data ?? []) as CoinTransaction[]);
    } else {
      setTransactions([]);
      failures.push('activity');
    }

    setError(failures.length ? 'Some Perks information could not be refreshed.' : '');
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    if (menuVisible) {
      drawerX.setValue(drawerWidth);
      Animated.timing(drawerX, {
        toValue: 0,
        duration: 230,
        useNativeDriver: false,
      }).start();
    } else {
      drawerX.setValue(drawerWidth);
    }
  }, [menuVisible, drawerWidth, drawerX]);

  const openMenu = () => setMenuVisible(true);

  const closeMenu = () => {
    Animated.timing(drawerX, {
      toValue: drawerWidth,
      duration: 190,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setMenuVisible(false);
    });
  };

  const openPanel = (next: PerksPanel, nextGiftTab: GiftPreviewTab = 'store') => {
    setPanel(next);
    setGiftPreviewTab(nextGiftTab);
    if (menuVisible) closeMenu();
  };

  const isPlus = membership?.membership_type === 'member_premium';
  const expiry = formatMembershipDate(membership?.expires_at ?? null);
  const panelTitle = panel === 'wallet'
    ? 'Wallet'
    : panel === 'plus'
      ? 'LUMO Plus'
      : panel === 'gifts'
        ? 'Gift Vault'
        : 'Perks';

  const visibleGifts: Array<GiftCatalogItem | GiftInventoryItem> = giftPreviewTab === 'store'
    ? catalog.slice(0, 5)
    : inventory.filter((item) => item.gift).slice(0, 5);

  return (
    <View style={lumoStyles.root}>
      <ScrollView
        style={lumoStyles.scroll}
        contentContainerStyle={lumoStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[lumoStyles.content, isWide && lumoStyles.contentWide]}>
          <View style={lumoStyles.pageHeader}>
            <View style={lumoStyles.headerCopy}>
              {panel === 'overview' ? (
                <>
                  <Text style={lumoStyles.eyebrow}>LUMO / YOUR BENEFITS</Text>
                  <Text style={lumoStyles.pageTitle}>Perks</Text>
                  <Text style={lumoStyles.pageSubtitle}>Your Coins, membership and digital gifts.</Text>
                </>
              ) : (
                <>
                  <Pressable onPress={() => setPanel('overview')} style={lumoStyles.backButton} accessibilityRole="button">
                    <Ionicons name="arrow-back" size={15} color={colors.muted} />
                    <Text style={lumoStyles.backButtonText}>Back to Perks</Text>
                  </Pressable>
                  <Text style={lumoStyles.pageTitle}>{panelTitle}</Text>
                </>
              )}
            </View>
            <Pressable
              onPress={openMenu}
              style={({ pressed }) => [lumoStyles.menuButton, pressed && lumoStyles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Open Perks menu"
              hitSlop={8}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
            </Pressable>
          </View>

          {error ? (
            <Pressable onPress={() => void load()} style={lumoStyles.errorRow} accessibilityRole="button">
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={lumoStyles.errorText}>{error} Tap to retry.</Text>
              <Ionicons name="refresh" size={14} color={colors.muted} />
            </Pressable>
          ) : null}

          {panel === 'overview' ? (
            <>
              <Pressable
                onPress={() => openPanel('wallet')}
                style={({ pressed }) => [lumoStyles.walletCard, pressed && lumoStyles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Open Wallet details"
              >
                <View style={lumoStyles.walletCardMain}>
                  <View style={lumoStyles.walletCardLabelRow}>
                    <View style={lumoStyles.coinIcon}>
                      <Ionicons name="aperture" size={16} color={colors.accentStrong} />
                    </View>
                    <Text style={lumoStyles.walletCardLabel}>LUMO COIN BALANCE</Text>
                  </View>
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.accentStrong} style={lumoStyles.balanceLoading} />
                  ) : (
                    <View style={lumoStyles.balanceLine}>
                      <Text style={lumoStyles.balanceValue}>{formatCoinAmount(balance)}</Text>
                      <Text style={lumoStyles.balanceUnit}>COINS</Text>
                    </View>
                  )}
                  <Text style={lumoStyles.walletHint}>Available to collect and send digital gifts</Text>
                </View>
                <View style={lumoStyles.walletCardAction}>
                  <Ionicons name="arrow-up-right-box" size={18} color={colors.bg} />
                </View>
              </Pressable>

              <Pressable
                onPress={() => openPanel('plus')}
                style={({ pressed }) => [lumoStyles.plusRow, pressed && lumoStyles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Open LUMO Plus membership"
              >
                <View style={lumoStyles.plusIcon}>
                  <Ionicons name="diamond-outline" size={19} color={colors.accentStrong} />
                </View>
                <View style={lumoStyles.plusCopy}>
                  <Text style={lumoStyles.plusEyebrow}>MEMBERSHIP</Text>
                  <Text style={lumoStyles.plusTitle}>LUMO Plus</Text>
                  <Text numberOfLines={1} style={lumoStyles.plusDescription}>
                    {loading
                      ? 'Checking membership…'
                      : !membership
                        ? 'Membership status unavailable'
                        : isPlus
                          ? (expiry ? 'Active until ' + expiry : 'Premium membership active')
                          : 'Standard membership'}
                  </Text>
                </View>
                {!loading && membership ? (
                  <View style={[lumoStyles.statusPill, isPlus && lumoStyles.statusPillActive]}>
                    <Text style={[lumoStyles.statusText, isPlus && lumoStyles.statusTextActive]}>{isPlus ? 'ACTIVE' : 'STANDARD'}</Text>
                  </View>
                ) : loading ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : (
                  <Ionicons name="alert-circle-outline" size={17} color={colors.muted} />
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>

              <View style={[lumoStyles.lowerGrid, isWide && lumoStyles.lowerGridWide]}>
                <View style={[lumoStyles.sectionBlock, isWide && lumoStyles.halfColumn]}>
                  <View style={lumoStyles.sectionHeader}>
                    <View>
                      <Text style={lumoStyles.sectionTitle}>Recent activity</Text>
                      <Text style={lumoStyles.sectionCaption}>Your latest Coin movements</Text>
                    </View>
                    <Pressable onPress={() => openPanel('wallet')} style={lumoStyles.textAction} accessibilityRole="button">
                      <Text style={lumoStyles.textActionText}>See all</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.accentStrong} />
                    </Pressable>
                  </View>

                  {loading && transactions.length === 0 ? (
                    <View style={lumoStyles.compactState}><ActivityIndicator size="small" color={colors.accentStrong} /></View>
                  ) : transactions.length ? (
                    <View style={lumoStyles.activityCard}>
                      {transactions.map((item, index) => (
                        <View key={item.id} style={[lumoStyles.transactionRow, index > 0 && lumoStyles.transactionDivider]}>
                          <View style={lumoStyles.transactionIcon}>
                            <Ionicons
                              name={item.delta < 0 ? 'gift-outline' : 'add-circle-outline'}
                              size={16}
                              color={item.delta < 0 ? colors.muted : colors.success}
                            />
                          </View>
                          <View style={lumoStyles.transactionCopy}>
                            <Text numberOfLines={1} style={lumoStyles.transactionTitle}>{transactionLabel(item.transaction_type)}</Text>
                            <Text style={lumoStyles.transactionDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                          </View>
                          <Text style={[lumoStyles.transactionAmount, item.delta < 0 && lumoStyles.amountSpent]}>
                            {item.delta > 0 ? '+' : ''}{formatCoinAmount(item.delta)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Pressable onPress={() => openPanel('wallet')} style={lumoStyles.compactEmpty} accessibilityRole="button">
                      <Ionicons name="receipt-outline" size={18} color={colors.dim} />
                      <Text style={lumoStyles.emptyText}>Your Coin activity will appear here.</Text>
                    </Pressable>
                  )}
                </View>

                <View style={[lumoStyles.sectionBlock, isWide && lumoStyles.halfColumn]}>
                  <View style={lumoStyles.sectionHeader}>
                    <View>
                      <Text style={lumoStyles.sectionTitle}>Gift Vault</Text>
                      <Text style={lumoStyles.sectionCaption}>
                        {loading ? 'Refreshing gifts…' : inventory.length + ' ' + (inventory.length === 1 ? 'collectible' : 'collectibles') + ' in your collection'}
                      </Text>
                    </View>
                    <Pressable onPress={() => openPanel('gifts', giftPreviewTab)} style={lumoStyles.textAction} accessibilityRole="button">
                      <Text style={lumoStyles.textActionText}>Open</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.accentStrong} />
                    </Pressable>
                  </View>

                  <View style={lumoStyles.giftTabs}>
                    <Pressable
                      onPress={() => setGiftPreviewTab('store')}
                      style={[lumoStyles.giftTab, giftPreviewTab === 'store' && lumoStyles.giftTabActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: giftPreviewTab === 'store' }}
                    >
                      <Text style={[lumoStyles.giftTabText, giftPreviewTab === 'store' && lumoStyles.giftTabTextActive]}>Discover</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setGiftPreviewTab('collection')}
                      style={[lumoStyles.giftTab, giftPreviewTab === 'collection' && lumoStyles.giftTabActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: giftPreviewTab === 'collection' }}
                    >
                      <Text style={[lumoStyles.giftTabText, giftPreviewTab === 'collection' && lumoStyles.giftTabTextActive]}>My gifts</Text>
                      <Text style={lumoStyles.giftTabCount}>{inventory.length}</Text>
                    </Pressable>
                  </View>

                  {loading && visibleGifts.length === 0 ? (
                    <View style={lumoStyles.compactState}><ActivityIndicator size="small" color={colors.accentStrong} /></View>
                  ) : visibleGifts.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={lumoStyles.giftRail}
                    >
                      {visibleGifts.map((entry) => {
                        const gift = 'gift' in entry ? entry.gift : entry;
                        if (!gift) return null;
                        return (
                          <GiftPreviewCard
                            key={'id' in entry ? entry.id : gift.id}
                            title={gift.title}
                            rarity={gift.rarity}
                            price={giftPreviewTab === 'store' ? gift.coin_price : undefined}
                            imageUrl={gift.preview_url}
                            onPress={() => openPanel('gifts', giftPreviewTab)}
                          />
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={lumoStyles.compactEmpty}>
                      <Ionicons name={giftPreviewTab === 'store' ? 'gift-outline' : 'albums-outline'} size={19} color={colors.dim} />
                      <Text style={lumoStyles.emptyText}>
                        {giftPreviewTab === 'store' ? 'New gifts will appear here.' : 'Your collection is empty for now.'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={lumoStyles.bottomHint}>
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.dim} />
                <Text style={lumoStyles.bottomHintText}>Wallet, membership and gifts are managed securely by LUMO.</Text>
              </View>
            </>
          ) : panel === 'wallet' ? (
            <WalletScreen
              key="perks-wallet"
              embedded
              initialSection="coins"
              onOpenGifts={() => openPanel('gifts', 'store')}
            />
          ) : panel === 'plus' ? (
            <WalletScreen key="perks-plus" embedded initialSection="premium" />
          ) : (
            <GiftsStoreScreen
              key={'perks-gifts-' + giftPreviewTab}
              embedded
              initialTab={giftPreviewTab}
              onOpenWallet={() => openPanel('wallet')}
            />
          )}
        </View>
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMenu}
      >
        <View style={lumoStyles.drawerRoot}>
          <Pressable style={lumoStyles.drawerBackdrop} onPress={closeMenu} accessibilityLabel="Close Perks menu" />
          <Animated.View style={[lumoStyles.drawerPanel, { width: drawerWidth, transform: [{ translateX: drawerX }] }]}>
            <View style={lumoStyles.drawerHeader}>
              <View>
                <Text style={lumoStyles.drawerEyebrow}>LUMO / QUICK ACCESS</Text>
                <Text style={lumoStyles.drawerTitle}>Perks menu</Text>
              </View>
              <Pressable onPress={closeMenu} style={lumoStyles.drawerClose} accessibilityRole="button" accessibilityLabel="Close menu">
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <Text style={lumoStyles.drawerSectionLabel}>ACCOUNT</Text>
            <Pressable onPress={() => openPanel('wallet')} style={lumoStyles.drawerItem} accessibilityRole="button">
              <View style={lumoStyles.drawerItemIcon}><Ionicons name="wallet-outline" size={18} color={colors.accentStrong} /></View>
              <View style={lumoStyles.drawerItemCopy}>
                <Text style={lumoStyles.drawerItemTitle}>Wallet</Text>
                <Text style={lumoStyles.drawerItemDescription}>Balance and full transaction history</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.dim} />
            </Pressable>

            <Pressable onPress={() => openPanel('plus')} style={lumoStyles.drawerItem} accessibilityRole="button">
              <View style={lumoStyles.drawerItemIcon}><Ionicons name="diamond-outline" size={18} color={colors.accentStrong} /></View>
              <View style={lumoStyles.drawerItemCopy}>
                <Text style={lumoStyles.drawerItemTitle}>LUMO Plus</Text>
                <Text style={lumoStyles.drawerItemDescription}>Membership status and benefits</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.dim} />
            </Pressable>

            <View style={lumoStyles.drawerDivider} />
            <Text style={lumoStyles.drawerSectionLabel}>DIGITAL GIFTS</Text>

            <Pressable onPress={() => openPanel('gifts', 'store')} style={lumoStyles.drawerItem} accessibilityRole="button">
              <View style={lumoStyles.drawerItemIcon}><Ionicons name="sparkles-outline" size={18} color={colors.accentStrong} /></View>
              <View style={lumoStyles.drawerItemCopy}>
                <Text style={lumoStyles.drawerItemTitle}>Discover gifts</Text>
                <Text style={lumoStyles.drawerItemDescription}>Browse and preview collectibles</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.dim} />
            </Pressable>

            <Pressable onPress={() => openPanel('gifts', 'collection')} style={lumoStyles.drawerItem} accessibilityRole="button">
              <View style={lumoStyles.drawerItemIcon}><Ionicons name="albums-outline" size={18} color={colors.accentStrong} /></View>
              <View style={lumoStyles.drawerItemCopy}>
                <Text style={lumoStyles.drawerItemTitle}>My gifts</Text>
                <Text style={lumoStyles.drawerItemDescription}>{inventory.length} in your collection</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.dim} />
            </Pressable>

            <View style={lumoStyles.drawerBottom}>
              <Pressable onPress={() => { closeMenu(); void load(); }} style={lumoStyles.refreshAction} accessibilityRole="button">
                {loading ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="refresh-outline" size={16} color={colors.accentStrong} />}
                <Text style={lumoStyles.refreshActionText}>Refresh Perks</Text>
              </Pressable>
              <Text style={lumoStyles.drawerFootnote}>Everything in one place, without crowding the page.</Text>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 38 },
  content: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 20, gap: 13 },
  contentWide: { paddingHorizontal: 24, paddingTop: 26, gap: 15 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 2 },
  headerCopy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  pageTitle: { color: colors.text, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8 },
  pageSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 1 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 24, marginBottom: 2 },
  backButtonText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  walletCard: { minHeight: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 17, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  walletCardMain: { flex: 1, minWidth: 0 },
  walletCardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinIcon: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.surfaceRaised },
  walletCardLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  balanceLoading: { alignSelf: 'flex-start', marginTop: 10 },
  balanceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  balanceValue: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
  balanceUnit: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  walletHint: { color: colors.dim, fontSize: 9, lineHeight: 13, marginTop: 3 },
  walletCardAction: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.accentStrong },
  plusRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  plusIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.glassBorder },
  plusCopy: { flex: 1, minWidth: 0, gap: 2 },
  plusEyebrow: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  plusTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  plusDescription: { color: colors.muted, fontSize: 9, lineHeight: 13 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.surfaceRaised },
  statusPillActive: { backgroundColor: 'rgba(158,190,174,0.12)' },
  statusText: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  statusTextActive: { color: colors.success },
  lowerGrid: { gap: 16 },
  lowerGridWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  halfColumn: { flex: 1, minWidth: 0 },
  sectionBlock: { minWidth: 0, gap: 9 },
  sectionHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  sectionCaption: { color: colors.dim, fontSize: 9, marginTop: 3 },
  textAction: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7 },
  textActionText: { color: colors.accentStrong, fontSize: 9, fontWeight: '800' },
  activityCard: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  transactionRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 7 },
  transactionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  transactionIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.surfaceRaised },
  transactionCopy: { flex: 1, minWidth: 0 },
  transactionTitle: { color: colors.text, fontSize: 10, fontWeight: '800' },
  transactionDate: { color: colors.dim, fontSize: 8, marginTop: 3 },
  transactionAmount: { color: colors.success, fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  amountSpent: { color: colors.text },
  compactState: { minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  compactEmpty: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyText: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 14 },
  giftTabs: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, padding: 3, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  giftTab: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 7 },
  giftTabActive: { backgroundColor: colors.surface },
  giftTabText: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  giftTabTextActive: { color: colors.text, fontWeight: '900' },
  giftTabCount: { color: colors.dim, fontSize: 7, fontWeight: '800' },
  giftRail: { gap: 8, paddingRight: 3, paddingBottom: 2 },
  giftCard: { width: 158, minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  giftArtwork: { width: 48, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surfaceRaised },
  giftImage: { width: '100%', height: '100%' },
  giftCardCopy: { flex: 1, minWidth: 0, gap: 3 },
  giftRarity: { color: colors.dim, fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
  giftName: { color: colors.text, fontSize: 9, fontWeight: '900' },
  giftPrice: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giftPriceText: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  bottomHint: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border },
  bottomHintText: { color: colors.dim, fontSize: 8, lineHeight: 12 },
  errorRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.surface },
  errorText: { flex: 1, color: colors.danger, fontSize: 9, lineHeight: 13 },
  pressed: { opacity: 0.78 },
  drawerRoot: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(5,8,12,0.45)' },
  drawerBackdrop: { ...StyleSheet.absoluteFill },
  drawerPanel: { height: '100%', paddingTop: 28, paddingHorizontal: 17, paddingBottom: 22, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: colors.border },
  drawerEyebrow: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  drawerTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 5 },
  drawerClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surfaceRaised },
  drawerSectionLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 21, marginBottom: 8 },
  drawerItem: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 7, borderRadius: 11 },
  drawerItemIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surfaceRaised },
  drawerItemCopy: { flex: 1, minWidth: 0, gap: 3 },
  drawerItemTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  drawerItemDescription: { color: colors.muted, fontSize: 8, lineHeight: 12 },
  drawerDivider: { height: 1, backgroundColor: colors.border, marginTop: 12 },
  drawerBottom: { flex: 1, justifyContent: 'flex-end', gap: 10 },
  refreshAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  refreshActionText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  drawerFootnote: { color: colors.dim, fontSize: 8, lineHeight: 13, paddingHorizontal: 2 },
});
