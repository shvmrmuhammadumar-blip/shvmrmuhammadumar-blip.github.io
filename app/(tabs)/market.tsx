import React, { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useAuth } from "../../lib/auth";
import { getMarketFavoriteIds, getMarketListings, type MarketKind, type MarketListing } from "../../lib/market";
import { getOfficialCatalog, getPlatformRoles, type OfficialProduct, type OfficialStore, type PlatformRole } from "../../lib/market-official";
import { colors } from "../../lib/theme";
import MarketListingCard from "../../components/market/MarketListingCard";

type MarketTab = "originals" | "community" | "saved" | "mine";
type CommunityKind = "all" | "product" | "service";
const tabs: { key: MarketTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "originals", label: "Lumo Originals", icon: "sparkles-outline" },
  { key: "community", label: "Community Market", icon: "storefront-outline" },
  { key: "saved", label: "Saved", icon: "heart-outline" },
  { key: "mine", label: "My listings", icon: "pricetag-outline" },
];
const productCategories = ["All", "Electronics", "Fashion", "Home", "Vehicles", "Beauty", "Sports", "Other"];
const serviceCategories = ["All", "Web & Design", "IT & Tech", "Repairs", "Education", "Home Services", "Business", "Other"];

function formatPrice(price: number, currency: "UZS" | "USD") {
  if (!price || price <= 0) return "Price on request";
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(price);
  return currency === "UZS" ? `${amount} UZS` : `$${amount}`;
}

