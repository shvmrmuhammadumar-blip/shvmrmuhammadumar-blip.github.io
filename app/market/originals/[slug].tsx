import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  getOfficialCatalog,
  type OfficialProduct,
  type OfficialStore,
} from "../../../lib/market-official";
import { createOfficialOrder } from "../../../lib/market-orders";
import { colors } from "../../../lib/theme";
import { useThemedStyles } from "../../../lib/theme-styles";

const COLOR_SWATCHES: Record<string, string> = {
  black: "#17191D",
  white: "#F4F4F0",
  grey: "#858B92",
  gray: "#858B92",
  silver: "#BEC6CE",
  navy: "#192A45",
  blue: "#315D9A",
  red: "#A8323A",
  green: "#426653",
  beige: "#CBB99D",
  brown: "#76533E",
  cream: "#E8DFC9",
};

function formatProductPrice(price: number, currency: "UZS" | "USD") {
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(price);
  return currency === "USD" ? "$" + amount : amount + " UZS";
}

function getAddress(store: OfficialStore | null) {
  if (!store) return "";
  const details = store.contact_text ?? "";
  const explicit = details.match(/(?:Address|Pickup address|Location):\s*([^\r\n]+)/i)?.[1]?.trim();
  const locality = [store.city, store.region, store.country].filter(Boolean).join(", ");
  if (explicit) return [explicit, locality].filter(Boolean).join(", ");
  return store.city || store.region ? locality : "";
}

function getContactName(store: OfficialStore | null) {
  return store?.contact_text.match(/(?:Contact Person|Contact Name):\s*([^\r\n]+)/i)?.[1]?.trim()
    || "LUMO Customer Support";
}

function getPhone(store: OfficialStore | null) {
  const match = store?.contact_text.match(/\+?\d[\d\s().-]{7,}\d/)?.[0] ?? "";
  return match.replace(/\D/g, "");
}

