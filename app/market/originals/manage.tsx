import React, { useCallback, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import {
  archiveOfficialProduct,
  canManageOfficialCatalog,
  getOfficialCatalog,
  getPlatformRoles,
  replaceOfficialProductVariants,
  saveOfficialProduct,
  syncOfficialProductMedia,
  updateOfficialStore,
  type OfficialLocalImage,
  type OfficialProduct,
  type OfficialProductMedia,
  type OfficialProductStatus,
  type OfficialVariantInput,
  type PlatformRole,
} from "../../../lib/market-official";
import { colors } from "../../../lib/theme";

type VariantDraft = {
  id?: string;
  key: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  price_override: string;
  stock_quantity: string;
  is_active: boolean;
};

type ProductFieldErrors = {
  name?: string;
  category?: string;
  price?: string;
  compareAtPrice?: string;
  variants: Record<string, { name?: string; stock_quantity?: string; price_override?: string }>;
};

type ProductForm = {
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  currency: "UZS" | "USD";
  status: OfficialProductStatus;
  isFeatured: boolean;
};

const emptyForm: ProductForm = {
  name: "",
  category: "",
  shortDescription: "",
  description: "",
  sku: "",
  price: "",
  compareAtPrice: "",
  currency: "UZS",
  status: "draft",
  isFeatured: false,
};

function formatPrice(price: number, currency: "UZS" | "USD"): string {
  if (price <= 0) return "Price on request";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(price);
  return currency === "UZS" ? `${formatted} UZS` : `$${formatted}`;
}

function readStoreAddress(value: string): string {
  return value.match(/(?:Address|Pickup address|Location):\s*([^\r\n]+)/i)?.[1]?.trim() ?? "";
}

function mergeStoreAddress(value: string, address: string): string {
  const lines = value
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:Address|Pickup address|Location):/i.test(line));
  if (address.trim()) {
    const phoneIndex = lines.findIndex((line) => /^\s*Phone:/i.test(line));
    lines.splice(phoneIndex >= 0 ? phoneIndex + 1 : lines.length, 0, `Address: ${address.trim()}`);
  }
  return lines.join("\n").trim();
}

function toVariantDraft(variant: NonNullable<OfficialProduct["variants"]>[number]): VariantDraft {
  return {
    id: variant.id,
    key: variant.id,
    name: variant.name,
    color: variant.color ?? "",
    size: variant.size ?? "",
    sku: variant.sku ?? "",
    price_override: variant.price_override == null ? "" : String(variant.price_override),
    stock_quantity: String(variant.stock_quantity),
    is_active: variant.is_active,
  };
}