function OfficialProductCard({ item, basis, onPress }: { item: OfficialProduct; basis: `${number}%`; onPress: () => void }) {
  const imageUrl = item.images?.[0];
  return (
    <View style={[styles.productGridItem, { flexBasis: basis }]}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.productCard, pressed && styles.pressed]} accessibilityRole="button">
        <View style={styles.productImageWrap}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" /> : (
            <View style={styles.productPlaceholder}><Ionicons name="cube-outline" size={34} color={colors.dim} /><Text style={styles.placeholderLabel}>LUMO ORIGINALS</Text></View>
          )}
          {item.is_featured ? <View style={styles.featuredBadge}><Ionicons name="sparkles" size={10} color={colors.bg} /><Text style={styles.featuredText}>FEATURED</Text></View> : null}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productCategory}>{item.category || "LUMO ORIGINALS"}</Text>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.productPriceRow}>
            <Text style={styles.productPrice}>{formatPrice(item.price, item.currency)}</Text>
            <View style={styles.productArrow}><Ionicons name="arrow-forward" size={15} color={colors.accentStrong} /></View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export default function MarketScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [activeTab, setActiveTab] = useState<MarketTab>("originals");
  const [communityKind, setCommunityKind] = useState<CommunityKind>("all");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [officialProducts, setOfficialProducts] = useState<OfficialProduct[]>([]);
  const [officialStore, setOfficialStore] = useState<OfficialStore | null>(null);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!userId) {
      setLoading(false); setListings([]); setOfficialProducts([]); setOfficialStore(null); setRoles([]); return;
    }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const nextRoles = await getPlatformRoles(userId);
      setRoles(nextRoles);
      if (activeTab === "originals") {
        const catalog = await getOfficialCatalog();
        setOfficialStore(catalog.store); setOfficialProducts(catalog.products); setListings([]);
      } else if (activeTab === "saved") {
        const ids = await getMarketFavoriteIds(userId);
        setListings(await getMarketListings({ listingIds: ids, limit: 100 })); setOfficialProducts([]);
      } else if (activeTab === "mine") {
        setListings(await getMarketListings({ ownerId: userId, limit: 100 })); setOfficialProducts([]);
      } else {
        const kind: MarketKind | "all" = communityKind;
        setListings(await getMarketListings({ kind, limit: 100 })); setOfficialProducts([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Market ma’lumotlarini yuklab bo‘lmadi.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [activeTab, communityKind, userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const isOriginals = activeTab === "originals";
  const isCommunity = activeTab === "community";
  const isMine = activeTab === "mine";
  const isStaff = roles.includes("owner") || roles.includes("developer") || roles.includes("admin");
  const categories = communityKind === "service" ? serviceCategories : productCategories;
  const cardBasis = width < 530 ? "48%" : width < 900 ? "31.5%" : "23.5%";

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listings.filter((item) => {
      const matchesKind = communityKind === "all" || item.kind === communityKind;
      const matchesCategory = category === "All" || item.category.toLowerCase() === category.toLowerCase();
      const text = [item.title, item.description, item.category, item.city, item.region, item.seller?.username, item.seller?.full_name].filter(Boolean).join(" ").toLowerCase();
      return matchesKind && matchesCategory && (!term || text.includes(term));
    });
  }, [listings, communityKind, category, search]);

  const filteredOfficial = useMemo(() => {
    const term = search.trim().toLowerCase();
    return officialProducts.filter((item) => !term || [item.name, item.short_description, item.description, item.category].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [officialProducts, search]);

  const changeTab = (tab: MarketTab) => {
    setActiveTab(tab); setCategory("All"); setSearch("");
    if (tab === "community") setCommunityKind("all");
  };
  const openCreateListing = () => router.push("/market/create" as never);
  const openListing = (id: string) => router.push(`/market/${id}` as never);
  const sectionTitle = isOriginals ? "The official collection" : isCommunity ? "Community Market" : activeTab === "saved" ? "Saved listings" : "Your listings";
  const sectionDescription = isOriginals
    ? "Designed and selected by the Lumo team. One official collection."
    : isCommunity ? "Discover products and services shared by people on Lumo."
    : activeTab === "saved" ? "The products and services you want to come back to."
    : "Keep track of the listings you have published on Lumo.";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.topLine}>
            <View style={styles.brandLine}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>L</Text></View>
              <View><Text style={styles.eyebrow}>DISCOVER / TRADE / CONNECT</Text><Text style={styles.brandName}>LUMO MARKET</Text></View>
            </View>
            {(isCommunity || isMine) ? (
              <Pressable onPress={openCreateListing} style={({ pressed }) => [styles.sellButton, pressed && styles.pressed]}>
                <Ionicons name="add" size={18} color={colors.bg} /><Text style={styles.sellButtonText}>Create listing</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.hero}>
            <View style={styles.heroContent}>
              <View style={styles.heroEyebrowRow}><View style={styles.heroEyebrowLine} /><Text style={styles.heroEyebrow}>A MORE CONSIDERED MARKETPLACE</Text></View>
              <Text style={styles.heroTitle}>Find something{"\n"}<Text style={styles.heroAccent}>worth keeping.</Text></Text>
              <Text style={styles.heroDescription}>Explore the official Lumo collection or discover useful finds and services from the community.</Text>
              <View style={styles.heroActions}>
                <Pressable onPress={() => changeTab("originals")} style={({ pressed }) => [styles.heroPrimary, pressed && styles.pressed]}>
                  <Text style={styles.heroPrimaryText}>Explore Originals</Text><Ionicons name="arrow-forward" size={16} color={colors.bg} />
                </Pressable>
                <Pressable onPress={() => changeTab("community")} style={({ pressed }) => [styles.heroSecondary, pressed && styles.pressed]}>
                  <Text style={styles.heroSecondaryText}>Browse community</Text><Ionicons name="arrow-forward" size={15} color={colors.text} />
                </Pressable>
              </View>
            </View>
            {width >= 640 ? (
              <View style={styles.heroVisual} pointerEvents="none">
                <View style={styles.orbitOuter} /><View style={styles.orbitMiddle} />
                <View style={styles.orbitInner}><Text style={styles.heroVisualLetter}>L</Text></View>
                <View style={styles.heroVisualLabel}><View style={styles.heroVisualDot} /><Text style={styles.heroVisualLabelText}>ORIGINAL BY LUMO</Text></View>
                <View style={styles.heroVisualIndex}><Text style={styles.heroVisualIndexText}>01 / 02</Text></View>
              </View>
            ) : null}
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={19} color={colors.muted} />
              <TextInput value={search} onChangeText={setSearch} placeholder={isOriginals ? "Search the official collection" : "Search products and services"} placeholderTextColor={colors.dim} style={styles.searchInput} returnKeyType="search" autoCorrect={false} />
              {search.length > 0 ? <Pressable onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
            </View>
            <Pressable onPress={() => void load(true)} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh Market">
              {refreshing ? <ActivityIndicator color={colors.accentStrong} size="small" /> : <Ionicons name="refresh" size={19} color={colors.accentStrong} />}
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {tabs.map((tab) => {
              const selected = activeTab === tab.key;
              return <Pressable key={tab.key} onPress={() => changeTab(tab.key)} style={[styles.tab, selected && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected }}>
                <Ionicons name={tab.icon} size={15} color={selected ? colors.bg : colors.muted} />
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>;
            })}
          </ScrollView>

          {!isOriginals ? (
            <View style={styles.filtersBlock}>
              <View style={styles.kindFilters}>
                {([
                  { key: "all", label: "All listings" },
                  { key: "product", label: "Products" },
                  { key: "service", label: "Services" },
                ] as { key: CommunityKind; label: string }[]).map((item) => {
                  const selected = communityKind === item.key;
                  return <Pressable key={item.key} onPress={() => { setCommunityKind(item.key); setCategory("All"); }} style={[styles.kindChip, selected && styles.kindChipActive]}>
                    <Text style={[styles.kindChipText, selected && styles.kindChipTextActive]}>{item.label}</Text>
                  </Pressable>;
                })}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {categories.map((item) => {
                  const selected = category === item;
                  return <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, selected && styles.categoryChipActive]}>
                    <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{item}</Text>
                  </Pressable>;
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionEyebrow}>{isOriginals ? "EXCLUSIVE TO LUMO" : isMine ? "YOUR SELLER SPACE" : activeTab === "saved" ? "YOUR COLLECTION" : "FROM THE LUMO COMMUNITY"}</Text>
              <Text style={styles.sectionTitle}>{sectionTitle}</Text>
              <Text style={styles.sectionDescription}>{sectionDescription}</Text>
            </View>
            {isStaff && isOriginals ? (
              <Pressable
                onPress={() => router.push("/market/originals/manage" as never)}
                style={({ pressed }) => [styles.staffBadge, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Manage Lumo Originals catalog"
              >
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.accentStrong} />
                <Text style={styles.staffBadgeText}>MANAGE ORIGINALS</Text>
                <Ionicons name="arrow-forward" size={12} color={colors.accentStrong} />
              </Pressable>
            ) : null}
            {!isStaff && isOriginals ? (
              <Pressable
                onPress={() => router.push("/market/originals/my-orders" as never)}
                style={({ pressed }) => [styles.staffBadge, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="View my Lumo Originals orders"
              >
                <Ionicons name="receipt-outline" size={13} color={colors.accentStrong} />
                <Text style={styles.staffBadgeText}>MY ORDERS</Text>
                <Ionicons name="arrow-forward" size={12} color={colors.accentStrong} />
              </Pressable>
            ) : null}
          </View>

          {isStaff && isOriginals && officialStore && !officialStore.is_published ? (
            <View style={styles.staffNotice}>
              <Ionicons name="eye-off-outline" size={17} color={colors.accentStrong} />
              <View style={styles.staffNoticeCopy}>
                <Text style={styles.staffNoticeTitle}>Official catalog is not published</Text>
                <Text style={styles.staffNoticeText}>This preview is visible to Lumo staff. Public members will only see the catalog after it is published.</Text>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingState}><ActivityIndicator color={colors.accentStrong} size="large" /><Text style={styles.loadingText}>Loading Market...</Text></View>
          ) : error ? (
            <View style={styles.errorPanel}>
              <Ionicons name="alert-circle-outline" size={25} color={colors.like} /><Text style={styles.errorTitle}>Could not load Market</Text><Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load(true)} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
            </View>
          ) : isOriginals ? (
            filteredOfficial.length > 0 ? (
              <View style={styles.listingGrid}>{filteredOfficial.map((item) => <OfficialProductCard key={item.id} item={item} basis={cardBasis} onPress={() => router.push(`/market/originals/${item.slug}` as never)} />)}</View>
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}><Ionicons name="sparkles-outline" size={28} color={colors.muted} /></View>
                <Text style={styles.emptyEyebrow}>THE NEXT LUMO DROP</Text>
                <Text style={styles.emptyTitle}>{search ? "No matching products" : "A collection is taking shape."}</Text>
                <Text style={styles.emptyDescription}>{search ? "Try another product name or category." : "Lumo Originals is being prepared. Official pieces will appear here when the collection is ready."}</Text>
                {isStaff && officialStore ? <Text style={styles.emptyMeta}>Catalog status: {officialStore.is_published ? "Published" : "Unpublished"}</Text> : null}
              </View>
            )
          ) : filteredListings.length > 0 ? (
            <View style={styles.listingGrid}>{filteredListings.map((item) => <View key={item.id} style={[styles.listingGridItem, { flexBasis: cardBasis }]}><MarketListingCard item={item} own={isMine} onPress={() => openListing(item.id)} /></View>)}</View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name={activeTab === "saved" ? "heart-outline" : isMine ? "pricetag-outline" : "search-outline"} size={28} color={colors.muted} /></View>
              <Text style={styles.emptyTitle}>{search ? "No matching listings" : activeTab === "saved" ? "Nothing saved yet" : isMine ? "Your seller space is ready" : "No listings yet"}</Text>
              <Text style={styles.emptyDescription}>{search ? "Try a different keyword or category." : activeTab === "saved" ? "Save interesting products and services to find them here." : isMine ? "Your published products and services will appear here." : "Be among the first to share a product or service with the Lumo community."}</Text>
              {!search && (isMine || isCommunity) ? <Pressable onPress={openCreateListing} style={styles.emptyAction}><Text style={styles.emptyActionText}>Create listing</Text><Ionicons name="arrow-forward" size={15} color={colors.bg} /></Pressable> : null}
            </View>
          )}

          <View style={styles.bottomInfo}><Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.muted} /><Text style={styles.bottomInfoText}>Discover independently. Connect directly. Continue the conversation through Lumo Chat.</Text></View>
        </View>
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { alignItems: "center", paddingTop: 14, paddingBottom: 54 },
  container: { width: "100%", maxWidth: 1320, paddingHorizontal: 18, gap: 20 },
  topLine: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brandLine: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  brandMarkText: { color: colors.accentStrong, fontSize: 25, fontWeight: "900", letterSpacing: -2 },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1.7 },
  brandName: { color: colors.text, fontSize: 15, fontWeight: "900", letterSpacing: 1.8, marginTop: 3 },
  sellButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  sellButtonText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
  pressed: { opacity: 0.82 },
  hero: { minHeight: 260, position: "relative", overflow: "hidden", borderRadius: 23, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: 25, paddingVertical: 27 },
  heroContent: { flex: 1, minWidth: 0, zIndex: 2, gap: 13 },
  heroEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroEyebrowLine: { width: 23, height: 1, backgroundColor: colors.accentStrong },
  heroEyebrow: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  heroTitle: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: "900", letterSpacing: -1.4, maxWidth: 630 },
  heroAccent: { color: colors.accentStrong },
  heroDescription: { color: colors.muted, fontSize: 12, lineHeight: 19, maxWidth: 485 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 3 },
  heroPrimary: { minHeight: 41, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  heroPrimaryText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  heroSecondary: { minHeight: 41, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  heroSecondaryText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  heroVisual: { width: 220, height: 210, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  orbitOuter: { position: "absolute", width: 205, height: 205, borderRadius: 103, borderWidth: 1, borderColor: "rgba(185,199,214,0.10)" },
  orbitMiddle: { position: "absolute", width: 158, height: 158, borderRadius: 79, borderWidth: 1, borderColor: "rgba(185,199,214,0.17)" },
  orbitInner: { width: 105, height: 105, borderRadius: 34, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.glassBorder, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
  heroVisualLetter: { color: colors.accentStrong, fontSize: 68, lineHeight: 78, fontWeight: "900", letterSpacing: -8, marginRight: 7 },
  heroVisualLabel: { position: "absolute", right: -2, bottom: 22, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.glassBorder, flexDirection: "row", alignItems: "center", gap: 6 },
  heroVisualDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success },
  heroVisualLabelText: { color: colors.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  heroVisualIndex: { position: "absolute", left: 6, top: 28 },
  heroVisualIndexText: { color: colors.dim, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  searchBox: { flex: 1, minHeight: 49, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12, paddingVertical: 10 } as any,
  refreshButton: { width: 48, height: 49, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  tab: { minHeight: 41, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  tabTextActive: { color: colors.bg, fontWeight: "900" },
  filtersBlock: { gap: 10 },
  kindFilters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  kindChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  kindChipActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  kindChipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  kindChipTextActive: { color: colors.accentStrong, fontWeight: "900" },
  categoryRow: { flexDirection: "row", gap: 7 },
  categoryChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  categoryChipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  categoryText: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  categoryTextActive: { color: colors.accentStrong, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 15, marginTop: 1 },
  sectionHeading: { flex: 1, minWidth: 0, gap: 4 },
  sectionEyebrow: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.6 },
  sectionTitle: { color: colors.text, fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  sectionDescription: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  staffBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  staffBadgeText: { color: colors.accentStrong, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  staffNotice: { padding: 13, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  staffNoticeCopy: { flex: 1, gap: 3 },
  staffNoticeTitle: { color: colors.text, fontSize: 11, fontWeight: "800" },
  staffNoticeText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  loadingState: { minHeight: 210, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: colors.muted, fontSize: 11 },
  errorPanel: { minHeight: 200, alignItems: "center", justifyContent: "center", gap: 8, padding: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  errorTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  errorText: { color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 17 },
  retryButton: { marginTop: 7, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  retryText: { color: colors.accentStrong, fontSize: 11, fontWeight: "800" },
  listingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  listingGridItem: { minWidth: 0, flexGrow: 1 },
  productGridItem: { minWidth: 0, flexGrow: 0, flexShrink: 0 },
  productCard: { overflow: "hidden", borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  productImageWrap: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceRaised, position: "relative", overflow: "hidden" },
  productImage: { width: "100%", height: "100%" },
  productPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surfaceRaised },
  placeholderLabel: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1.4 },
  featuredBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accent },
  featuredText: { color: colors.bg, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  productInfo: { padding: 12, gap: 6 },
  productCategory: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  productName: { color: colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  productDescription: { minHeight: 30, color: colors.muted, fontSize: 9, lineHeight: 14 },
  productPriceRow: { marginTop: 3, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  productPrice: { color: colors.accentStrong, fontSize: 11, fontWeight: "900" },
  productArrow: { width: 27, height: 27, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  emptyState: { minHeight: 260, alignItems: "center", justifyContent: "center", paddingHorizontal: 22, paddingVertical: 28, borderRadius: 19, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surface, gap: 10 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  emptyEyebrow: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptyDescription: { maxWidth: 390, color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: "center" },
  emptyMeta: { color: colors.dim, fontSize: 9, fontWeight: "700" },
  emptyAction: { minHeight: 39, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 5 },
  emptyActionText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  bottomInfo: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  bottomInfoText: { flex: 1, color: colors.dim, fontSize: 10, lineHeight: 15 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", alignItems: "center", justifyContent: "center", padding: 18 },
  productModal: { width: "100%", maxWidth: 560, maxHeight: "90%", padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface, gap: 12 },
  modalTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalEyebrow: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  modalClose: { width: 33, height: 33, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  modalImage: { width: "100%", height: 230, borderRadius: 13, overflow: "hidden" },
  modalDetails: { flexGrow: 0 },
  modalCategory: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  modalProductName: { color: colors.text, fontSize: 23, fontWeight: "900", letterSpacing: -0.6, marginTop: 5 },
  modalPrice: { color: colors.accentStrong, fontSize: 14, fontWeight: "900", marginTop: 7 },
  modalDescription: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 12 },
  modalPurchaseInfo: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  modalPurchaseTitle: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  modalVariantRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  modalVariantChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  modalVariantText: { color: colors.text, fontSize: 9, fontWeight: "700" },
});
