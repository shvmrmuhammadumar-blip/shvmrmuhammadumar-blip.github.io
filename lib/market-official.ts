import { supabase } from "./supabase";

const db = supabase as any;
const OFFICIAL_BUCKET = "market-media";

export type PlatformRole = "owner" | "developer" | "admin";
export type PlatformAccessRole = "personal" | "admin" | "developer";

export function resolvePlatformAccessRole(roles: PlatformRole[]): PlatformAccessRole {
  if (roles.includes("developer") || roles.includes("owner")) return "developer";
  if (roles.includes("admin")) return "admin";
  return "personal";
}

export async function getPlatformAccessRole(userId: string): Promise<PlatformAccessRole> {
  return resolvePlatformAccessRole(await getPlatformRoles(userId));
}

export function canManagePlatform(roles: PlatformRole[]): boolean {
  return roles.includes("owner") || roles.includes("developer") || roles.includes("admin");
}

export type OfficialProductStatus = "draft" | "active" | "archived";
export type OfficialCurrency = "UZS" | "USD";

export type OfficialStore = {
  id: number;
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  cover_url: string | null;
  country: string;
  region: string | null;
  city: string | null;
  contact_text: string;
  is_published: boolean;
};

export type OfficialProductMedia = {
  id: string;
  product_id: string;
  storage_path: string;
  mime_type: string;
  file_name: string | null;
  alt_text: string;
  sort_order: number;
  url: string;
};

export type OfficialProductVariant = {
  id: string;
  product_id: string;
  name: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  price_override: number | null;
  stock_quantity: number;
  is_active: boolean;
  sort_order: number;
};

export type OfficialProduct = {
  id: string;
  store_id: number;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  category: string;
  sku: string | null;
  status: OfficialProductStatus;
  price: number;
  compare_at_price: number | null;
  currency: OfficialCurrency;
  is_featured: boolean;
  sort_order: number;
  images: string[];
  media: OfficialProductMedia[];
  variants: OfficialProductVariant[];
};

export type OfficialCatalog = {
  store: OfficialStore | null;
  products: OfficialProduct[];
};

export type OfficialProductInput = {
  name: string;
  category: string;
  short_description: string;
  description: string;
  sku: string | null;
  status: OfficialProductStatus;
  price: number;
  compare_at_price: number | null;
  currency: OfficialCurrency;
  is_featured: boolean;
  sort_order: number;
};

export type OfficialVariantInput = {
  id?: string;
  name: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  price_override: number | null;
  stock_quantity: number;
  is_active: boolean;
  sort_order: number;
};

