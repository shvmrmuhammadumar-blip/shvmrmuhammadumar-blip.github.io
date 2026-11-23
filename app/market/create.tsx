import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../lib/auth";
import { Alert } from "../../lib/alert";
import {
  createMarketListing,
  MARKET_IMAGE_LIMIT,
  type MarketImageAsset,
  type MarketKind,
} from "../../lib/market";
import { isUserPremium } from "../../lib/membership";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


const db = supabase as any;
const PRODUCT_CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home",
  "Vehicles",
  "Beauty",
  "Sports",
  "Other",
];
const SERVICE_CATEGORIES = [
  "Web & Design",
  "IT & Tech",
  "Repairs",
  "Education",
  "Home Services",
  "Business",
  "Other",
];

export default function CreateMarketListingScreen() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const params = useLocalSearchParams<{ storeId?: string | string[] }>();
  const storeId = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  const { session } = useAuth();
  const userId = session?.user.id;

  const [kind, setKind] = useState<MarketKind>("product");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
  const [priceText, setPriceText] = useState("");
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [condition, setCondition] = useState<"new" | "used" | "refurbished">("new");
  const [region, setRegion] = useState("Tashkent Region");
  const [city, setCity] = useState("Chinoz");
  const [images, setImages] = useState<MarketImageAsset[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(
    () => (kind === "product" ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES),
    [kind],
  );
  const hasProductSlot = isPremium && productCount < 1;
  const canPublish = kind !== "product" || hasProductSlot;

  const loadProductAccess = useCallback(async () => {
    if (!userId) {
      setIsPremium(false);
      setProductCount(0);
      setCheckingAccess(false);
      return;
    }

    setCheckingAccess(true);
    try {
      const [premium, listingResult] = await Promise.all([
        isUserPremium(userId),
        db
          .from("market_listings")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", userId)
          .eq("kind", "product")
          .in("status", ["draft", "active"]),
      ]);
      if (listingResult.error) throw listingResult.error;
      setIsPremium(premium);
      setProductCount(listingResult.count ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify your Market access.");
      setIsPremium(false);
    } finally {
      setCheckingAccess(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProductAccess();
  }, [loadProductAccess]);

  useEffect(() => {
    setCategory(kind === "product" ? PRODUCT_CATEGORIES[0] : SERVICE_CATEGORIES[0]);
  }, [kind]);

  const pickImages = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow photo library access to select listing images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: MARKET_IMAGE_LIMIT,
        quality: 0.88,
      });

      if (result.canceled || !result.assets?.length) return;
      const selected = result.assets.slice(0, MARKET_IMAGE_LIMIT).map((asset, index) => ({
        uri: asset.uri,
        fileName: asset.fileName || `market-${Date.now()}-${index}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        fileSize: asset.fileSize,
      }));
      setImages(selected);
    } catch (cause) {
      Alert.alert(
        "Image error",
        cause instanceof Error ? cause.message : "Could not select listing images.",
      );
    }
  };

  const submit = async () => {
    if (!userId || saving || checkingAccess) return;
    const cleanTitle = title.trim();
    if (cleanTitle.length < 5) {
      setError("Enter a title with at least 5 characters.");
      return;
    }
    if (!category) {
      setError("Choose a category.");
      return;
    }
    if (!canPublish) {
      setError(
        kind === "product"
          ? !isPremium
            ? "An active LUMO Plus membership is required to publish a product."
            : "Your one Community Market product slot is already in use."
          : "This listing cannot be published yet.",
      );
      return;
    }

    const rawPrice = priceText.trim().replace(/,/g, "");
    const parsedPrice = rawPrice ? Number(rawPrice) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("Enter a valid price or leave it empty.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      // Re-check the product slot immediately before the insert. Postgres enforces it again.
      if (kind === "product") {
        const [premium, countResult] = await Promise.all([
          isUserPremium(userId),
          db
            .from("market_listings")
            .select("id", { count: "exact", head: true })
            .eq("seller_id", userId)
            .eq("kind", "product")
            .in("status", ["draft", "active"]),
        ]);
        if (countResult.error) throw countResult.error;
        if (!premium) throw new Error("An active LUMO Plus membership is required to publish a product.");
        if ((countResult.count ?? 0) >= 1) {
          throw new Error("Your one Community Market product slot is already in use.");
        }
      }

      const listingId = await createMarketListing({
        sellerId: userId,
        storeId: storeId || null,
        kind,
        title: cleanTitle,
        description,
        category,
        price: isNegotiable && parsedPrice === null ? null : parsedPrice,
        currency,
        isNegotiable,
        condition: kind === "product" ? condition : "not_applicable",
        region,
        city,
        images,
      });

      Alert.alert("Listing published", "Your listing is now available in Community Market.");
      router.replace("/market?tab=mine" as never);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not publish this listing.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!userId) {
    return (
      <View style={lumoStyles.center}>
        <Ionicons name="lock-closed-outline" size={30} color={colors.muted} />
        <Text style={lumoStyles.centerTitle}>Sign in required</Text>
        <Text style={lumoStyles.centerText}>Log in to publish a Community Market listing.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={lumoStyles.root}
      contentContainerStyle={lumoStyles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={lumoStyles.container}>
        <Pressable onPress={() => router.back()} style={lumoStyles.backButton}>
          <Ionicons name="arrow-back" size={17} color={colors.muted} />
          <Text style={lumoStyles.backText}>Back to Market</Text>
        </Pressable>

        <View style={lumoStyles.heading}>
          <Text style={lumoStyles.eyebrow}>LUMO MARKET / COMMUNITY</Text>
          <Text style={lumoStyles.title}>Create a listing.</Text>
          <Text style={lumoStyles.subtitle}>
            Publish a product or service for people in the LUMO community.
          </Text>
        </View>

        <View style={lumoStyles.kindSwitch}>
          <Pressable
            onPress={() => { setKind("product"); setError(""); }}
            style={[lumoStyles.kindButton, kind === "product" && lumoStyles.kindButtonActive]}
          >
            <Ionicons name="cube-outline" size={16} color={kind === "product" ? colors.bg : colors.muted} />
            <Text style={[lumoStyles.kindText, kind === "product" && lumoStyles.kindTextActive]}>Product</Text>
          </Pressable>
          <Pressable
            onPress={() => { setKind("service"); setError(""); }}
            style={[lumoStyles.kindButton, kind === "service" && lumoStyles.kindButtonActive]}
          >
            <Ionicons name="construct-outline" size={16} color={kind === "service" ? colors.bg : colors.muted} />
            <Text style={[lumoStyles.kindText, kind === "service" && lumoStyles.kindTextActive]}>Service</Text>
          </Pressable>
        </View>

        {kind === "product" ? (
          <View style={[lumoStyles.accessCard, hasProductSlot && lumoStyles.accessCardReady]}>
            <View style={lumoStyles.accessIcon}>
              <Ionicons name="diamond-outline" size={20} color={colors.accentStrong} />
            </View>
            <View style={lumoStyles.accessCopy}>
              <Text style={lumoStyles.accessTitle}>LUMO Plus · Community Market</Text>
              {checkingAccess ? (
                <Text style={lumoStyles.accessText}>Checking your product slot…</Text>
              ) : isPremium ? (
                <Text style={lumoStyles.accessText}>
                  {productCount}/1 product slot used. {hasProductSlot ? "You can publish one product." : "Your product slot is already in use."}
                </Text>
              ) : (
                <Text style={lumoStyles.accessText}>An active LUMO Plus membership includes one active product listing.</Text>
              )}
            </View>
            {!checkingAccess && !isPremium ? (
              <Pressable onPress={() => router.push("/premium" as never)} style={lumoStyles.upgradeButton}>
                <Text style={lumoStyles.upgradeText}>View Plus</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={lumoStyles.card}>
          <View style={lumoStyles.sectionHeading}>
            <Text style={lumoStyles.sectionTitle}>Listing details</Text>
            <Text style={lumoStyles.sectionCaption}>Add clear information so buyers know what you offer.</Text>
          </View>

          <Text style={lumoStyles.fieldLabel}>TITLE *</Text>
          <TextInput
            value={title}
            onChangeText={value => { setTitle(value.slice(0, 120)); setError(""); }}
            placeholder={kind === "product" ? "e.g. Wireless headphones" : "e.g. Website design service"}
            placeholderTextColor={colors.dim}
            maxLength={120}
            style={lumoStyles.input}
          />
          <Text style={lumoStyles.counter}>{title.length}/120</Text>

          <Text style={lumoStyles.fieldLabel}>CATEGORY *</Text>
          <View style={lumoStyles.chipGrid}>
            {categories.map(item => (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={[lumoStyles.chip, category === item && lumoStyles.chipActive]}
              >
                <Text style={[lumoStyles.chipText, category === item && lumoStyles.chipTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={lumoStyles.fieldLabel}>DESCRIPTION</Text>
          <TextInput
            value={description}
            onChangeText={value => setDescription(value.slice(0, 5000))}
            placeholder="Describe the product or service, its condition and important details…"
            placeholderTextColor={colors.dim}
            multiline
            textAlignVertical="top"
            maxLength={5000}
            style={[lumoStyles.input, lumoStyles.textArea]}
          />
          <Text style={lumoStyles.counter}>{description.length}/5000</Text>

          {kind === "product" ? (
            <>
              <Text style={lumoStyles.fieldLabel}>CONDITION</Text>
              <View style={lumoStyles.chipGrid}>
                {([
                  ["new", "New"],
                  ["used", "Used"],
                  ["refurbished", "Refurbished"],
                ] as const).map(([value, label]) => (
                  <Pressable key={value} onPress={() => setCondition(value)} style={[lumoStyles.chip, condition === value && lumoStyles.chipActive]}>
                    <Text style={[lumoStyles.chipText, condition === value && lumoStyles.chipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={lumoStyles.fieldLabel}>PRICE</Text>
          <View style={lumoStyles.priceRow}>
            <TextInput
              value={priceText}
              onChangeText={setPriceText}
              placeholder="Enter price"
              placeholderTextColor={colors.dim}
              keyboardType="decimal-pad"
              style={[lumoStyles.input, lumoStyles.priceInput]}
            />
            <Pressable onPress={() => setCurrency(value => value === "UZS" ? "USD" : "UZS")} style={lumoStyles.currencyButton}>
              <Text style={lumoStyles.currencyText}>{currency}</Text>
              <Ionicons name="swap-vertical" size={13} color={colors.muted} />
            </Pressable>
          </View>

          <Pressable onPress={() => setIsNegotiable(value => !value)} style={lumoStyles.checkRow}>
            <View style={[lumoStyles.checkbox, isNegotiable && lumoStyles.checkboxActive]}>
              {isNegotiable ? <Ionicons name="checkmark" size={13} color={colors.bg} /> : null}
            </View>
            <Text style={lumoStyles.checkText}>Price is negotiable</Text>
          </Pressable>

          <Text style={lumoStyles.fieldLabel}>LOCATION</Text>
          <TextInput value={region} onChangeText={setRegion} placeholder="Region" placeholderTextColor={colors.dim} style={lumoStyles.input} />
          <TextInput value={city} onChangeText={setCity} placeholder="City / district" placeholderTextColor={colors.dim} style={lumoStyles.input} />

          <View style={lumoStyles.imageHeading}>
            <View>
              <Text style={lumoStyles.fieldLabel}>PHOTOS</Text>
              <Text style={lumoStyles.sectionCaption}>Up to {MARKET_IMAGE_LIMIT} images · JPG, PNG or WebP · 10 MB each</Text>
            </View>
            <Pressable onPress={() => void pickImages()} style={lumoStyles.addImagesButton}>
              <Ionicons name="images-outline" size={15} color={colors.accentStrong} />
              <Text style={lumoStyles.addImagesText}>{images.length ? "Change photos" : "Add photos"}</Text>
            </Pressable>
          </View>

          {images.length ? (
            <View style={lumoStyles.imageGrid}>
              {images.map((image, index) => (
                <View key={image.uri + index} style={lumoStyles.imageWrap}>
                  <Image source={{ uri: image.uri }} style={lumoStyles.image} contentFit="cover" />
                  <Pressable onPress={() => setImages(current => current.filter((_, itemIndex) => itemIndex !== index))} style={lumoStyles.removeImage}>
                    <Ionicons name="close" size={13} color={resolveThemeColor(colors.mediaText, "color")} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Pressable onPress={() => void pickImages()} style={lumoStyles.imagePlaceholder}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.muted} />
              <Text style={lumoStyles.imagePlaceholderTitle}>Add product photos</Text>
              <Text style={lumoStyles.imagePlaceholderText}>Listings with clear photos are easier to recognize.</Text>
            </Pressable>
          )}
        </View>

        {error ? (
          <View style={lumoStyles.errorCard}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
            <Text style={lumoStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void submit()}
          disabled={saving || checkingAccess || !canPublish}
          style={[lumoStyles.publishButton, (saving || checkingAccess || !canPublish) && lumoStyles.publishButtonDisabled]}
        >
          {saving ? <ActivityIndicator color={colors.bg} /> : <Ionicons name="checkmark-circle-outline" size={18} color={colors.bg} />}
          <Text style={lumoStyles.publishText}>{saving ? "Publishing…" : "Publish listing"}</Text>
          {!saving ? <Ionicons name="arrow-forward" size={16} color={colors.bg} /> : null}
        </Pressable>
        <Text style={lumoStyles.footerText}>Your listing will be visible in Community Market after it is published.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { alignItems: "center", paddingTop: 15, paddingBottom: 44 },
  container: { width: "100%", maxWidth: 760, paddingHorizontal: 18, gap: 15 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingVertical: 6 },
  backText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  heading: { gap: 7, paddingVertical: 5 },
  eyebrow: { color: colors.accentStrong, fontSize: 8, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  kindSwitch: { flexDirection: "row", gap: 8 },
  kindButton: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  kindButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  kindText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  kindTextActive: { color: colors.bg },
  accessCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  accessCardReady: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  accessIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.surfaceRaised },
  accessCopy: { flex: 1, minWidth: 0, gap: 4 },
  accessTitle: { color: colors.text, fontSize: 10, fontWeight: "900" },
  accessText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  upgradeButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.accent },
  upgradeText: { color: colors.bg, fontSize: 9, fontWeight: "900" },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 9 },
  sectionHeading: { gap: 4, marginBottom: 3 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  sectionCaption: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  fieldLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginTop: 10 },
  input: { minHeight: 43, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 11, fontSize: 11 },
  counter: { color: colors.dim, fontSize: 8, textAlign: "right", marginTop: -4 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  chipTextActive: { color: colors.bg, fontWeight: "900" },
  textArea: { minHeight: 110, lineHeight: 17, textAlignVertical: "top" },
  priceRow: { flexDirection: "row", gap: 8 },
  priceInput: { flex: 1 },
  currencyButton: { minWidth: 82, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  currencyText: { color: colors.text, fontSize: 10, fontWeight: "900" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 5 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: colors.muted, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  imageHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 },
  addImagesButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  addImagesText: { color: colors.accentStrong, fontSize: 9, fontWeight: "900" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  imageWrap: { width: "23%", minWidth: 68, aspectRatio: 1, position: "relative", borderRadius: 10, overflow: "hidden", backgroundColor: colors.surfaceRaised },
  image: { width: "100%", height: "100%" },
  removeImage: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.72)" },
  imagePlaceholder: { minHeight: 110, borderRadius: 13, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 5, padding: 15 },
  imagePlaceholderTitle: { color: colors.text, fontSize: 10, fontWeight: "800" },
  imagePlaceholderText: { color: colors.muted, fontSize: 9, textAlign: "center" },
  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
  errorText: { color: colors.text, flex: 1, fontSize: 10, lineHeight: 15 },
  publishButton: { minHeight: 48, paddingHorizontal: 15, borderRadius: 13, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  publishButtonDisabled: { opacity: 0.5 },
  publishText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
  footerText: { color: colors.dim, fontSize: 9, textAlign: "center", lineHeight: 14 },
  center: { flex: 1, padding: 24, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 10 },
  centerTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  centerText: { color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 17 },
});
