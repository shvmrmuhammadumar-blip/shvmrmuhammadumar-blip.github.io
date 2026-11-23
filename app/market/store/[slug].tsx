import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import {
  getMarketListings,
  getMarketStoreBySlug,
  type MarketKind,
  type MarketListing,
  type MarketStore,
} from "../../../lib/market";
import { colors } from "../../../lib/theme";
import MarketListingCard from "../../../components/market/MarketListingCard";
import { useThemedStyles } from "../../../lib/theme-styles";

type CatalogFilter = "all" | "product" | "service";

export default function StorefrontScreen() {
  const lumoStyles = useThemedStyles(styles);
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [store, setStore] = useState<MarketStore | null>(null);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) {
      setError("Store address is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const foundStore = await getMarketStoreBySlug(slug);
      const isOwner = foundStore.owner_id === userId;

      const storeListings = await getMarketListings({
        storeId: foundStore.id,
        ownerId: isOwner ? foundStore.owner_id : undefined,
        limit: 100,
      });

      setStore(foundStore);
      setListings(storeListings);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load this store.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = !!store && store.owner_id === userId;

  const visibleListings = useMemo(() => {
    if (filter === "all") return listings;
    return listings.filter((item) => item.kind === filter);
  }, [filter, listings]);

  const productsCount = listings.filter((item) => item.kind === "product").length;
  const servicesCount = listings.filter((item) => item.kind === "service").length;

  const columns = width >= 1120 ? "23.5%" : width >= 720 ? "31.5%" : "48%";

  const openListing = (listingId: string) => {
    router.push(`/market/${listingId}` as never);
  };

  if (loading) {
    return (
      <View style={lumoStyles.centerState}>
        <ActivityIndicator size="large" color={colors.accentStrong} />
        <Text style={lumoStyles.stateText}>Opening storefront...</Text>
      </View>
    );
  }

  if (error || !store) {
    return (
      <View style={lumoStyles.centerState}>
        <View style={lumoStyles.stateIcon}>
          <Ionicons name="storefront-outline" size={29} color={colors.muted} />
        </View>
        <Text style={lumoStyles.stateTitle}>Store unavailable</Text>
        <Text style={lumoStyles.stateText}>{error || "This store could not be found."}</Text>
        <Pressable onPress={() => router.replace("/market" as never)} style={lumoStyles.backToMarket}>
          <Text style={lumoStyles.backToMarketText}>Back to Market</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={lumoStyles.root}>
      <ScrollView
        contentContainerStyle={lumoStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={lumoStyles.container}>
          <View style={lumoStyles.topBar}>
            <Pressable onPress={() => router.back()} style={lumoStyles.backButton}>
              <Ionicons name="arrow-back" size={18} color={colors.muted} />
              <Text style={lumoStyles.backText}>Back</Text>
            </Pressable>

            <View style={lumoStyles.topActions}>
              {isOwner ? (
                <Pressable
                  onPress={() =>
                    router.push(`/market/store/manage/${store.id}` as never)
                  }
                  style={lumoStyles.manageButton}
                >
                  <Ionicons name="settings-outline" size={15} color={colors.text} />
                  <Text style={lumoStyles.manageButtonText}>Manage store</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push(`/chat/${store.owner_id}` as never)}
                  style={lumoStyles.contactButton}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.bg} />
                  <Text style={lumoStyles.contactButtonText}>Contact store</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={lumoStyles.cover}>
            {store.cover_url ? (
              <Image
                source={{ uri: store.cover_url }}
                style={lumoStyles.coverImage}
                contentFit="cover"
              />
            ) : (
              <View style={lumoStyles.coverFallback}>
                <Ionicons name="storefront-outline" size={43} color={colors.dim} />
                <Text style={lumoStyles.coverFallbackLabel}>LUMO STORE</Text>
              </View>
            )}
            <View style={lumoStyles.coverShade} />
            <View style={lumoStyles.coverLabel}>
              <Text style={lumoStyles.coverLabelText}>LUMO MARKET / STOREFRONT</Text>
            </View>
          </View>

          <View style={lumoStyles.identity}>
            <View style={lumoStyles.logo}>
              {store.avatar_url ? (
                <Image
                  source={{ uri: store.avatar_url }}
                  style={lumoStyles.logoImage}
                  contentFit="cover"
                />
              ) : (
                <View style={lumoStyles.logoFallback}>
                  <Ionicons name="storefront" size={34} color={colors.accentStrong} />
                </View>
              )}
            </View>

            <View style={lumoStyles.identityCopy}>
              <Text style={lumoStyles.storeName}>{store.name}</Text>
              <Text style={lumoStyles.storeHandle}>@{store.slug}</Text>
              <View style={lumoStyles.location}>
                <Ionicons name="location-outline" size={13} color={colors.dim} />
                <Text style={lumoStyles.locationText}>
                  {[store.city, store.region, store.country]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            </View>
          </View>

          <View style={lumoStyles.stats}>
            <View style={lumoStyles.stat}>
              <Text style={lumoStyles.statValue}>{listings.length}</Text>
              <Text style={lumoStyles.statLabel}>LISTINGS</Text>
            </View>
            <View style={lumoStyles.statDivider} />
            <View style={lumoStyles.stat}>
              <Text style={lumoStyles.statValue}>{productsCount}</Text>
              <Text style={lumoStyles.statLabel}>PRODUCTS</Text>
            </View>
            <View style={lumoStyles.statDivider} />
            <View style={lumoStyles.stat}>
              <Text style={lumoStyles.statValue}>{servicesCount}</Text>
              <Text style={lumoStyles.statLabel}>SERVICES</Text>
            </View>
          </View>

          {store.description ? (
            <View style={lumoStyles.aboutCard}>
              <View style={lumoStyles.aboutHeader}>
                <View style={lumoStyles.aboutIcon}>
                  <Ionicons name="information-circle-outline" size={19} color={colors.accentStrong} />
                </View>
                <Text style={lumoStyles.aboutTitle}>About this store</Text>
              </View>
              <Text style={lumoStyles.aboutText}>{store.description}</Text>
            </View>
          ) : null}

          <View style={lumoStyles.catalogHeader}>
            <View style={lumoStyles.catalogHeading}>
              <Text style={lumoStyles.eyebrow}>EXPLORE THE COLLECTION</Text>
              <Text style={lumoStyles.catalogTitle}>Store catalog</Text>
              <Text style={lumoStyles.catalogSubtitle}>
                Browse products and services offered by {store.name}.
              </Text>
            </View>
            {isOwner ? (
              <Pressable
                onPress={() =>
                  router.push(`/market/create?storeId=${store.id}` as never)
                }
                style={lumoStyles.addListingButton}
              >
                <Ionicons name="add" size={16} color={colors.bg} />
                <Text style={lumoStyles.addListingText}>Add listing</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={lumoStyles.filters}>
            {(
              [
                ["all", "All listings"],
                ["product", "Products"],
                ["service", "Services"],
              ] as [CatalogFilter, string][]
            ).map(([key, label]) => {
              const selected = filter === key;

              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  style={[
                    lumoStyles.filter,
                    selected && lumoStyles.filterActive,
                  ]}
                >
                  <Text
                    style={[
                      lumoStyles.filterText,
                      selected && lumoStyles.filterTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {visibleListings.length > 0 ? (
            <View style={lumoStyles.listingGrid}>
              {visibleListings.map((item) => (
                <View
                  key={item.id}
                  style={[
                    lumoStyles.listingItem,
                    { flexBasis: columns },
                  ]}
                >
                  <MarketListingCard
                    item={item}
                    own={isOwner}
                    onPress={() => openListing(item.id)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={lumoStyles.emptyCatalog}>
              <View style={lumoStyles.emptyIcon}>
                <Ionicons name="cube-outline" size={28} color={colors.muted} />
              </View>
              <Text style={lumoStyles.emptyTitle}>
                {isOwner ? "Your catalog is ready" : "No listings yet"}
              </Text>
              <Text style={lumoStyles.emptyText}>
                {isOwner
                  ? "Add your first product or service to this storefront."
                  : "This store has not published any listings yet."}
              </Text>
              {isOwner ? (
                <Pressable
                  onPress={() =>
                    router.push(`/market/create?storeId=${store.id}` as never)
                  }
                  style={lumoStyles.emptyAction}
                >
                  <Text style={lumoStyles.emptyActionText}>Add first listing</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.bg} />
                </Pressable>
              ) : null}
            </View>
          )}

          <View style={lumoStyles.footer}>
            <Ionicons name="shield-checkmark-outline" size={17} color={colors.muted} />
            <Text style={lumoStyles.footerText}>
              Powered by Lumo Market. Contact the store directly through Lumo Chat.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 50 },
  container: { width: "100%", maxWidth: 1240, gap: 17 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backButton: {
    minHeight: 39,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  backText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  topActions: { flexDirection: "row", gap: 8 },
  manageButton: {
    minHeight: 39,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  manageButtonText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  contactButton: {
    minHeight: 39,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  contactButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  cover: {
    width: "100%",
    height: 245,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
  },
  coverImage: { width: "100%", height: "100%" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  coverFallbackLabel: { color: colors.dim, fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  coverShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,8,12,0.14)" },
  coverLabel: {
    position: "absolute",
    left: 15,
    bottom: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(9,12,18,0.76)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  coverLabelText: { color: colors.accentStrong, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  identity: { flexDirection: "row", alignItems: "center", gap: 15, paddingHorizontal: 7 },
  logo: {
    width: 86,
    height: 86,
    marginTop: -39,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: colors.bg,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
  },
  logoImage: { width: "100%", height: "100%" },
  logoFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft },
  identityCopy: { flex: 1, minWidth: 0, gap: 4, paddingTop: 5 },
  storeName: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.7 },
  storeHandle: { color: colors.muted, fontSize: 10 },
  location: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  locationText: { color: colors.dim, fontSize: 10, flex: 1 },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 15,
  },
  stat: { alignItems: "center", gap: 4, flex: 1 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  statDivider: { width: 1, height: 30, backgroundColor: colors.border },
  aboutCard: {
    padding: 17,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 11,
  },
  aboutHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  aboutIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  aboutTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  aboutText: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  catalogHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 9 },
  catalogHeading: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  catalogTitle: { color: colors.text, fontSize: 23, fontWeight: "900", letterSpacing: -0.6 },
  catalogSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  addListingButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addListingText: { color: colors.bg, fontSize: 9, fontWeight: "900" },
  filters: { flexDirection: "row", gap: 7, marginTop: 2 },
  filter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  filterTextActive: { color: colors.accentStrong, fontWeight: "900" },
  listingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  listingItem: { flexGrow: 1, minWidth: 0 },
  emptyCatalog: {
    minHeight: 240,
    padding: 20,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 17, maxWidth: 380 },
  emptyAction: { marginTop: 4, minHeight: 37, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 7 },
  emptyActionText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 },
  footerText: { flex: 1, color: colors.dim, fontSize: 9, lineHeight: 15 },
  centerState: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 25, gap: 11 },
  stateIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  stateText: { color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 17 },
  backToMarket: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, marginTop: 5 },
  backToMarketText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
});
