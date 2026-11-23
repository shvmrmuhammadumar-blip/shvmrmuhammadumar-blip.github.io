import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { getMyCoinBalance, formatCoinAmount } from '../../lib/gifts';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { formatMembershipDate, getMyMembership, type MembershipSnapshot } from '../../lib/membership';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


type CoinTransaction = {
  id: string;
  transaction_type: string;
  delta: number;
  balance_after: number;
  created_at: string;
};

type DeveloperPaymentOrder = {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  provider: 'payme' | 'click';
  amount_usd: number;
  amount_uzs: number;
  idempotency_key: string;
  created_at: string;
};

const walletDb = supabase as any;
type WalletSection = 'coins' | 'premium';
type WalletInfoKey = 'balances' | 'plus' | 'membership' | 'verified' | 'payments';

function transactionLabel(type: string) {
  if (type === 'gift_purchase') return 'Gift acquired';
  if (type === 'gift_refund') return 'Gift refund';
  if (type === 'top_up') return 'Coin top-up';
  if (type === 'admin_adjustment') return 'Account adjustment';
  return 'Wallet activity';
}

function createTestPaymentKey() {
  return Date.now().toString(36) + '-' +
    Math.random().toString(36).slice(2) + '-' +
    Math.random().toString(36).slice(2);
}

function testPaymentStatusLabel(status: DeveloperPaymentOrder['status']) {
  if (status === 'paid') return 'PAID · VERIFIED';
  if (status === 'pending') return 'WAITING FOR PAYMENT';
  if (status === 'failed') return 'DECLINED';
  if (status === 'expired') return 'EXPIRED';
  return 'CANCELLED';
}

type WalletScreenProps = { embedded?: boolean; initialSection?: WalletSection; onOpenGifts?: () => void; showAllSections?: boolean; onCoinsLayout?: (y: number) => void; onPremiumLayout?: (y: number) => void };