export default function OfficialProductDetailScreen() {
  const lumoStyles = useThemedStyles(styles);
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [product, setProduct] = useState<OfficialProduct | null>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<OfficialProduct[]>([]);
  const [store, setStore] = useState<OfficialStore | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) {
      setError("Product address is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const catalog = await getOfficialCatalog();
      const foundProduct = catalog.products.find((item) => item.slug === slug) ?? null;
      setStore(catalog.store);
      setProduct(foundProduct);
      setRecommendedProducts(
        catalog.products
          .filter((item) => item.slug !== slug)
          .slice(0, 8),
      );
      setSelectedImage(0);
      setSelectedVariantId(foundProduct?.variants.find((variant) => variant.is_active)?.id ?? null);
      setQuantity(1);
      if (!foundProduct) setError("This product is not available in the official collection.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this product.");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeVariants = useMemo(
    () => product?.variants.filter((variant) => variant.is_active) ?? [],
    [product],
  );
  const selectedVariant = activeVariants.find((variant) => variant.id === selectedVariantId) ?? activeVariants[0] ?? null;
  const images = product?.images ?? [];
  const address = getAddress(store);
  const contactName = getContactName(store);
  const phone = getPhone(store);
  const isWide = width >= 860;

  const colorsAvailable = useMemo(
    () => Array.from(new Set(activeVariants.map((variant) => variant.color?.trim()).filter(Boolean))) as string[],
    [activeVariants],
  );
  const sizesAvailable = useMemo(
    () => Array.from(new Set(activeVariants.map((variant) => variant.size?.trim()).filter(Boolean))) as string[],
    [activeVariants],
  );
  const shownPrice = selectedVariant?.price_override ?? product?.price ?? 0;
  const stock = selectedVariant?.stock_quantity ?? 0;
  const hasStock = stock > 0;

  const chooseColor = (color: string) => {
    const matches = activeVariants.filter((variant) => variant.color?.trim() === color);
    const next = matches.find((variant) => variant.size === selectedVariant?.size) ?? matches[0];
    if (next) setSelectedVariantId(next.id);
  };

  const chooseSize = (size: string) => {
    const matches = activeVariants.filter((variant) => variant.size?.trim() === size);
    const next = matches.find((variant) => variant.color === selectedVariant?.color) ?? matches[0];
    if (next) setSelectedVariantId(next.id);
  };

  const openOrderForm = () => {
    setOrderError(null);
    setOrderModalOpen(true);
  };

  const submitOrder = async () => {
    if (!product) return;
    setSubmittingOrder(true);
    setOrderError(null);
    try {
      const result = await createOfficialOrder({
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        quantity,
        customerName,
        customerPhone,
        customerAddress,
        customerNote,
      });
      setOrderModalOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setCustomerNote("");
      Alert.alert(
        "Order submitted",
        "Your order #" + result.orderId + " has been saved. " +
          (result.notificationStatus === "sent"
            ? "LUMO has also received a Telegram notification."
            : "Telegram notification is not configured yet; the order is safely saved in LUMO."),
      );
    } catch (submitError) {
      setOrderError(submitError instanceof Error ? submitError.message : "Could not submit your order.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  const callSupport = () => {
    if (phone) void Linking.openURL("tel:+" + phone);
  };

  const openDirections = () => {
    if (!address) return;
    void Linking.openURL("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address));
  };

  const shareProduct = async () => {
    if (!product) return;
    const message = product.name + " · " + formatProductPrice(shownPrice, product.currency) + " — LUMO ORIGINALS";
    await Share.share({ message });
  };

  if (loading) {
    return (
      <View style={lumoStyles.stateRoot}>
        <ActivityIndicator size="large" color={colors.accentStrong} />
        <Text style={lumoStyles.stateText}>Loading product...</Text>
      </View>
    );
  }

  if (!product || error) {
    return (
      <View style={lumoStyles.stateRoot}>
        <View style={lumoStyles.stateIcon}>
          <Ionicons name="cube-outline" size={27} color={colors.accentStrong} />
        </View>
        <Text style={lumoStyles.stateTitle}>Product unavailable</Text>
        <Text style={lumoStyles.stateText}>{error ?? "This product could not be found."}</Text>
        <Pressable onPress={() => router.replace("/market" as never)} style={lumoStyles.backButton}>
          <Ionicons name="arrow-back" size={15} color={colors.bg} />
          <Text style={lumoStyles.backButtonText}>Back to Market</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={lumoStyles.root}>
      <ScrollView contentContainerStyle={lumoStyles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={lumoStyles.container}>
          <View style={lumoStyles.topBar}>
            <Pressable onPress={() => router.back()} style={lumoStyles.backLink} accessibilityRole="button">
              <Ionicons name="arrow-back" size={17} color={colors.text} />
              <Text style={lumoStyles.backLinkText}>Market</Text>
            </Pressable>
            <View style={lumoStyles.brandLockup}>
              <View style={lumoStyles.brandMark}><Text style={lumoStyles.brandMarkText}>L</Text></View>
              <View>
                <Text style={lumoStyles.brandEyebrow}>THE OFFICIAL COLLECTION</Text>
                <Text style={lumoStyles.brandName}>LUMO ORIGINALS</Text>
              </View>
            </View>
            <Pressable onPress={() => void shareProduct()} style={lumoStyles.iconButton} accessibilityRole="button" accessibilityLabel="Share product">
              <Ionicons name="share-social-outline" size={18} color={colors.accentStrong} />
            </Pressable>
          </View>

          <View style={[lumoStyles.productLayout, isWide && lumoStyles.productLayoutWide]}>
            <View style={[lumoStyles.galleryColumn, isWide && lumoStyles.wideColumn]}>
              <Pressable onPress={() => images.length > 0 && setImageViewerOpen(true)} style={lumoStyles.imageStage} accessibilityRole="button" accessibilityLabel="View product image">
                {images.length > 0 ? (
                  <Image
                    source={{ uri: images[Math.min(selectedImage, images.length - 1)] }}
                    style={lumoStyles.heroImage}
                    contentFit="cover"
                    transition={180}
                  />
                ) : (
                  <View style={lumoStyles.imageFallback}>
                    <Ionicons name="image-outline" size={42} color={colors.dim} />
                    <Text style={lumoStyles.imageFallbackText}>LUMO ORIGINALS</Text>
                  </View>
                )}
                {product.is_featured ? (
                  <View style={lumoStyles.featuredPill}>
                    <Ionicons name="sparkles" size={11} color={colors.bg} />
                    <Text style={lumoStyles.featuredText}>LUMO SELECTED</Text>
                  </View>
                ) : null}
                <View style={lumoStyles.zoomHint}>
                  <Ionicons name="expand-outline" size={13} color={colors.text} />
                  <Text style={lumoStyles.zoomHintText}>VIEW</Text>
                </View>
                {images.length > 1 ? (
                  <View style={lumoStyles.imageCount}>
                    <Text style={lumoStyles.imageCountText}>{selectedImage + 1} / {images.length}</Text>
                  </View>
                ) : null}
              </Pressable>

              {images.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lumoStyles.thumbnailRow}>
                  {images.map((image, index) => (
                    <Pressable
                      key={image + index}
                      onPress={() => setSelectedImage(index)}
                      style={[lumoStyles.thumbnail, selectedImage === index && lumoStyles.thumbnailSelected]}
                      accessibilityRole="button"
                      accessibilityLabel={"View image " + (index + 1)}
                    >
                      <Image source={{ uri: image }} style={lumoStyles.thumbnailImage} contentFit="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View style={lumoStyles.trustLine}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.success} />
                <Text style={lumoStyles.trustText}>Official LUMO ORIGINALS product</Text>
              </View>
            </View>

            <View style={[lumoStyles.infoColumn, isWide && lumoStyles.wideInfoColumn]}>
              <View style={lumoStyles.categoryRow}>
                <Text style={lumoStyles.categoryText}>{product.category.toUpperCase()}</Text>
                <View style={lumoStyles.categoryDot} />
                <Text style={lumoStyles.categoryText}>LUMO ORIGINALS</Text>
              </View>

              <Text style={lumoStyles.productName}>{product.name}</Text>

              <View style={lumoStyles.priceLine}>
                <Text style={lumoStyles.price}>{formatProductPrice(shownPrice, product.currency)}</Text>
                {selectedVariant?.price_override != null ? <Text style={lumoStyles.priceNote}>Selected option price</Text> : null}
              </View>

              {product.sku ? (
                <View style={lumoStyles.codeLine}>
                  <Text style={lumoStyles.codeLabel}>PRODUCT CODE</Text>
                  <Text style={lumoStyles.codeValue}>{product.sku}</Text>
                </View>
              ) : null}

              <View style={lumoStyles.separator} />

              {colorsAvailable.length > 0 ? (
                <View style={lumoStyles.selectorBlock}>
                  <View style={lumoStyles.selectorHeader}>
                    <Text style={lumoStyles.selectorLabel}>COLOR</Text>
                    <Text style={lumoStyles.selectorValue}>{selectedVariant?.color ?? ""}</Text>
                  </View>
                  <View style={lumoStyles.colorChoices}>
                    {colorsAvailable.map((color) => {
                      const selected = selectedVariant?.color === color;
                      const swatch = COLOR_SWATCHES[color.toLowerCase()] ?? "#7E8792";
                      return (
                        <Pressable key={color} onPress={() => chooseColor(color)} style={[lumoStyles.colorChoice, selected && lumoStyles.colorChoiceSelected]}>
                          <View style={[lumoStyles.colorSwatch, { backgroundColor: swatch }, color.toLowerCase() === "white" && lumoStyles.whiteSwatch]} />
                          <Text style={[lumoStyles.choiceText, selected && lumoStyles.choiceTextSelected]}>{color}</Text>
                          {selected ? <Ionicons name="checkmark-circle" size={14} color={colors.accentStrong} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {sizesAvailable.length > 0 ? (
                <View style={lumoStyles.selectorBlock}>
                  <View style={lumoStyles.selectorHeader}>
                    <Text style={lumoStyles.selectorLabel}>SIZE</Text>
                    <Text style={lumoStyles.selectorValue}>{selectedVariant?.size ?? ""}</Text>
                  </View>
                  <View style={lumoStyles.sizeChoices}>
                    {sizesAvailable.map((size) => {
                      const selected = selectedVariant?.size === size;
                      return (
                        <Pressable key={size} onPress={() => chooseSize(size)} style={[lumoStyles.sizeChoice, selected && lumoStyles.sizeChoiceSelected]}>
                          <Text style={[lumoStyles.choiceText, selected && lumoStyles.choiceTextSelected]}>{size}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : activeVariants.length > 0 ? (
                <View style={lumoStyles.selectorBlock}>
                  <Text style={lumoStyles.selectorLabel}>OPTION</Text>
                  <View style={lumoStyles.sizeChoices}>
                    {activeVariants.map((variant) => {
                      const selected = selectedVariant?.id === variant.id;
                      return (
                        <Pressable key={variant.id} onPress={() => setSelectedVariantId(variant.id)} style={[lumoStyles.sizeChoice, selected && lumoStyles.sizeChoiceSelected]}>
                          <Text style={[lumoStyles.choiceText, selected && lumoStyles.choiceTextSelected]}>{variant.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={lumoStyles.quantityStockRow}>
                <View style={lumoStyles.quantityBlock}>
                  <Text style={lumoStyles.selectorLabel}>QUANTITY</Text>
                  <View style={lumoStyles.quantityControl}>
                    <Pressable onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={lumoStyles.quantityButton} accessibilityLabel="Decrease quantity">
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </Pressable>
                    <Text style={lumoStyles.quantityValue}>{quantity}</Text>
                    <Pressable onPress={() => setQuantity((value) => Math.min(99, value + 1))} style={lumoStyles.quantityButton} accessibilityLabel="Increase quantity">
                      <Ionicons name="add" size={16} color={colors.text} />
                    </Pressable>
                  </View>
                </View>
                <View style={lumoStyles.stockBlock}>
                  <View style={[lumoStyles.stockDot, hasStock ? lumoStyles.stockDotAvailable : lumoStyles.stockDotOnRequest]} />
                  <View style={lumoStyles.stockCopy}>
                    <Text style={lumoStyles.stockTitle}>{hasStock ? "IN STOCK" : "CHECK AVAILABILITY"}</Text>
                    <Text style={lumoStyles.stockText}>{hasStock ? stock + " available" : "Confirm before ordering"}</Text>
                  </View>
                </View>
              </View>

              <View style={lumoStyles.separator} />

              <View style={lumoStyles.locationCard}>
                <View style={lumoStyles.locationIcon}>
                  <Ionicons name="location-outline" size={18} color={colors.accentStrong} />
                </View>
                <View style={lumoStyles.locationCopy}>
                  <Text style={lumoStyles.locationTitle}>STORE LOCATION</Text>
                  <Text style={lumoStyles.locationText}>{address || "Ask us for the pickup location"}</Text>
                </View>
                {address ? (
                  <Pressable onPress={openDirections} style={lumoStyles.directionsButton} accessibilityLabel="Open directions">
                    <Ionicons name="navigate-outline" size={17} color={colors.accentStrong} />
                  </Pressable>
                ) : null}
              </View>

              <View style={lumoStyles.contactCard}>
                <View style={lumoStyles.contactAvatar}><Ionicons name="headset-outline" size={17} color={colors.accentStrong} /></View>
                <View style={lumoStyles.contactCopy}>
                  <Text style={lumoStyles.contactLabel}>CONTACT</Text>
                  <Text style={lumoStyles.contactName}>{contactName}</Text>
                  <Text style={lumoStyles.contactPhone}>{phone ? "+" + phone : "Contact details not added"}</Text>
                </View>
                {phone ? (
                  <Pressable onPress={callSupport} style={lumoStyles.callButton} accessibilityLabel="Call LUMO">
                    <Ionicons name="call-outline" size={17} color={colors.accentStrong} />
                  </Pressable>
                ) : null}
              </View>

              <Pressable onPress={() => setDetailsOpen((value) => !value)} style={lumoStyles.detailsToggle} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}>
                <View style={lumoStyles.detailsToggleLeft}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.accentStrong} />
                  <Text style={lumoStyles.detailsToggleText}>PRODUCT DETAILS</Text>
                </View>
                <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={17} color={colors.muted} />
              </Pressable>

              {detailsOpen ? (
                <View style={lumoStyles.detailsPanel}>
                  <Text style={lumoStyles.detailText}>{product.description || product.short_description || "No additional product details."}</Text>
                  <View style={lumoStyles.detailSpecRow}>
                    <Text style={lumoStyles.detailSpecLabel}>Category</Text>
                    <Text style={lumoStyles.detailSpecValue}>{product.category}</Text>
                  </View>
                  {product.sku ? (
                    <View style={lumoStyles.detailSpecRow}>
                      <Text style={lumoStyles.detailSpecLabel}>Product code</Text>
                      <Text style={lumoStyles.detailSpecValue}>{product.sku}</Text>
                    </View>
                  ) : null}
                  {selectedVariant?.color ? (
                    <View style={lumoStyles.detailSpecRow}>
                      <Text style={lumoStyles.detailSpecLabel}>Color</Text>
                      <Text style={lumoStyles.detailSpecValue}>{selectedVariant.color}</Text>
                    </View>
                  ) : null}
                  {selectedVariant?.size ? (
                    <View style={lumoStyles.detailSpecRow}>
                      <Text style={lumoStyles.detailSpecLabel}>Size</Text>
                      <Text style={lumoStyles.detailSpecValue}>{selectedVariant.size}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={lumoStyles.recommendationsSection}>
              <View style={lumoStyles.recommendationsHeader}>
                <View style={lumoStyles.recommendationsHeading}>
                  <Text style={lumoStyles.recommendationsEyebrow}>THE LUMO EDIT</Text>
                  <Text style={lumoStyles.recommendationsTitle}>You may also like</Text>
                </View>
                <Pressable onPress={() => router.replace("/market" as never)} style={lumoStyles.viewAllButton}>
                  <Text style={lumoStyles.viewAllText}>VIEW ALL</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.accentStrong} />
                </Pressable>
              </View>
              {recommendedProducts.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={lumoStyles.recommendationsRail}
                >
                  {recommendedProducts.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push(("/market/originals/" + item.slug) as never)}
                      style={({ pressed }) => [lumoStyles.recommendationCard, pressed && lumoStyles.recommendationPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={"View " + item.name}
                    >
                      <View style={lumoStyles.recommendationImageWrap}>
                        {item.images?.[0] ? (
                          <Image source={{ uri: item.images[0] }} style={lumoStyles.recommendationImage} contentFit="cover" />
                        ) : (
                          <View style={lumoStyles.recommendationPlaceholder}>
                            <Ionicons name="image-outline" size={25} color={colors.dim} />
                          </View>
                        )}
                        {item.is_featured ? (
                          <View style={lumoStyles.recommendationBadge}>
                            <Ionicons name="sparkles" size={9} color={colors.bg} />
                            <Text style={lumoStyles.recommendationBadgeText}>SELECTED</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={lumoStyles.recommendationInfo}>
                        <Text style={lumoStyles.recommendationCategory} numberOfLines={1}>{item.category}</Text>
                        <Text style={lumoStyles.recommendationName} numberOfLines={1}>{item.name}</Text>
                        <Text style={lumoStyles.recommendationPrice}>{formatProductPrice(item.price, item.currency)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <View style={lumoStyles.recommendationsEmpty}>
                  <Ionicons name="sparkles-outline" size={17} color={colors.dim} />
                  <Text style={lumoStyles.recommendationsEmptyText}>More LUMO pieces are coming soon.</Text>
                </View>
              )}
          </View>

          <View style={lumoStyles.footer}>
            <Text style={lumoStyles.footerBrand}>LUMO ORIGINALS</Text>
            <Text style={lumoStyles.footerTagline}>Everyday essentials. Elevated style.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={lumoStyles.stickyBar}>
        <View style={lumoStyles.stickyPriceBlock}>
          <Text style={lumoStyles.stickyPriceLabel}>SUBTOTAL</Text>
          <Text style={lumoStyles.stickyPrice}>{formatProductPrice(shownPrice * quantity, product.currency)}</Text>
        </View>
        <Pressable onPress={openOrderForm} style={({ pressed }) => [lumoStyles.orderButton, pressed && lumoStyles.orderButtonPressed]}>
          <Ionicons name="bag-handle-outline" size={18} color={colors.bg} />
          <Text style={lumoStyles.orderButtonText}>{hasStock ? "PLACE ORDER" : "REQUEST ORDER"}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.bg} />
        </Pressable>
      </View>

      <Modal visible={orderModalOpen} transparent animationType="slide" onRequestClose={() => setOrderModalOpen(false)}>
        <View style={lumoStyles.orderModalBackdrop}>
          <View style={lumoStyles.orderModalCard}>
            <View style={lumoStyles.orderModalHeader}>
              <View>
                <Text style={lumoStyles.orderModalEyebrow}>LUMO ORIGINALS</Text>
                <Text style={lumoStyles.orderModalTitle}>Complete your order</Text>
              </View>
              <Pressable onPress={() => setOrderModalOpen(false)} style={lumoStyles.iconButton}>
                <Ionicons name="close" size={19} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={lumoStyles.orderFormContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={lumoStyles.orderSummary}>
                <Text style={lumoStyles.orderSummaryName}>{product.name}</Text>
                <Text style={lumoStyles.orderSummaryMeta}>{selectedVariant?.name ?? "Standard option"} · Qty {quantity}</Text>
                <Text style={lumoStyles.orderSummaryPrice}>{formatProductPrice(shownPrice * quantity, product.currency)}</Text>
              </View>

              {orderError ? (
                <View style={lumoStyles.orderError}>
                  <Ionicons name="alert-circle-outline" size={15} color={colors.like} />
                  <Text style={lumoStyles.orderErrorText}>{orderError}</Text>
                </View>
              ) : null}

              <Text style={lumoStyles.orderFieldLabel}>FULL NAME *</Text>
              <TextInput
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Your full name"
                placeholderTextColor={colors.dim}
                autoCapitalize="words"
                style={lumoStyles.orderInput}
              />

              <Text style={lumoStyles.orderFieldLabel}>PHONE NUMBER *</Text>
              <TextInput
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="+998 90 123 45 67"
                placeholderTextColor={colors.dim}
                keyboardType="phone-pad"
                style={lumoStyles.orderInput}
              />

              <Text style={lumoStyles.orderFieldLabel}>DELIVERY ADDRESS</Text>
              <TextInput
                value={customerAddress}
                onChangeText={setCustomerAddress}
                placeholder="City, street, house or pickup point"
                placeholderTextColor={colors.dim}
                multiline
                style={[lumoStyles.orderInput, lumoStyles.orderInputMultiline]}
              />

              <Text style={lumoStyles.orderFieldLabel}>NOTE (OPTIONAL)</Text>
              <TextInput
                value={customerNote}
                onChangeText={setCustomerNote}
                placeholder="Additional information"
                placeholderTextColor={colors.dim}
                multiline
                style={[lumoStyles.orderInput, lumoStyles.orderInputMultiline]}
              />

              <Text style={lumoStyles.orderDisclaimer}>This submits an order request. Payment and final availability are confirmed by LUMO.</Text>
            </ScrollView>

            <Pressable
              onPress={() => void submitOrder()}
              disabled={submittingOrder}
              style={[lumoStyles.submitOrderButton, submittingOrder && lumoStyles.submitOrderDisabled]}
            >
              {submittingOrder ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="checkmark-circle-outline" size={18} color={colors.bg} />}
              <Text style={lumoStyles.submitOrderText}>{submittingOrder ? "SUBMITTING..." : "SUBMIT ORDER"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={imageViewerOpen} transparent animationType="fade" onRequestClose={() => setImageViewerOpen(false)}>
        <View style={lumoStyles.imageViewer}>
          <Pressable onPress={() => setImageViewerOpen(false)} style={lumoStyles.imageViewerClose} accessibilityLabel="Close image viewer">
            <Ionicons name="close" size={23} color={colors.text} />
          </Pressable>
          {images.length > 0 ? <Image source={{ uri: images[Math.min(selectedImage, images.length - 1)] }} style={lumoStyles.imageViewerImage} contentFit="contain" /> : null}
          {images.length > 1 ? (
            <View style={lumoStyles.imageViewerControls}>
              <Pressable onPress={() => setSelectedImage((value) => (value - 1 + images.length) % images.length)} style={lumoStyles.imageNavButton}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={lumoStyles.imageViewerCount}>{selectedImage + 1} / {images.length}</Text>
              <Pressable onPress={() => setSelectedImage((value) => (value + 1) % images.length)} style={lumoStyles.imageNavButton}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { alignItems: "center", paddingTop: 12, paddingBottom: 24 },
  container: { width: "100%", maxWidth: 1240, paddingHorizontal: 18, gap: 18 },
  topBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backLink: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 },
  backLinkText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: colors.accentStrong, fontSize: 20, fontWeight: "900", letterSpacing: -2 },
  brandEyebrow: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  brandName: { color: colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },
  iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  productLayout: { width: "100%", flexDirection: "column", gap: 20 },
  productLayoutWide: { flexDirection: "row", alignItems: "flex-start", gap: 30 },
  galleryColumn: { width: "100%", gap: 10 },
  wideColumn: { width: "53%" },
  imageStage: { width: "100%", aspectRatio: 1, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, position: "relative" },
  heroImage: { width: "100%", height: "100%" },
  imageFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  imageFallbackText: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  featuredPill: { position: "absolute", top: 12, left: 12, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 5 },
  featuredText: { color: colors.bg, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  zoomHint: { position: "absolute", right: 12, bottom: 12, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(9,12,18,0.8)", borderWidth: 1, borderColor: colors.glassBorder, flexDirection: "row", alignItems: "center", gap: 5 },
  zoomHintText: { color: colors.text, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  imageCount: { position: "absolute", left: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(9,12,18,0.8)" },
  imageCountText: { color: colors.text, fontSize: 8, fontWeight: "800" },
  thumbnailRow: { flexDirection: "row", gap: 8 },
  thumbnail: { width: 62, height: 62, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  thumbnailSelected: { borderColor: colors.accentStrong, borderWidth: 2 },
  thumbnailImage: { width: "100%", height: "100%" },
  trustLine: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 2 },
  trustText: { color: colors.dim, fontSize: 9, fontWeight: "700" },
  infoColumn: { width: "100%", gap: 13 },
  wideInfoColumn: { flex: 1, minWidth: 0, paddingTop: 3 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  categoryText: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  categoryDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accentStrong },
  productName: { color: colors.text, fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: -0.8 },
  priceLine: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  price: { color: colors.accentStrong, fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: -0.5 },
  priceNote: { color: colors.dim, fontSize: 8 },
  codeLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  codeLabel: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  codeValue: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 1 },
  selectorBlock: { gap: 9 },
  selectorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectorLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  selectorValue: { color: colors.text, fontSize: 9, fontWeight: "800" },
  colorChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorChoice: { minHeight: 36, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 7 },
  colorChoiceSelected: { borderColor: colors.accentStrong, backgroundColor: colors.surfaceRaised },
  colorSwatch: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder },
  whiteSwatch: { borderColor: "#68717D" },
  choiceText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  choiceTextSelected: { color: colors.text, fontWeight: "900" },
  sizeChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  sizeChoice: { minHeight: 36, minWidth: 44, paddingHorizontal: 11, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  sizeChoiceSelected: { borderColor: colors.accentStrong, backgroundColor: colors.surfaceRaised },
  quantityStockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  quantityBlock: { gap: 8 },
  quantityControl: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden", minHeight: 36 },
  quantityButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  quantityValue: { minWidth: 30, textAlign: "center", color: colors.text, fontSize: 11, fontWeight: "900" },
  stockBlock: { flexDirection: "row", alignItems: "center", gap: 8 },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  stockDotAvailable: { backgroundColor: colors.success },
  stockDotOnRequest: { backgroundColor: colors.accent },
  stockCopy: { gap: 3 },
  stockTitle: { color: colors.text, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  stockText: { color: colors.dim, fontSize: 8 },
  locationCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  locationIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  locationCopy: { flex: 1, minWidth: 0, gap: 3 },
  locationTitle: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  locationText: { color: colors.text, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  directionsButton: { width: 33, height: 33, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  contactAvatar: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  contactCopy: { flex: 1, minWidth: 0, gap: 2 },
  contactLabel: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  contactName: { color: colors.text, fontSize: 9, fontWeight: "800" },
  contactPhone: { color: colors.muted, fontSize: 9 },
  callButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  detailsToggle: { minHeight: 44, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailsToggleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailsToggleText: { color: colors.text, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  detailsPanel: { paddingHorizontal: 12, paddingVertical: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 10 },
  detailText: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  detailSpecRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  detailSpecLabel: { color: colors.dim, fontSize: 9 },
  detailSpecValue: { color: colors.text, fontSize: 9, fontWeight: "800", textAlign: "right", flex: 1 },
  footer: { paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center", gap: 4 },
  footerBrand: { color: colors.text, fontSize: 8, fontWeight: "900", letterSpacing: 1.7 },
  footerTagline: { color: colors.dim, fontSize: 8, letterSpacing: 0.4 },
  recommendationsSection: { gap: 13, marginTop: 7, paddingTop: 17, borderTopWidth: 1, borderTopColor: colors.border },
  recommendationsEmpty: { minHeight: 58, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  recommendationsEmptyText: { color: colors.dim, fontSize: 9, fontWeight: "700" },
  recommendationsHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  recommendationsHeading: { gap: 4 },
  recommendationsEyebrow: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1.5 },
  recommendationsTitle: { color: colors.text, fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },
  viewAllButton: { minHeight: 30, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  viewAllText: { color: colors.accentStrong, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  recommendationsRail: { gap: 11, paddingRight: 18, paddingBottom: 3 },
  recommendationCard: { width: 174, overflow: "hidden", borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  recommendationPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  recommendationImageWrap: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceRaised, position: "relative", overflow: "hidden" },
  recommendationImage: { width: "100%", height: "100%" },
  recommendationPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  recommendationBadge: { position: "absolute", top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 4 },
  recommendationBadgeText: { color: colors.bg, fontSize: 6, fontWeight: "900", letterSpacing: 0.5 },
  recommendationInfo: { padding: 10, gap: 4 },
  recommendationCategory: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  recommendationName: { color: colors.text, fontSize: 10, fontWeight: "800" },
  recommendationPrice: { color: colors.accentStrong, fontSize: 11, fontWeight: "900", marginTop: 2 },
  stickyBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12 },
  stickyPriceBlock: { gap: 3, minWidth: 94 },
  stickyPriceLabel: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  stickyPrice: { color: colors.text, fontSize: 15, fontWeight: "900" },
  orderButton: { flex: 1, minHeight: 44, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  orderButtonPressed: { opacity: 0.82 },
  orderButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900", flex: 1 },
  orderModalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  orderModalCard: { maxHeight: "92%", paddingHorizontal: 17, paddingTop: 16, paddingBottom: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  orderModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  orderModalEyebrow: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  orderModalTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 3 },
  orderFormContent: { gap: 9, paddingBottom: 13 },
  orderSummary: { padding: 12, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: 4, marginBottom: 3 },
  orderSummaryName: { color: colors.text, fontSize: 12, fontWeight: "900" },
  orderSummaryMeta: { color: colors.muted, fontSize: 9 },
  orderSummaryPrice: { color: colors.accentStrong, fontSize: 15, fontWeight: "900", marginTop: 2 },
  orderFieldLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  orderInput: { minHeight: 43, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 11 },
  orderInputMultiline: { minHeight: 62, textAlignVertical: "top" },
  orderError: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, borderRadius: 9, backgroundColor: "rgba(216,135,141,0.10)", borderWidth: 1, borderColor: "rgba(216,135,141,0.28)" },
  orderErrorText: { flex: 1, color: colors.like, fontSize: 9, lineHeight: 14 },
  orderDisclaimer: { color: colors.dim, fontSize: 8, lineHeight: 13, marginTop: 3 },
  submitOrderButton: { minHeight: 45, borderRadius: 11, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 9 },
  submitOrderText: { color: colors.bg, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  submitOrderDisabled: { opacity: 0.55 },
  imageViewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center", padding: 15 },
  imageViewerClose: { position: "absolute", zIndex: 2, top: 38, right: 20, width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  imageViewerImage: { width: "100%", height: "78%" },
  imageViewerControls: { flexDirection: "row", alignItems: "center", gap: 25, marginTop: 15 },
  imageNavButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  imageViewerCount: { color: colors.text, fontSize: 10, fontWeight: "800" },
  stateRoot: { flex: 1, padding: 26, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.bg },
  stateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  stateText: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: "center", maxWidth: 340 },
  backButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 },
  backButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
});