export type OfficialLocalImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export async function getPlatformRoles(userId: string): Promise<PlatformRole[]> {
  const { data, error } = await db
    .from("platform_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? [])
    .map((item: { role: string }) => item.role)
    .filter((role: string): role is PlatformRole =>
      ["owner", "developer", "admin"].includes(role),
    );
}

export function canManageOfficialCatalog(roles: PlatformRole[]): boolean {
  return roles.includes("owner") || roles.includes("developer") || roles.includes("admin");
}

export async function getOfficialCatalog(
  options: { includeInactive?: boolean } = {},
): Promise<OfficialCatalog> {
  const { data: store, error: storeError } = await db
    .from("lumo_official_store")
    .select(
      "id, name, slug, description, logo_url, cover_url, country, region, city, contact_text, is_published",
    )
    .eq("id", 1)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store) return { store: null, products: [] };

  let productsQuery = db
    .from("lumo_official_products")
    .select(
      "id, store_id, slug, name, short_description, description, category, sku, status, price, compare_at_price, currency, is_featured, sort_order",
    )
    .eq("store_id", store.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (!options.includeInactive) productsQuery = productsQuery.eq("status", "active");

  const { data: productRows, error: productsError } = await productsQuery;
  if (productsError) throw productsError;

  const products = (productRows ?? []) as Omit<OfficialProduct, "images" | "media" | "variants">[];
  if (!products.length) return { store: store as OfficialStore, products: [] };

  const productIds = products.map((product) => product.id);
  const [mediaResult, variantResult] = await Promise.all([
    db
      .from("lumo_official_product_media")
      .select("id, product_id, storage_path, mime_type, file_name, alt_text, sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true }),
    db
      .from("lumo_official_product_variants")
      .select("id, product_id, name, color, size, sku, price_override, stock_quantity, is_active, sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true }),
  ]);

  if (mediaResult.error) throw mediaResult.error;
  if (variantResult.error) throw variantResult.error;

  const mediaByProduct = new Map<string, OfficialProductMedia[]>();
  for (const item of mediaResult.data ?? []) {
    const url = supabase.storage.from(OFFICIAL_BUCKET).getPublicUrl(item.storage_path).data.publicUrl;
    const current = mediaByProduct.get(item.product_id) ?? [];
    current.push({ ...item, url });
    mediaByProduct.set(item.product_id, current);
  }

  const variantsByProduct = new Map<string, OfficialProductVariant[]>();
  for (const variant of variantResult.data ?? []) {
    const current = variantsByProduct.get(variant.product_id) ?? [];
    current.push(variant);
    variantsByProduct.set(variant.product_id, current);
  }

  return {
    store: store as OfficialStore,
    products: products.map((product) => {
      const media = mediaByProduct.get(product.id) ?? [];
      return {
        ...product,
        images: media.map((item) => item.url),
        media,
        variants: variantsByProduct.get(product.id) ?? [],
      };
    }),
  };
}

function makeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || `lumo-item-${Date.now().toString(36)}`;
}

export async function saveOfficialProduct(
  input: OfficialProductInput,
  userId: string,
  productId?: string,
): Promise<{ id: string }> {
  const baseSlug = makeSlug(input.name);
  const { data: slugMatch, error: slugError } = await db
    .from("lumo_official_products")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle();
  if (slugError) throw slugError;

  const slug = slugMatch && slugMatch.id !== productId
    ? `${baseSlug.slice(0, 82)}-${Date.now().toString(36)}`
    : baseSlug;

  const payload = {
    store_id: 1,
    slug,
    name: input.name.trim(),
    short_description: input.short_description.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    sku: input.sku?.trim() || null,
    status: input.status,
    price: input.price,
    compare_at_price: input.compare_at_price,
    currency: input.currency,
    is_featured: input.is_featured,
    sort_order: input.sort_order,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (productId) {
    const { data, error } = await db
      .from("lumo_official_products")
      .update(payload)
      .eq("id", productId)
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id as string };
  }

  const { data, error } = await db
    .from("lumo_official_products")
    .insert({ ...payload, created_by: userId })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function replaceOfficialProductVariants(
  productId: string,
  variants: OfficialVariantInput[],
  previousVariants: OfficialProductVariant[],
): Promise<void> {
  const nextIds = new Set(variants.map((item) => item.id).filter(Boolean) as string[]);
  const removedIds = previousVariants.map((item) => item.id).filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error } = await db
      .from("lumo_official_product_variants")
      .delete()
      .in("id", removedIds);
    if (error) throw error;
  }

  for (const variant of variants) {
    const payload = {
      product_id: productId,
      name: variant.name.trim(),
      color: variant.color?.trim() || null,
      size: variant.size?.trim() || null,
      sku: variant.sku?.trim() || null,
      price_override: variant.price_override,
      stock_quantity: variant.stock_quantity,
      is_active: variant.is_active,
      sort_order: variant.sort_order,
      updated_at: new Date().toISOString(),
    };

    if (variant.id) {
      const { error } = await db
        .from("lumo_official_product_variants")
        .update(payload)
        .eq("id", variant.id)
        .eq("product_id", productId);
      if (error) throw error;
    } else {
      const { error } = await db
        .from("lumo_official_product_variants")
        .insert(payload);
      if (error) throw error;
    }
  }
}

function safeMimeType(value?: string | null, fileName?: string | null, uri?: string): "image/jpeg" | "image/png" | "image/webp" {
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") return value;
  const source = `${fileName ?? ""} ${uri ?? ""}`.toLowerCase();
  if (/\.png(?:[?#]|$)/.test(source)) return "image/png";
  if (/\.webp(?:[?#]|$)/.test(source)) return "image/webp";
  return "image/jpeg";
}

export async function syncOfficialProductMedia(
  productId: string,
  userId: string,
  newImages: OfficialLocalImage[],
  removedMedia: OfficialProductMedia[],
): Promise<void> {
  const uploadedPaths: string[] = [];
  const insertedStoragePaths: string[] = [];

  try {
    const insertedRows: Record<string, unknown>[] = [];
    for (let index = 0; index < newImages.length; index += 1) {
      const asset = newImages[index];
      const mimeType = safeMimeType(asset.mimeType, asset.fileName, asset.uri);
      const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const fileName = asset.fileName?.trim() || `lumo-original-${Date.now()}-${index}.${extension}`;
      const storagePath = `${userId}/official/${productId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error(`Rasmni o‘qib bo‘lmadi: ${fileName}`);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from(OFFICIAL_BUCKET)
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;

      uploadedPaths.push(storagePath);
      insertedRows.push({
        product_id: productId,
        storage_path: storagePath,
        mime_type: mimeType,
        file_name: fileName,
        alt_text: fileName.slice(0, 180),
        sort_order: index,
      });
    }

    if (insertedRows.length) {
      const { error } = await db.from("lumo_official_product_media").insert(insertedRows);
      if (error) throw error;
      insertedStoragePaths.push(...uploadedPaths);
    }

    if (removedMedia.length) {
      const ids = removedMedia.map((item) => item.id);
      const { error: deleteRowsError } = await db
        .from("lumo_official_product_media")
        .delete()
        .in("id", ids);
      if (deleteRowsError) throw deleteRowsError;

      // A failed object cleanup must not restore deleted metadata or invalidate newly saved images.
      const paths = removedMedia.map((item) => item.storage_path);
      await supabase.storage.from(OFFICIAL_BUCKET).remove(paths);
    }
  } catch (error) {
    if (insertedStoragePaths.length) {
      await db
        .from("lumo_official_product_media")
        .delete()
        .in("storage_path", insertedStoragePaths);
    }
    if (uploadedPaths.length) {
      await supabase.storage.from(OFFICIAL_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}

export async function updateOfficialStore(
  userId: string,
  values: {
    description?: string;
    contact_text?: string;
    city?: string | null;
    region?: string | null;
    is_published?: boolean;
  },
): Promise<void> {
  const payload = {
    ...values,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db
    .from("lumo_official_store")
    .update(payload)
    .eq("id", 1);
  if (error) throw error;
}

export async function archiveOfficialProduct(productId: string, userId: string): Promise<void> {
  const { error } = await db
    .from("lumo_official_products")
    .update({ status: "archived", updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw error;
}