export default function WalletScreen({ embedded = false, initialSection, onOpenGifts, showAllSections = false, onCoinsLayout, onPremiumLayout }: WalletScreenProps = {}) {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const requestedSection: WalletSection = initialSection ?? (params.section === 'premium' ? 'premium' : 'coins');
  const [section, setSection] = useState<WalletSection>(requestedSection);
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeInfo, setActiveInfo] = useState<WalletInfoKey | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [testPayments, setTestPayments] = useState<DeveloperPaymentOrder[]>([]);
  const [testPaymentWorking, setTestPaymentWorking] = useState(false);
  const [testPaymentMessage, setTestPaymentMessage] = useState('');
  const [testPaymentError, setTestPaymentError] = useState('');
  const testPaymentKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);


  useEffect(() => {
    setSection(requestedSection);
  }, [requestedSection]);

  const selectSection = (next: WalletSection) => {
    setSection(next);
    router.setParams({ section: next });
  };

  const load = useCallback(async () => {
    if (!userId) {
      setBalance(0);
      setTransactions([]);
      setMembership(null);
      setIsDeveloper(false);
      setTestPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setMembership(null);
    try {
      const [nextBalance, nextMembership, transactionResult, developerAccess] = await Promise.all([
        getMyCoinBalance(),
        getMyMembership(),
        walletDb.from('coin_transactions')
          .select('id, transaction_type, delta, balance_after, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        walletDb.rpc('is_lumo_plus_developer_test_allowed'),
      ]);
      if (transactionResult.error) throw transactionResult.error;
      if (developerAccess.error) throw developerAccess.error;
      const canTestPayments = developerAccess.data === true;
      setIsDeveloper(canTestPayments);
      setBalance(nextBalance);
      setMembership(nextMembership);
      setTransactions((transactionResult.data ?? []) as CoinTransaction[]);

      if (canTestPayments) {
        const paymentResult = await walletDb.from('developer_payment_orders')
          .select('id, status, provider, amount_usd, amount_uzs, idempotency_key, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(8);
        if (paymentResult.error) throw paymentResult.error;
        const loadedPayments = (paymentResult.data ?? []) as DeveloperPaymentOrder[];
        if (
          testPaymentKeyRef.current &&
          loadedPayments.some((payment) =>
            payment.idempotency_key === testPaymentKeyRef.current?.key &&
            payment.status !== 'pending'
          )
        ) {
          testPaymentKeyRef.current = null;
        }
        setTestPayments(loadedPayments);
      } else {
        setTestPayments([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet information could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const isPremium = membership?.membership_type === 'member_premium';
  const premiumExpiry = formatMembershipDate(membership?.expires_at ?? null);

  const runDeveloperTestPayment = async (
    provider: 'payme' | 'click',
    productType: 'lumo_plus' | 'gift' = 'lumo_plus',
    giftId?: string,
  ) => {
    if (!isDeveloper || testPaymentWorking) return;

    setTestPaymentWorking(true);
    setTestPaymentError('');
    setTestPaymentMessage('');

    const fingerprint = `${productType}:${giftId ?? 'none'}:${provider}`;
    const idempotencyKey = testPaymentKeyRef.current?.fingerprint === fingerprint
      ? testPaymentKeyRef.current.key
      : createTestPaymentKey();
    testPaymentKeyRef.current = { fingerprint, key: idempotencyKey };

    try {
      const { data, error: paymentError } = await supabase.functions.invoke(
        'developer-payment-create',
        {
          body: {
            product_type: productType,
            provider,
            gift_id: giftId ?? null,
            idempotency_key: idempotencyKey,
          },
        },
      );
      if (paymentError) throw paymentError;
      if (!data?.success || typeof data.checkout_url !== 'string') {
        throw new Error(data?.error ?? 'The payment provider did not return a checkout link.');
      }

      await Linking.openURL(data.checkout_url);
      setTestPaymentMessage(
        `${provider === 'payme' ? 'Payme' : 'Click'} Sandbox checkout opened for $0.10 (1,200 UZS). The product activates only after the provider confirms payment.`,
      );
      await load();
    } catch (cause) {
      setTestPaymentError(
        cause instanceof Error ? cause.message : 'Checkout could not be opened. Retry the same order safely.',
      );
    } finally {
      setTestPaymentWorking(false);
    }
  };

  const infoDetails: Record<WalletInfoKey, { title: string; body: string }> = {
    balances: {
      title: 'Separate balances',
      body: 'Creator earnings and Seller earnings are separate from LUMO Coins. Payouts and cash withdrawals are not enabled here.',
    },
    plus: {
      title: 'LUMO Plus',
      body: 'Available now: the Premium verified badge and one active Community Market product listing. Planned next: deeper Creator Studio analytics, LUMO LIVE Pro tools and a private Story Archive. Planned features are not active entitlements yet.',
    },
    membership: {
      title: 'Your membership',
      body: !membership
        ? 'Membership status could not be loaded. Please refresh Wallet.'
        : isPremium
          ? premiumExpiry ? 'Your Premium membership is valid until ' + premiumExpiry + '.' : 'Your Premium membership is active with no scheduled expiry.'
          : 'Your account currently has the standard LUMO membership.',
    },
    verified: {
      title: 'Premium verified badge',
      body: 'A blue checkmark appears beside your profile name while Premium is active.',
    },
    payments: {
      title: 'Premium payments',
      body: 'Only Developer accounts can use provider Sandbox checkout. Payme uses the official public test merchant. Click requires LUMO’s own Click test Merchant credentials. The server activates a product only after a verified provider callback; no public checkout is enabled.',
    },
  };
  const activeInfoDetails = activeInfo ? infoDetails[activeInfo] : null;

  const walletContent = (
    <View style={[lumoStyles.container, showAllSections && lumoStyles.containerWide]}>
          {!embedded ? (
            <>
              <View style={lumoStyles.header}>
                <View><Text style={lumoStyles.eyebrow}>{section === 'premium' ? 'LUMO / MEMBERSHIP' : 'LUMO / PAYMENTS'}</Text><Text style={lumoStyles.title}>{section === 'premium' ? 'LUMO Plus' : 'Wallet'}</Text></View>
                <View style={lumoStyles.headerIcon}><Ionicons name={section === 'premium' ? 'diamond-outline' : 'wallet-outline'} size={22} color={colors.accentStrong} /></View>
              </View>

              <View style={lumoStyles.sectionSwitch}>
                <Pressable onPress={() => selectSection('coins')} style={[lumoStyles.sectionTab, section === 'coins' && lumoStyles.sectionTabActive]}>
                  <Ionicons name="aperture" size={16} color={section === 'coins' ? colors.text : colors.muted} />
                  <Text style={[lumoStyles.sectionTabText, section === 'coins' && lumoStyles.sectionTabTextActive]}>Coins</Text>
                </Pressable>
                <Pressable onPress={() => selectSection('premium')} style={[lumoStyles.sectionTab, section === 'premium' && lumoStyles.sectionTabActive]}>
                  <Ionicons name="diamond-outline" size={16} color={section === 'premium' ? colors.text : colors.muted} />
                  <Text style={[lumoStyles.sectionTabText, section === 'premium' && lumoStyles.sectionTabTextActive]}>Premium</Text>
                  {isPremium ? <View style={lumoStyles.activeDot} /> : null}
                </Pressable>
              </View>
            </>
          ) : null}

          {error ? <Text style={lumoStyles.error}>{error}</Text> : null}

          {(section === 'coins' || showAllSections) ? (
            <View onLayout={(event) => onCoinsLayout?.(event.nativeEvent.layout.y)}>
              <>
              <View style={lumoStyles.balanceCard}>
                <Text style={lumoStyles.balanceLabel}>LUMO COIN BALANCE</Text>
                {loading ? (
                  <ActivityIndicator color={colors.accentStrong} style={lumoStyles.balanceLoader} />
                ) : (
                  <View style={lumoStyles.balanceLine}>
                    <Ionicons name="aperture" size={26} color={colors.accentStrong} />
                    <Text style={lumoStyles.balanceValue}>{formatCoinAmount(balance)}</Text>
                    <Text style={lumoStyles.coinLabel}>COINS</Text>
                  </View>
                )}
                <Text style={lumoStyles.balanceDescription}>Your in-app balance for virtual gifts.</Text>
                <Pressable onPress={onOpenGifts ?? (() => router.push('/gifts?tab=store' as never))} style={({ pressed }) => [lumoStyles.primaryButton, pressed && lumoStyles.pressed]}>
                  <Text style={lumoStyles.primaryButtonText}>Explore Gifts</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.bg} />
                </Pressable>
              </View>

              <View style={lumoStyles.sectionHeader}>
                <Text style={lumoStyles.sectionTitle}>Recent activity</Text>
                <Text style={lumoStyles.sectionMeta}>LATEST 20</Text>
              </View>

              {loading ? (
                <View style={lumoStyles.emptyActivity}><ActivityIndicator color={colors.accentStrong} /></View>
              ) : transactions.length ? (
                <View style={lumoStyles.activityCard}>
                  {transactions.map((item, index) => (
                    <View key={item.id} style={[lumoStyles.transactionRow, index > 0 && lumoStyles.transactionDivider]}>
                      <View style={lumoStyles.transactionIcon}>
                        <Ionicons name={item.delta < 0 ? 'gift-outline' : 'add-circle-outline'} size={18} color={item.delta < 0 ? colors.muted : colors.success} />
                      </View>
                      <View style={lumoStyles.transactionCopy}>
                        <Text style={lumoStyles.transactionTitle}>{transactionLabel(item.transaction_type)}</Text>
                        <Text style={lumoStyles.transactionDate}>{new Date(item.created_at).toLocaleString()}</Text>
                      </View>
                      <View style={lumoStyles.transactionAmountBlock}>
                        <Text style={[lumoStyles.transactionAmount, item.delta < 0 && lumoStyles.amountSpent]}>
                          {item.delta > 0 ? '+' : ''}{formatCoinAmount(item.delta)}
                        </Text>
                        <Text style={lumoStyles.transactionBalance}>{formatCoinAmount(item.balance_after)} after</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={lumoStyles.emptyActivity}>
                  <Ionicons name="receipt-outline" size={24} color={colors.dim} />
                  <Text style={lumoStyles.emptyTitle}>No transactions yet</Text>
                  <Text style={lumoStyles.emptyText}>Your verified Coin activity will appear here.</Text>
                </View>
              )}

              <View style={lumoStyles.paymentNotice}>
                <Ionicons name="lock-closed-outline" size={17} color={colors.accentStrong} />
                <View style={lumoStyles.paymentCopy}>
                  <Text style={lumoStyles.paymentTitle}>Coin top-ups are not active</Text>
                  <Text style={lumoStyles.paymentText}>A payment provider, verified webhooks and refund controls must be connected before Coins can be purchased. No payment is collected in this build.</Text>
                </View>
              </View>

              <View style={lumoStyles.separateNote}>
                <View style={lumoStyles.infoTriggerRow}>
                  <Text style={lumoStyles.separateTitle}>Separate balances</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="About separate balances" onPress={() => setActiveInfo('balances')} style={lumoStyles.infoButton} hitSlop={6}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
              </>
            </View>
          ) : null}

          {(section === 'premium' || showAllSections) ? (
            <View onLayout={(event) => onPremiumLayout?.(event.nativeEvent.layout.y)}>
              <>
              <View style={lumoStyles.premiumHero}>
                <View style={lumoStyles.premiumHeroIcon}>
                  <Ionicons name="diamond" size={25} color={colors.accentStrong} />
                </View>
                <View style={lumoStyles.premiumCopy}>
                  <Text style={lumoStyles.premiumEyebrow}>LUMO PLUS · PREMIUM</Text>
                  <Text style={lumoStyles.premiumTitle}>LUMO Plus</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="About LUMO Plus" onPress={() => setActiveInfo('plus')} style={lumoStyles.infoButton} hitSlop={6}>
                  <Ionicons name="information-circle-outline" size={19} color={colors.muted} />
                </Pressable>
              </View>

              <View style={[lumoStyles.membershipCard, isPremium && lumoStyles.membershipCardActive]}>
                <View style={lumoStyles.membershipTop}>
                  <View style={[lumoStyles.membershipIcon, isPremium && lumoStyles.membershipIconActive]}>
                    <Ionicons name={isPremium ? 'checkmark-circle' : 'person-circle-outline'} size={24} color={isPremium ? colors.success : colors.muted} />
                  </View>
                  <View style={lumoStyles.membershipCopy}>
                    <View style={lumoStyles.membershipLabelRow}>
                      <Text style={lumoStyles.membershipLabel}>YOUR MEMBERSHIP</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="About your membership" onPress={() => setActiveInfo('membership')} style={lumoStyles.infoButtonSmall} hitSlop={6}>
                        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                    <Text style={lumoStyles.membershipTitle}>
                      {loading ? 'Checking status…' : !membership ? 'Status unavailable' : isPremium ? 'Premium is active' : 'Standard membership'}
                    </Text>
                  </View>
                  {!loading && membership ? (
                    <View style={[lumoStyles.membershipPill, isPremium && lumoStyles.membershipPillActive]}>
                      <Text style={[lumoStyles.membershipPillText, isPremium && lumoStyles.membershipPillTextActive]}>{isPremium ? 'ACTIVE' : 'MEMBER'}</Text>
                    </View>
                  ) : null}
                </View>
                {loading ? <ActivityIndicator color={colors.accentStrong} style={lumoStyles.membershipLoader} /> : null}
              </View>

              <View style={lumoStyles.premiumBenefitCard}>
                <View style={lumoStyles.premiumBenefitIcon}>
                  <Ionicons name="checkmark-circle" size={23} color={resolveThemeColor("#55A5FF", "color")} />
                </View>
                <View style={lumoStyles.premiumBenefitCopy}>
                  <View style={lumoStyles.infoTriggerRow}>
                    <Text style={lumoStyles.premiumBenefitTitle}>Premium verified badge</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="About the Premium verified badge" onPress={() => setActiveInfo('verified')} style={lumoStyles.infoButtonSmall} hitSlop={6}>
                      <Ionicons name="information-circle-outline" size={17} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={lumoStyles.premiumBenefitCard}>
                <View style={[lumoStyles.premiumBenefitIcon, { backgroundColor: resolveThemeColor("rgba(158,190,174,0.12)", "backgroundColor") }]}>
                  <Ionicons name="storefront-outline" size={21} color={colors.success} />
                </View>
                <View style={lumoStyles.premiumBenefitCopy}>
                  <Text style={lumoStyles.premiumBenefitTitle}>Community Market · 1 product</Text>
                  <Text style={lumoStyles.premiumBenefitText}>Publish one active product listing in Community Market while LUMO Plus is active.</Text>
                </View>
              </View>

              <View style={lumoStyles.premiumSectionHeading}>
                <Text style={lumoStyles.sectionTitle}>Coming to LUMO Plus</Text>
                <Text style={lumoStyles.sectionMeta}>PLANNED · NOT ACTIVE YET</Text>
              </View>

              <View style={lumoStyles.premiumBenefitCard}>
                <View style={lumoStyles.premiumBenefitIcon}>
                  <Ionicons name="analytics-outline" size={21} color={colors.accentStrong} />
                </View>
                <View style={lumoStyles.premiumBenefitCopy}>
                  <Text style={lumoStyles.premiumBenefitTitle}>Creator Studio Insights</Text>
                  <Text style={lumoStyles.premiumBenefitText}>Deeper watch-time, completion, unique-viewer and content-performance reports.</Text>
                </View>
                <View style={lumoStyles.comingSoonTag}><Text style={lumoStyles.comingSoonText}>SOON</Text></View>
              </View>

              <View style={lumoStyles.premiumBenefitCard}>
                <View style={lumoStyles.premiumBenefitIcon}>
                  <Ionicons name="radio-outline" size={21} color={colors.accentStrong} />
                </View>
                <View style={lumoStyles.premiumBenefitCopy}>
                  <Text style={lumoStyles.premiumBenefitTitle}>LUMO LIVE Pro</Text>
                  <Text style={lumoStyles.premiumBenefitText}>More stage capacity, advanced host controls and post-live statistics.</Text>
                </View>
                <View style={lumoStyles.comingSoonTag}><Text style={lumoStyles.comingSoonText}>SOON</Text></View>
              </View>

              <View style={lumoStyles.premiumBenefitCard}>
                <View style={lumoStyles.premiumBenefitIcon}>
                  <Ionicons name="time-outline" size={21} color={colors.accentStrong} />
                </View>
                <View style={lumoStyles.premiumBenefitCopy}>
                  <Text style={lumoStyles.premiumBenefitTitle}>Story Archive</Text>
                  <Text style={lumoStyles.premiumBenefitText}>A private archive for your expired stories and their insights.</Text>
                </View>
                <View style={lumoStyles.comingSoonTag}><Text style={lumoStyles.comingSoonText}>SOON</Text></View>
              </View>

              <View style={lumoStyles.testCheckoutCard}>
                <View style={lumoStyles.testCheckoutHeader}>
                  <View style={lumoStyles.testCheckoutIcon}>
                    <Ionicons name="card-outline" size={20} color={colors.accentStrong} />
                  </View>
                  <View style={lumoStyles.testCheckoutCopy}>
                    <Text style={lumoStyles.testCheckoutEyebrow}>LUMO PLUS CHECKOUT</Text>
                    <Text style={lumoStyles.testCheckoutTitle}>30-day membership</Text>
                  </View>
                  <View style={lumoStyles.testOnlyTag}><Text style={lumoStyles.testOnlyText}>TEST ONLY</Text></View>
                </View>

                <View style={lumoStyles.testPriceRow}>
                  <Text style={lumoStyles.testPrice}>$0.10</Text>
                  <Text style={lumoStyles.testPriceCaption}>≈ 1,200 UZS · 30 days</Text>
                </View>
                <Text style={lumoStyles.testCheckoutNotice}>
                  Developer-only provider test. Payme opens its official Sandbox checkout; Click opens only after Click test Merchant credentials are configured. Premium activates only after a verified server callback.
                </Text>

                {isDeveloper ? (
                  <>
                    <Text style={lumoStyles.testActionLabel}>Choose a test payment provider</Text>
                    <View style={lumoStyles.testActionGrid}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void runDeveloperTestPayment('payme')}
                        disabled={testPaymentWorking || loading}
                        style={[lumoStyles.testActionButton, lumoStyles.testActionPaid, (testPaymentWorking || loading) && lumoStyles.testActionDisabled]}
                      >
                        {testPaymentWorking ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="checkmark-circle-outline" size={16} color={colors.bg} />}
                        <Text style={lumoStyles.testActionPaidText}>Payme Sandbox</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void runDeveloperTestPayment('click')}
                        disabled={testPaymentWorking || loading}
                        style={[lumoStyles.testActionButton, lumoStyles.testActionNeutral, (testPaymentWorking || loading) && lumoStyles.testActionDisabled]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={colors.text} />
                        <Text style={lumoStyles.testActionNeutralText}>Click Sandbox</Text>
                      </Pressable>
                    </View>

                    {testPaymentMessage ? (
                      <View style={lumoStyles.testResultNotice}>
                        <Ionicons name="information-circle-outline" size={16} color={colors.accentStrong} />
                        <Text style={lumoStyles.testResultText}>{testPaymentMessage}</Text>
                      </View>
                    ) : null}
                    {testPaymentError ? (
                      <View style={lumoStyles.testErrorNotice}>
                        <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                        <Text style={lumoStyles.testErrorText}>{testPaymentError}</Text>
                      </View>
                    ) : null}

                    <View style={lumoStyles.testHistoryHeader}>
                      <Text style={lumoStyles.testHistoryTitle}>Provider payment history</Text>
                      <Text style={lumoStyles.sectionMeta}>LATEST 8</Text>
                    </View>
                    {testPayments.length ? (
                      <View style={lumoStyles.testHistoryList}>
                        {testPayments.map((payment) => (
                          <View key={payment.id} style={lumoStyles.testHistoryRow}>
                            <View style={lumoStyles.testHistoryCopy}>
                              <Text style={lumoStyles.testHistoryStatus}>{testPaymentStatusLabel(payment.status)}</Text>
                              <Text style={lumoStyles.testHistoryDate}>{new Date(payment.created_at).toLocaleString()}</Text>
                            </View>
                            <Text style={lumoStyles.testHistoryAmount}>
                              ${payment.amount_usd.toFixed(2)} USD · ${payment.amount_uzs.toLocaleString()} UZS · ${payment.provider.toUpperCase()}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={lumoStyles.testHistoryEmpty}>No test payments yet.</Text>
                    )}
                  </>
                ) : (
                  <View style={lumoStyles.testRestrictedNotice}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
                    <Text style={lumoStyles.testRestrictedText}>Checkout is currently available only to Developer accounts while the payment flow is being tested.</Text>
                  </View>
                )}

                <Pressable accessibilityRole="button" onPress={() => setActiveInfo('payments')} style={lumoStyles.testInfoLink}>
                  <Text style={lumoStyles.testInfoLinkText}>About test payments and activation</Text>
                  <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
                </Pressable>
              </View>
              </>
            </View>
          ) : null}
      <Modal
        visible={activeInfoDetails !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActiveInfo(null)}
      >
        <View style={lumoStyles.modalRoot}>
          <Pressable style={lumoStyles.modalScrim} onPress={() => setActiveInfo(null)} />
          <View style={lumoStyles.infoModal}>
            <View style={lumoStyles.modalHeader}>
              <View style={lumoStyles.modalIcon}>
                <Ionicons name="information-outline" size={20} color={colors.accentStrong} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setActiveInfo(null)} style={lumoStyles.modalClose} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <Text style={lumoStyles.modalTitle}>{activeInfoDetails?.title}</Text>
            <Text style={lumoStyles.modalBody}>{activeInfoDetails?.body}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <View style={[lumoStyles.root, embedded && lumoStyles.rootEmbedded]}>
      {embedded ? (
        <View style={[lumoStyles.content, lumoStyles.contentEmbedded]}>{walletContent}</View>
      ) : (
        <ScrollView contentContainerStyle={lumoStyles.content} showsVerticalScrollIndicator={false}>
          {walletContent}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootEmbedded: { flex: 0 },
  content: { padding: 20, paddingTop: 28, paddingBottom: 52 },
  contentEmbedded: { paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 },
  container: { width: '100%', maxWidth: 840, alignSelf: 'center' },
  containerWide: { maxWidth: 1180 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 29, fontWeight: '800', marginTop: 4, letterSpacing: -0.8 },
  headerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  sectionSwitch: { flexDirection: 'row', gap: 7, padding: 5, marginBottom: 18, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sectionTab: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10 },
  sectionTabActive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.glassBorder },
  sectionTabText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sectionTabTextActive: { color: colors.text, fontWeight: '900' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  premiumHero: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 17, backgroundColor: '#10151C', borderWidth: 1, borderColor: colors.border },
  premiumHeroIcon: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.glassBorder },
  premiumCopy: { flex: 1, minWidth: 0, gap: 2 },
  premiumEyebrow: { color: colors.accentStrong, fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  premiumTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 1 },
  premiumSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 1 },
  membershipCard: { padding: 16, marginTop: 14, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 13 },
  membershipCardActive: { borderColor: 'rgba(158,190,174,0.45)' },
  membershipTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  membershipIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.surfaceRaised },
  membershipIconActive: { backgroundColor: 'rgba(158,190,174,0.12)' },
  membershipCopy: { flex: 1, minWidth: 0, gap: 4 },
  membershipLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  membershipTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  membershipPill: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  membershipPillActive: { backgroundColor: 'rgba(158,190,174,0.12)' },
  membershipPillText: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  membershipPillTextActive: { color: colors.success },
  membershipDescription: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  membershipLoader: { alignSelf: 'flex-start' },
  premiumBenefitCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, marginTop: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  premiumBenefitIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(85,165,255,0.12)' },
  premiumBenefitCopy: { flex: 1, gap: 4 },
  premiumBenefitTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  premiumBenefitText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  premiumPaymentNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, marginTop: 12, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  premiumPaymentText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 16 },
  premiumSectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 25, marginBottom: 2 },
  comingSoonTag: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  comingSoonText: { color: colors.dim, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  testCheckoutCard: { padding: 16, marginTop: 18, borderRadius: 18, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: '#10151C', gap: 12 },
  testCheckoutHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  testCheckoutIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised },
  testCheckoutCopy: { flex: 1, minWidth: 0, gap: 3 },
  testCheckoutEyebrow: { color: colors.accentStrong, fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  testCheckoutTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  testOnlyTag: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(216,184,121,0.12)', borderWidth: 1, borderColor: 'rgba(216,184,121,0.28)' },
  testOnlyText: { color: '#D8B879', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  testPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, paddingTop: 5 },
  testPrice: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  testPriceCaption: { color: colors.muted, fontSize: 9 },
  testCheckoutNotice: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  testActionLabel: { color: colors.text, fontSize: 9, fontWeight: '900', marginTop: 3 },
  testActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  testActionButton: { flexGrow: 1, minWidth: 90, minHeight: 40, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  testActionPaid: { backgroundColor: colors.accentStrong },
  testActionPaidText: { color: colors.bg, fontSize: 9, fontWeight: '900' },
  testActionNeutral: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  testActionNeutralText: { color: colors.text, fontSize: 9, fontWeight: '800' },
  testActionDisabled: { opacity: 0.48 },
  testResultNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  testResultText: { flex: 1, color: colors.text, fontSize: 9, lineHeight: 14 },
  testErrorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(220,90,90,0.08)', borderWidth: 1, borderColor: 'rgba(220,90,90,0.22)' },
  testErrorText: { flex: 1, color: colors.danger, fontSize: 9, lineHeight: 14 },
  testHistoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  testHistoryTitle: { color: colors.text, fontSize: 10, fontWeight: '900' },
  testHistoryList: { borderRadius: 11, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  testHistoryRow: { minHeight: 52, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  testHistoryCopy: { flex: 1, minWidth: 0, gap: 3 },
  testHistoryStatus: { color: colors.text, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  testHistoryDate: { color: colors.dim, fontSize: 8 },
  testHistoryAmount: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  testHistoryEmpty: { color: colors.dim, fontSize: 9, paddingVertical: 5 },
  testRestrictedNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  testRestrictedText: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 14 },
  testInfoLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 7 },
  testInfoLinkText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  balanceCard: { padding: 22, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  balanceLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  balanceLoader: { alignSelf: 'flex-start', marginTop: 20, marginBottom: 9 },
  balanceLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 17 },
  balanceValue: { color: colors.text, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  coinLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  balanceDescription: { color: colors.muted, fontSize: 11, marginTop: 8 },
  primaryButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 21, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.accentStrong },
  primaryButtonText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sectionMeta: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  activityCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  transactionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10 },
  transactionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  transactionIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flex: 1, minWidth: 0 },
  transactionTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  transactionDate: { color: colors.dim, fontSize: 9, marginTop: 4 },
  transactionAmountBlock: { alignItems: 'flex-end' },
  transactionAmount: { color: colors.success, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  amountSpent: { color: colors.text },
  transactionBalance: { color: colors.dim, fontSize: 8, marginTop: 4 },
  emptyActivity: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 10 },
  paymentNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 22, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  paymentCopy: { flex: 1 },
  paymentTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  paymentText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  separateNote: { paddingTop: 16, marginTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  separateTitle: { color: colors.text, fontSize: 10, fontWeight: '800' },
  infoTriggerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  infoButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  infoButtonSmall: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  membershipLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.76)' },
  infoModal: { width: '100%', maxWidth: 420, padding: 20, borderRadius: 20, backgroundColor: '#111820', borderWidth: 1, borderColor: colors.glassBorder },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  modalClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  modalBody: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 9 },
  error: { color: colors.danger, fontSize: 11, marginTop: 12 },
  pressed: { opacity: 0.78 },
});