export default function OfficialCatalogManagerScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [products, setProducts] = useState<OfficialProduct[]>([]);
  const [storeDescription, setStoreDescription] = useState("");
  const [contactText, setContactText] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeRegion, setStoreRegion] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<OfficialProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [keptMedia, setKeptMedia] = useState<OfficialProductMedia[]>([]);
  const [newImages, setNewImages] = useState<OfficialLocalImage[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({ variants: {} });
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const formScrollRef = useRef<ScrollView>(null);

  const isManager = canManageOfficialCatalog(roles);

  const load = useCallback(async (refresh = false) => {
    if (!userId) {
      setRoles([]);
      setProducts([]);
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const nextRoles = await getPlatformRoles(userId);
      setRoles(nextRoles);
      if (!canManageOfficialCatalog(nextRoles)) {
        setProducts([]);
        return;
      }

      const catalog = await getOfficialCatalog({ includeInactive: true });
      setProducts(catalog.products);
      setStoreDescription(catalog.store?.description ?? "");
      setContactText(catalog.store?.contact_text ?? "");
      setStoreCity(catalog.store?.city ?? "");
      setStoreRegion(catalog.store?.region ?? "");
      setStoreAddress(readStoreAddress(catalog.store?.contact_text ?? ""));
      setIsPublished(catalog.store?.is_published ?? false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Official catalog ma’lumotlarini yuklab bo‘lmadi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const publishedCount = useMemo(() => products.filter((item) => item.status === "active").length, [products]);
  const draftCount = useMemo(() => products.filter((item) => item.status === "draft").length, [products]);
  const archivedCount = useMemo(() => products.filter((item) => item.status === "archived").length, [products]);

  const startCreate = () => {
    setFormMessage(null);
    setFieldErrors({ variants: {} });
    setEditingProduct(null);
    setForm(emptyForm);
    setKeptMedia([]);
    setNewImages([]);
    setVariants([]);
    setEditorVisible(true);
  };

  const startEdit = (product: OfficialProduct) => {
    setFormMessage(null);
    setFieldErrors({ variants: {} });
    setEditingProduct(product);
    setForm({
      name: product.name,
      category: product.category,
      shortDescription: product.short_description,
      description: product.description,
      sku: product.sku ?? "",
      price: String(product.price),
      compareAtPrice: product.compare_at_price == null ? "" : String(product.compare_at_price),
      currency: product.currency,
      status: product.status,
      isFeatured: product.is_featured,
    });
    setKeptMedia(product.media ?? []);
    setNewImages([]);
    setVariants((product.variants ?? []).map(toVariantDraft));
    setEditorVisible(true);
  };

  const chooseImages = async () => {
    const remaining = Math.max(0, 8 - keptMedia.length - newImages.length);
    if (!remaining) {
      Alert.alert("Image limit", "Bitta mahsulot uchun ko‘pi bilan 8 ta rasm qo‘shish mumkin.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Rasm tanlash uchun galereyaga ruxsat bering.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });

    if (result.canceled) return;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const unsupported = result.assets.filter((asset) => asset.mimeType && !allowedTypes.has(asset.mimeType));
    if (unsupported.length) {
      Alert.alert("Unsupported image", "Faqat JPEG, PNG yoki WebP rasmlarni tanlang.");
    }
    const selected = result.assets
      .filter((asset) => !asset.mimeType || allowedTypes.has(asset.mimeType))
      .map((asset) => ({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      }));
    setNewImages((current) => [...current, ...selected].slice(0, remaining + current.length));
  };

  const removeNewImage = (index: number) => {
    setNewImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const removeKeptImage = (id: string) => {
    setKeptMedia((current) => current.filter((item) => item.id !== id));
  };

  const addVariant = () => {
    setVariants((current) => [...current, {
      key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: "",
      color: "",
      size: "",
      sku: "",
      price_override: "",
      stock_quantity: "0",
      is_active: true,
    }]);
  };

  const updateVariant = (key: string, patch: Partial<VariantDraft>) => {
    setVariants((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const removeVariant = (key: string) => {
    setVariants((current) => current.filter((item) => item.key !== key));
  };

  const saveProduct = async () => {
    setFormMessage(null);
    if (!userId) {
      setFormMessage("Your session has expired. Please sign in again.");
      return;
    }
    const price = Number(form.price || 0);
    const compareAtPrice = form.compareAtPrice.trim() ? Number(form.compareAtPrice) : null;
    const nextErrors: ProductFieldErrors = { variants: {} };

    if (form.name.trim().length < 2) nextErrors.name = "This field is required. Enter at least 2 characters.";
    if (form.category.trim().length < 2) nextErrors.category = "This field is required. Enter at least 2 characters.";
    if (!form.price.trim() || !Number.isFinite(price) || price <= 0) nextErrors.price = "This field is required. Enter a price greater than 0.";
    if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < price)) nextErrors.compareAtPrice = "Enter a valid price equal to or higher than the current price.";
    if (keptMedia.length + newImages.length > 8) setFormMessage("You can add up to 8 images per product.");

    variants.forEach((variant) => {
      const stock = Number(variant.stock_quantity || 0);
      const override = variant.price_override.trim() ? Number(variant.price_override) : null;
      const variantErrors: { name?: string; stock_quantity?: string; price_override?: string } = {};
      if (!variant.name.trim()) variantErrors.name = "This field is required.";
      if (!Number.isInteger(stock) || stock < 0) variantErrors.stock_quantity = "Enter a valid whole number (0 or more).";
      if (override !== null && (!Number.isFinite(override) || override < 0)) variantErrors.price_override = "Enter a valid price or leave this field empty.";
      if (Object.keys(variantErrors).length) nextErrors.variants[variant.key] = variantErrors;
    });

    const hasVariantErrors = Object.values(nextErrors.variants).some((item) => Object.values(item).some(Boolean));
    if (nextErrors.name || nextErrors.category || nextErrors.price || nextErrors.compareAtPrice || hasVariantErrors || keptMedia.length + newImages.length > 8) {
      setFieldErrors(nextErrors);
      if (nextErrors.name || nextErrors.category || nextErrors.price || nextErrors.compareAtPrice) {
        formScrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        formScrollRef.current?.scrollToEnd({ animated: true });
      }
      return;
    }
    setFieldErrors({ variants: {} });

    setSavingProduct(true);
    let savedProductId: string | null = null;
    try {
      const saved = await saveOfficialProduct({
        name: form.name,
        category: form.category,
        short_description: form.shortDescription,
        description: form.description,
        sku: form.sku.trim() || null,
        status: form.status,
        price,
        compare_at_price: compareAtPrice,
        currency: form.currency,
        is_featured: form.isFeatured,
        sort_order: editingProduct?.sort_order ?? products.length,
      }, userId, editingProduct?.id);
      savedProductId = saved.id;

      const nextVariants: OfficialVariantInput[] = variants.map((variant, index) => ({
        id: variant.id,
        name: variant.name,
        color: variant.color || null,
        size: variant.size || null,
        sku: variant.sku || null,
        price_override: variant.price_override.trim() ? Number(variant.price_override) : null,
        stock_quantity: Number(variant.stock_quantity || 0),
        is_active: variant.is_active,
        sort_order: index,
      }));
      await replaceOfficialProductVariants(saved.id, nextVariants, editingProduct?.variants ?? []);

      const retainedIds = new Set(keptMedia.map((item) => item.id));
      const removedMedia = (editingProduct?.media ?? []).filter((item) => !retainedIds.has(item.id));
      await syncOfficialProductMedia(saved.id, userId, newImages, removedMedia);

      setEditorVisible(false);
      await load(true);
      Alert.alert("Saved", "Lumo Originals mahsuloti saqlandi.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Product could not be saved.";
      setFormMessage(savedProductId ? `Product details were partially saved. Please review: ${message}` : `Could not create product: ${message}`);
      await load(true);
    } finally {
      setSavingProduct(false);
    }
  };

  const saveStoreSettings = async () => {
    if (!userId) return;
    setSavingStore(true);
    try {
      await updateOfficialStore(userId, {
        description: storeDescription,
        contact_text: mergeStoreAddress(contactText, storeAddress),
        city: storeCity.trim() || null,
        region: storeRegion.trim() || null,
      });
      Alert.alert("Saved", "Katalog ma’lumotlari yangilandi.");
      await load(true);
    } catch (saveError) {
      Alert.alert("Save failed", saveError instanceof Error ? saveError.message : "Katalog ma’lumotlarini saqlab bo‘lmadi.");
    } finally {
      setSavingStore(false);
    }
  };

  const changePublication = () => {
    if (!userId) return;
    const nextValue = !isPublished;
    Alert.alert(
      nextValue ? "Publish Lumo Originals?" : "Unpublish Lumo Originals?",
      nextValue
        ? "Faqat Active holatdagi mahsulotlar Memberlarga ko‘rinadi. Katalogni nashr qilamizmi?"
        : "Katalog Memberlar uchun yashiriladi. Mahsulotlar bazada saqlanib qoladi.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextValue ? "Publish" : "Unpublish",
          style: nextValue ? "default" : "destructive",
          onPress: async () => {
            setSavingStore(true);
            try {
              await updateOfficialStore(userId, { is_published: nextValue });
              setIsPublished(nextValue);
              Alert.alert("Updated", nextValue ? "Lumo Originals endi Memberlarga ko‘rinadi." : "Lumo Originals ommadan yashirildi.");
            } catch (updateError) {
              Alert.alert("Update failed", updateError instanceof Error ? updateError.message : "Katalog holatini o‘zgartirib bo‘lmadi.");
            } finally {
              setSavingStore(false);
            }
          },
        },
      ],
    );
  };

  const confirmArchive = (product: OfficialProduct) => {
    if (!userId) return;
    Alert.alert(
      "Archive product?",
      `${product.name} katalogdan yashiriladi. Mahsulot ma’lumotlari o‘chirilmaydi.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            try {
              await archiveOfficialProduct(product.id, userId);
              await load(true);
            } catch (archiveError) {
              Alert.alert("Archive failed", archiveError instanceof Error ? archiveError.message : "Mahsulotni arxivlab bo‘lmadi.");
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.accentStrong} /><Text style={styles.muted}>Loading official catalog...</Text></View>;
  }

  if (!isManager) {
    return (
      <View style={styles.center}>
        <View style={styles.lockIcon}><Ionicons name="lock-closed-outline" size={26} color={colors.accentStrong} /></View>
        <Text style={styles.deniedTitle}>Access restricted</Text>
        <Text style={styles.muted}>Lumo Originals boshqaruvi Owner, Admin va Developer uchun.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Go back</Text></Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={19} color={colors.text} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>LUMO / ORIGINALS</Text>
            <Text style={styles.pageTitle}>Catalog management</Text>
          </View>
          <Pressable onPress={() => void load(true)} style={styles.iconButton} accessibilityLabel="Refresh catalog">
            {refreshing ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="refresh" size={18} color={colors.accentStrong} />}
          </Pressable>
        </View>

        <View style={styles.accessPanel}>
          <View style={styles.accessIcon}><Ionicons name="shield-checkmark-outline" size={20} color={colors.accentStrong} /></View>
          <View style={styles.accessCopy}>
            <Text style={styles.accessTitle}>Manager access verified</Text>
            <Text style={styles.accessText}>{roles.filter((role) => role === "owner" || role === "developer" || role === "admin").join(" · ").toUpperCase()} · Members can browse and order</Text>
          </View>
          <View style={[styles.statusPill, isPublished ? styles.statusPublished : styles.statusDraft]}>
            <View style={[styles.statusDot, isPublished ? styles.dotPublished : styles.dotDraft]} />
            <Text style={styles.statusText}>{isPublished ? "PUBLIC" : "PRIVATE"}</Text>
          </View>
        </View>

        {error ? <View style={styles.errorPanel}><Text style={styles.errorTitle}>Could not load catalog</Text><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load(true)}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}

        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statValue}>{products.length}</Text><Text style={styles.statLabel}>TOTAL</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{publishedCount}</Text><Text style={styles.statLabel}>ACTIVE</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{draftCount}</Text><Text style={styles.statLabel}>DRAFTS</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{archivedCount}</Text><Text style={styles.statLabel}>ARCHIVED</Text></View>
        </View>

        <Pressable onPress={() => router.push("/market/originals/orders" as never)} style={styles.ordersShortcut}>
          <View style={styles.ordersShortcutIcon}><Ionicons name="receipt-outline" size={19} color={colors.accentStrong} /></View>
          <View style={styles.ordersShortcutCopy}>
            <Text style={styles.ordersShortcutTitle}>Order management</Text>
            <Text style={styles.ordersShortcutText}>New orders, active orders and completed purchases</Text>
          </View>
          <Ionicons name="arrow-forward" size={17} color={colors.accentStrong} />
        </Pressable>

        <View style={styles.panel}>
          <View style={styles.panelHeading}>
            <View style={styles.panelHeadingCopy}><Text style={styles.panelEyebrow}>PUBLIC VISIBILITY</Text><Text style={styles.panelTitle}>Lumo Originals catalog</Text></View>
            <Pressable onPress={changePublication} disabled={savingStore} style={[styles.publishButton, isPublished ? styles.unpublishButton : null, savingStore && styles.disabled]}>
              <Ionicons name={isPublished ? "eye-off-outline" : "eye-outline"} size={15} color={isPublished ? colors.text : colors.bg} />
              <Text style={[styles.publishButtonText, isPublished ? styles.unpublishButtonText : null]}>{savingStore ? "Saving..." : isPublished ? "Unpublish" : "Publish catalog"}</Text>
            </Pressable>
          </View>
          <Text style={styles.panelDescription}>Katalogni publish qilish Memberlarga faqat Active mahsulotlarni ko‘rsatadi. Draft va Archived mahsulotlar ko‘rinmaydi.</Text>
          <Text style={styles.fieldLabel}>Catalog description</Text>
          <TextInput value={storeDescription} onChangeText={setStoreDescription} placeholder="Lumo Originals haqida qisqacha..." placeholderTextColor={colors.dim} multiline style={[styles.input, styles.multiline]} />
          <View style={styles.twoColumns}>
            <View style={styles.columnField}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput value={storeCity} onChangeText={setStoreCity} placeholder="City" placeholderTextColor={colors.dim} style={styles.input} />
            </View>
            <View style={styles.columnField}>
              <Text style={styles.fieldLabel}>Region</Text>
              <TextInput value={storeRegion} onChangeText={setStoreRegion} placeholder="Region / State" placeholderTextColor={colors.dim} style={styles.input} />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Street address / Pickup point</Text>
          <TextInput value={storeAddress} onChangeText={setStoreAddress} placeholder="Street, building, landmark..." placeholderTextColor={colors.dim} style={styles.input} />
          <Text style={styles.helperText}>Country: Uzbekistan. The product page combines this with the city and region.</Text>
          <Text style={styles.fieldLabel}>Purchase information / Contact</Text>
          <TextInput value={contactText} onChangeText={setContactText} placeholder="Sotib olish bo‘yicha aloqa va yo‘riqnoma..." placeholderTextColor={colors.dim} multiline style={[styles.input, styles.multiline]} />
          <Pressable onPress={saveStoreSettings} disabled={savingStore} style={[styles.secondaryAction, savingStore && styles.disabled]}>
            {savingStore ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="save-outline" size={15} color={colors.accentStrong} />}
            <Text style={styles.secondaryActionText}>Save catalog information</Text>
          </Pressable>
        </View>

        <View style={styles.productsHeading}>
          <View><Text style={styles.panelEyebrow}>OFFICIAL INVENTORY</Text><Text style={styles.panelTitle}>Products</Text></View>
          <Pressable onPress={startCreate} style={styles.addButton}><Ionicons name="add" size={17} color={colors.bg} /><Text style={styles.addButtonText}>Add product</Text></Pressable>
        </View>

        {products.length ? products.map((product) => (
          <View key={product.id} style={styles.productRow}>
            {product.images[0] ? <Image source={{ uri: product.images[0] }} style={styles.productThumb} /> : <View style={[styles.productThumb, styles.thumbPlaceholder]}><Ionicons name="image-outline" size={22} color={colors.dim} /></View>}
            <View style={styles.productRowInfo}>
              <Text style={styles.productCategory}>{product.category}</Text>
              <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
              <Text style={styles.productMeta}>{product.variants.length} variants · {product.media.length} images</Text>
            </View>
            <View style={styles.productRowActions}>
              <View style={[styles.smallStatus, product.status === "active" ? styles.smallStatusActive : product.status === "draft" ? styles.smallStatusDraft : styles.smallStatusArchived]}><Text style={styles.smallStatusText}>{product.status.toUpperCase()}</Text></View>
              <Pressable onPress={() => startEdit(product)} style={styles.rowIconButton} hitSlop={6}><Ionicons name="create-outline" size={17} color={colors.accentStrong} /></Pressable>
              {product.status !== "archived" ? <Pressable onPress={() => confirmArchive(product)} style={styles.rowIconButton} hitSlop={6}><Ionicons name="archive-outline" size={17} color={colors.muted} /></Pressable> : null}
            </View>
          </View>
        )) : (
          <View style={styles.emptyProducts}>
            <View style={styles.emptyIcon}><Ionicons name="cube-outline" size={25} color={colors.muted} /></View>
            <Text style={styles.emptyTitle}>No official products yet</Text>
            <Text style={styles.emptyText}>Bu yerda faqat sen qo‘shgan haqiqiy Lumo mahsulotlari ko‘rinadi. Demo mahsulotlar yo‘q.</Text>
            <Pressable onPress={startCreate} style={styles.addButton}><Ionicons name="add" size={17} color={colors.bg} /><Text style={styles.addButtonText}>Add first product</Text></Pressable>
          </View>
        )}
      </ScrollView>

      <Modal visible={editorVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditorVisible(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalHeader}>
            <View><Text style={styles.eyebrow}>LUMO ORIGINALS / INVENTORY</Text><Text style={styles.modalTitle}>{editingProduct ? "Edit product" : "New product"}</Text></View>
            <Pressable onPress={() => setEditorVisible(false)} style={styles.iconButton}><Ionicons name="close" size={20} color={colors.text} /></Pressable>
          </View>
          <ScrollView ref={formScrollRef} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {formMessage ? <View style={styles.formMessage}><Ionicons name="alert-circle-outline" size={15} color={colors.like} /><Text style={styles.formMessageText}>{formMessage}</Text></View> : null}
            <Text style={styles.fieldLabel}>Product name *</Text>
            <TextInput value={form.name} onChangeText={(value) => { setForm((current) => ({ ...current, name: value })); setFieldErrors((current) => ({ ...current, name: undefined })); }} placeholder="Product name" placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.name && styles.inputInvalid]} />
            {fieldErrors.name ? <Text style={styles.inlineError}>{fieldErrors.name}</Text> : null}
            <Text style={styles.fieldLabel}>Category *</Text>
            <TextInput value={form.category} onChangeText={(value) => { setForm((current) => ({ ...current, category: value })); setFieldErrors((current) => ({ ...current, category: undefined })); }} placeholder="Apparel, Accessories, Footwear..." placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.category && styles.inputInvalid]} />
            {fieldErrors.category ? <Text style={styles.inlineError}>{fieldErrors.category}</Text> : null}
            <Text style={styles.fieldLabel}>Short description</Text>
            <TextInput value={form.shortDescription} onChangeText={(value) => setForm((current) => ({ ...current, shortDescription: value }))} placeholder="Short product summary" placeholderTextColor={colors.dim} maxLength={240} style={styles.input} />
            <Text style={styles.fieldLabel}>Full description</Text>
            <TextInput value={form.description} onChangeText={(value) => setForm((current) => ({ ...current, description: value }))} placeholder="Materials, features, care instructions..." placeholderTextColor={colors.dim} multiline maxLength={5000} style={[styles.input, styles.multiline]} />

            <View style={styles.twoColumns}>
              <View style={styles.columnField}><Text style={styles.fieldLabel}>Price *</Text><TextInput value={form.price} onChangeText={(value) => { setForm((current) => ({ ...current, price: value.replace(/[^0-9.]/g, "") })); setFieldErrors((current) => ({ ...current, price: undefined })); }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.price && styles.inputInvalid]} />{fieldErrors.price ? <Text style={styles.inlineError}>{fieldErrors.price}</Text> : null}</View>
              <View style={styles.columnField}><Text style={styles.fieldLabel}>Currency</Text><View style={styles.segmentRow}><Pressable onPress={() => setForm((current) => ({ ...current, currency: "UZS" }))} style={[styles.segment, form.currency === "UZS" && styles.segmentActive]}><Text style={[styles.segmentText, form.currency === "UZS" && styles.segmentTextActive]}>UZS</Text></Pressable><Pressable onPress={() => setForm((current) => ({ ...current, currency: "USD" }))} style={[styles.segment, form.currency === "USD" && styles.segmentActive]}><Text style={[styles.segmentText, form.currency === "USD" && styles.segmentTextActive]}>USD</Text></Pressable></View></View>
            </View>
            <Text style={styles.fieldLabel}>Compare-at price (optional)</Text>
            <TextInput value={form.compareAtPrice} onChangeText={(value) => { setForm((current) => ({ ...current, compareAtPrice: value.replace(/[^0-9.]/g, "") })); setFieldErrors((current) => ({ ...current, compareAtPrice: undefined })); }} keyboardType="decimal-pad" placeholder="Old price" placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.compareAtPrice && styles.inputInvalid]} />
            {fieldErrors.compareAtPrice ? <Text style={styles.inlineError}>{fieldErrors.compareAtPrice}</Text> : null}
            <Text style={styles.fieldLabel}>SKU (optional)</Text>
            <TextInput value={form.sku} onChangeText={(value) => setForm((current) => ({ ...current, sku: value }))} placeholder="Internal product code" placeholderTextColor={colors.dim} style={styles.input} />

            <Text style={styles.fieldLabel}>Publication status</Text>
            <View style={styles.segmentRow}>
              {(["draft", "active", "archived"] as OfficialProductStatus[]).map((status) => <Pressable key={status} onPress={() => setForm((current) => ({ ...current, status }))} style={[styles.segment, form.status === status && styles.segmentActive]}><Text style={[styles.segmentText, form.status === status && styles.segmentTextActive]}>{status.toUpperCase()}</Text></Pressable>)}
            </View>
            <Pressable onPress={() => setForm((current) => ({ ...current, isFeatured: !current.isFeatured }))} style={styles.checkRow}><Ionicons name={form.isFeatured ? "checkbox" : "square-outline"} size={19} color={form.isFeatured ? colors.accentStrong : colors.muted} /><Text style={styles.checkLabel}>Feature this product in the collection</Text></Pressable>

            <View style={styles.formSectionHeading}><View><Text style={styles.panelEyebrow}>PRODUCT GALLERY</Text><Text style={styles.sectionTitle}>Images</Text></View><Text style={styles.imageLimit}>{keptMedia.length + newImages.length}/8</Text></View>
            <View style={styles.imageGrid}>
              {keptMedia.map((media) => <View key={media.id} style={styles.imageTile}><Image source={{ uri: media.url }} style={styles.imageTileImage} /><Pressable onPress={() => removeKeptImage(media.id)} style={styles.removeImage}><Ionicons name="close" size={13} color="#FFFFFF" /></Pressable></View>)}
              {newImages.map((image, index) => <View key={`${image.uri}-${index}`} style={styles.imageTile}><Image source={{ uri: image.uri }} style={styles.imageTileImage} /><Pressable onPress={() => removeNewImage(index)} style={styles.removeImage}><Ionicons name="close" size={13} color="#FFFFFF" /></Pressable></View>)}
              <Pressable onPress={() => void chooseImages()} style={styles.addImageTile}><Ionicons name="add" size={23} color={colors.accentStrong} /><Text style={styles.addImageText}>Add images</Text></Pressable>
            </View>
            <Text style={styles.helperText}>JPEG, PNG yoki WebP. Har bir fayl 10 MB dan oshmasin.</Text>

            <View style={styles.formSectionHeading}><View><Text style={styles.panelEyebrow}>SIZE / COLOR / STOCK</Text><Text style={styles.sectionTitle}>Variants</Text></View><Pressable onPress={addVariant} style={styles.addVariantButton}><Ionicons name="add" size={15} color={colors.accentStrong} /><Text style={styles.addVariantText}>Add variant</Text></Pressable></View>
            {variants.map((variant, index) => <View key={variant.key} style={styles.variantCard}>
              <View style={styles.variantTop}><Text style={styles.variantTitle}>Variant {index + 1}</Text><Pressable onPress={() => removeVariant(variant.key)} hitSlop={6}><Ionicons name="trash-outline" size={16} color={colors.like} /></Pressable></View>
              <TextInput value={variant.name} onChangeText={(value) => { updateVariant(variant.key, { name: value }); setFieldErrors((current) => ({ ...current, variants: { ...current.variants, [variant.key]: { ...current.variants[variant.key], name: undefined } } })); }} placeholder="Variant name (e.g. Black / M) *" placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.variants[variant.key]?.name && styles.inputInvalid]} />
              {fieldErrors.variants[variant.key]?.name ? <Text style={styles.inlineError}>{fieldErrors.variants[variant.key].name}</Text> : null}
              <View style={styles.twoColumns}><View style={styles.columnField}><TextInput value={variant.color} onChangeText={(value) => updateVariant(variant.key, { color: value })} placeholder="Color" placeholderTextColor={colors.dim} style={styles.input} /></View><View style={styles.columnField}><TextInput value={variant.size} onChangeText={(value) => updateVariant(variant.key, { size: value })} placeholder="Size" placeholderTextColor={colors.dim} style={styles.input} /></View></View>
              <View style={styles.twoColumns}><View style={styles.columnField}><TextInput value={variant.stock_quantity} onChangeText={(value) => { updateVariant(variant.key, { stock_quantity: value.replace(/[^0-9]/g, "") }); setFieldErrors((current) => ({ ...current, variants: { ...current.variants, [variant.key]: { ...current.variants[variant.key], stock_quantity: undefined } } })); }} keyboardType="number-pad" placeholder="Stock quantity" placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.variants[variant.key]?.stock_quantity && styles.inputInvalid]} />{fieldErrors.variants[variant.key]?.stock_quantity ? <Text style={styles.inlineError}>{fieldErrors.variants[variant.key].stock_quantity}</Text> : null}</View><View style={styles.columnField}><TextInput value={variant.price_override} onChangeText={(value) => { updateVariant(variant.key, { price_override: value.replace(/[^0-9.]/g, "") }); setFieldErrors((current) => ({ ...current, variants: { ...current.variants, [variant.key]: { ...current.variants[variant.key], price_override: undefined } } })); }} keyboardType="decimal-pad" placeholder="Price override" placeholderTextColor={colors.dim} style={[styles.input, fieldErrors.variants[variant.key]?.price_override && styles.inputInvalid]} />{fieldErrors.variants[variant.key]?.price_override ? <Text style={styles.inlineError}>{fieldErrors.variants[variant.key].price_override}</Text> : null}</View></View>
              <Pressable onPress={() => updateVariant(variant.key, { is_active: !variant.is_active })} style={styles.checkRow}><Ionicons name={variant.is_active ? "checkbox" : "square-outline"} size={18} color={variant.is_active ? colors.accentStrong : colors.muted} /><Text style={styles.checkLabel}>Available variant</Text></Pressable>
            </View>)}
            <View style={styles.formBottomSpace} />
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable onPress={() => setEditorVisible(false)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={() => void saveProduct()} disabled={savingProduct} style={[styles.saveButton, savingProduct && styles.disabled]}>
              {savingProduct ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons name="checkmark" size={17} color={colors.bg} />}
              <Text style={styles.saveButtonText}>{savingProduct ? "Saving..." : editingProduct ? "Save changes" : "Create product"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  page: { width: "100%", maxWidth: 1050, alignSelf: "center", padding: 18, paddingBottom: 58, gap: 16 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  lockIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  deniedTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: "center" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1, gap: 3 },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  iconButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  accessPanel: { padding: 13, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  accessIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  accessCopy: { flex: 1, minWidth: 0, gap: 3 },
  accessTitle: { color: colors.text, fontSize: 11, fontWeight: "900" },
  accessText: { color: colors.muted, fontSize: 8, letterSpacing: 0.4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  statusPublished: { backgroundColor: "rgba(158,190,174,0.12)" },
  statusDraft: { backgroundColor: colors.surfaceRaised },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotPublished: { backgroundColor: colors.success },
  dotDraft: { backgroundColor: colors.muted },
  statusText: { color: colors.text, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  errorPanel: { padding: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 6 },
  errorTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  errorText: { color: colors.muted, fontSize: 10 },
  retryText: { color: colors.accentStrong, fontSize: 10, fontWeight: "900", marginTop: 5 },
  statsRow: { flexDirection: "row", gap: 8 },
  ordersShortcut: { minHeight: 62, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 11 },
  ordersShortcutIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  ordersShortcutCopy: { flex: 1, gap: 4 },
  ordersShortcutTitle: { color: colors.text, fontSize: 10, fontWeight: "900" },
  ordersShortcutText: { color: colors.muted, fontSize: 8, lineHeight: 12 },
  statCard: { flex: 1, minWidth: 0, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  panel: { padding: 15, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 10 },
  panelHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  panelHeadingCopy: { flex: 1, gap: 4 },
  panelEyebrow: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1.5 },
  panelTitle: { color: colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  panelDescription: { color: colors.muted, fontSize: 9, lineHeight: 15 },
  publishButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  publishButtonText: { color: colors.bg, fontSize: 9, fontWeight: "900" },
  unpublishButton: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  unpublishButtonText: { color: colors.text },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", marginTop: 3 },
  formMessage: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: "rgba(216,135,141,0.10)", borderWidth: 1, borderColor: "rgba(216,135,141,0.28)" },
  formMessageText: { flex: 1, color: colors.like, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  input: { minHeight: 43, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 11 },
  inputInvalid: { borderColor: colors.like },
  inlineError: { color: colors.like, fontSize: 9, lineHeight: 13, marginTop: -2, marginBottom: 2 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  secondaryAction: { alignSelf: "flex-start", minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 7 },
  secondaryActionText: { color: colors.accentStrong, fontSize: 9, fontWeight: "900" },
  productsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 },
  addButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  addButtonText: { color: colors.bg, fontSize: 9, fontWeight: "900" },
  productRow: { padding: 10, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 11 },
  productThumb: { width: 67, height: 67, borderRadius: 11, backgroundColor: colors.surfaceRaised },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  productRowInfo: { flex: 1, minWidth: 0, gap: 3 },
  productCategory: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  productName: { color: colors.text, fontSize: 12, fontWeight: "900" },
  productPrice: { color: colors.accentStrong, fontSize: 9, fontWeight: "900" },
  productMeta: { color: colors.dim, fontSize: 8 },
  productRowActions: { alignItems: "flex-end", justifyContent: "center", gap: 5 },
  smallStatus: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  smallStatusActive: { backgroundColor: "rgba(158,190,174,0.14)" },
  smallStatusDraft: { backgroundColor: colors.surfaceRaised },
  smallStatusArchived: { backgroundColor: "rgba(216,135,141,0.12)" },
  smallStatusText: { color: colors.text, fontSize: 6, fontWeight: "900", letterSpacing: 0.6 },
  rowIconButton: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  emptyProducts: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 17, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.surface, gap: 9 },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  emptyText: { maxWidth: 350, textAlign: "center", color: colors.muted, fontSize: 9, lineHeight: 15 },
  primaryButton: { marginTop: 5, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent },
  primaryButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  modalRoot: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: colors.text, fontSize: 21, fontWeight: "900", marginTop: 3 },
  formContent: { width: "100%", maxWidth: 850, alignSelf: "center", padding: 18, gap: 9 },
  twoColumns: { flexDirection: "row", gap: 9 },
  columnField: { flex: 1, minWidth: 0, gap: 5 },
  segmentRow: { flexDirection: "row", gap: 7 },
  segment: { minHeight: 37, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segmentActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  segmentText: { color: colors.muted, fontSize: 8, fontWeight: "900" },
  segmentTextActive: { color: colors.accentStrong },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  checkLabel: { color: colors.text, fontSize: 9, fontWeight: "700" },
  formSectionHeading: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 3 },
  imageLimit: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imageTile: { width: 76, height: 76, borderRadius: 11, overflow: "hidden", position: "relative", backgroundColor: colors.surfaceRaised },
  imageTileImage: { width: "100%", height: "100%" },
  removeImage: { position: "absolute", right: 4, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center" },
  addImageTile: { width: 76, height: 76, borderRadius: 11, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 3 },
  addImageText: { color: colors.muted, fontSize: 7, fontWeight: "800" },
  helperText: { color: colors.dim, fontSize: 8 },
  addVariantButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  addVariantText: { color: colors.accentStrong, fontSize: 8, fontWeight: "900" },
  variantCard: { padding: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 8 },
  variantTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  variantTitle: { color: colors.text, fontSize: 9, fontWeight: "900" },
  formBottomSpace: { height: 12 },
  modalFooter: { padding: 13, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", gap: 9 },
  cancelButton: { minHeight: 43, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  saveButton: { minHeight: 43, flex: 1.5, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, borderRadius: 11, backgroundColor: colors.accent },
  saveButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  disabled: { opacity: 0.55 },
});
