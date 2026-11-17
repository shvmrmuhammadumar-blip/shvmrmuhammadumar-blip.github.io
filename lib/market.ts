import { supabase } from "./supabase";

const db = supabase as any;

export const MARKET_MEDIA_BUCKET = "market-media";
export const MARKET_IMAGE_LIMIT = 8;
export const MARKET_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export type MarketKind = "product" | "service";

export type MarketImageAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number | null;
};

export type MarketProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type MarketListing = {
  id: string;
  seller_id: string;
  store_id: string | null;
  kind: MarketKind;
  title: string;
  description: string;
  category: string;
  price: number | null;
  currency: "UZS" | "USD";
  is_negotiable: boolean;
  condition: "new" | "used" | "refurbished" | "not_applicable";
  country: string;
  region: string | null;
  city: string | null;
  status: "draft" | "active" | "sold" | "archived" | "removed";
  created_at: string;
  updated_at: string;
  images: string[];
  seller: MarketProfile | null;
};

export type MarketStore = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  avatar_url: string | null;
  cover_url: string | null;
  country: string;
  region: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  owner: MarketProfile | null;
};

type ListOptions = {
  kind?: MarketKind | "all";
  ownerId?: string;
  listingIds?: string[];
  storeId?: string;
  limit?: number;
};

function publicMediaUrl(path: string): string {
  return supabase.storage
    .from(MARKET_MEDIA_BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;

  const marker = `/object/public/${MARKET_MEDIA_BUCKET}/`;
  const index = url.indexOf(marker);

  if (index < 0) return null;

  return decodeURIComponent(url.slice(index + marker.length));
}

function cleanFileName(value: string): string {
  return (
    value
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 100) || "market-image.jpg"
  );
}

function validateImage(image: MarketImageAsset) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(image.mimeType)) {
    throw new Error("Faqat JPG, PNG va WebP rasmlarini yuklash mumkin.");
  }

  if (
    typeof image.fileSize === "number" &&
    image.fileSize > MARKET_IMAGE_MAX_BYTES
  ) {
    throw new Error("Har bir rasm 10 MB dan kichik bo‘lishi kerak.");
  }
}

function getImageExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function uploadMarketImage(
  ownerId: string,
  folder: string,
  image: MarketImageAsset,
): Promise<{ path: string; url: string }> {
  validateImage(image);

  const response = await fetch(image.uri);

  if (!response.ok) {
    throw new Error("Tanlangan rasmni o‘qib bo‘lmadi.");
  }

  const bytes = await response.arrayBuffer();

  if (bytes.byteLength <= 0 || bytes.byteLength > MARKET_IMAGE_MAX_BYTES) {
    throw new Error("Rasm bo‘sh yoki 10 MB limitdan katta.");
  }

  const extension = getImageExtension(image.mimeType);
  const fileName = cleanFileName(image.fileName || `image.${extension}`);
  const path = [
    ownerId,
    folder,
    `${Date.now()}-${fileName}`,
  ].join("/");

  const { error } = await supabase.storage
    .from(MARKET_MEDIA_BUCKET)
    .upload(path, bytes, {
      contentType: image.mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  return {
    path,
    url: publicMediaUrl(path),
  };
}

async function removeMarketImages(paths: string[]) {
  if (!paths.length) return;

  const { error } = await supabase.storage
    .from(MARKET_MEDIA_BUCKET)
    .remove(paths);

  if (error) throw error;
}

async function loadProfiles(
  userIds: string[],
): Promise<Map<string, MarketProfile>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return new Map();

  const { data, error } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", ids);

  if (error) throw error;

  return new Map(
    (data ?? []).map((profile: MarketProfile) => [profile.id, profile]),
  );
}

export async function getMarketListings(
  options: ListOptions = {},
): Promise<MarketListing[]> {
  let query = db
    .from("market_listings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.ownerId) {
    query = query.eq("seller_id", options.ownerId);
  } else {
    query = query.eq("status", "active");
  }

  if (options.kind && options.kind !== "all") {
    query = query.eq("kind", options.kind);
  }

  if (options.storeId) {
    query = query.eq("store_id", options.storeId);
  }

  if (options.listingIds) {
    if (!options.listingIds.length) return [];
    query = query.in("id", options.listingIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Omit<
    MarketListing,
    "images" | "seller"
  >[];

  if (!rows.length) return [];

  const ids = rows.map((item) => item.id);
  const sellerIds = rows.map((item) => item.seller_id);

  const [mediaResult, profiles] = await Promise.all([
    db
      .from("market_listing_media")
      .select("id, listing_id, storage_path, sort_order")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true }),
    loadProfiles(sellerIds),
  ]);

  if (mediaResult.error) throw mediaResult.error;

  const mediaMap = new Map<string, string[]>();

  for (const media of mediaResult.data ?? []) {
    const current = mediaMap.get(media.listing_id) ?? [];
    current.push(publicMediaUrl(media.storage_path));
    mediaMap.set(media.listing_id, current);
  }

  return rows.map((item) => ({
    ...item,
    images: mediaMap.get(item.id) ?? [],
    seller: profiles.get(item.seller_id) ?? null,
  }));
}

export async function getMarketListing(
  listingId: string,
): Promise<MarketListing> {
  const { data, error } = await db
    .from("market_listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("E’lon topilmadi yoki o‘chirib yuborilgan.");

  const [mediaResult, profiles] = await Promise.all([
    db
      .from("market_listing_media")
      .select("storage_path, sort_order")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true }),
    loadProfiles([data.seller_id]),
  ]);

  if (mediaResult.error) throw mediaResult.error;

  return {
    ...data,
    images: (mediaResult.data ?? []).map(
      (item: { storage_path: string }) => publicMediaUrl(item.storage_path),
    ),
    seller: profiles.get(data.seller_id) ?? null,
  };
}

export async function getMarketStores(options: {
  ownerId?: string;
  limit?: number;
} = {}): Promise<MarketStore[]> {
  let query = db
    .from("market_stores")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.ownerId) {
    query = query.eq("owner_id", options.ownerId);
  } else {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Omit<MarketStore, "owner">[];
  if (!rows.length) return [];

  const profiles = await loadProfiles(rows.map((item) => item.owner_id));

  return rows.map((item) => ({
    ...item,
    owner: profiles.get(item.owner_id) ?? null,
  }));
}

export async function getMarketStoreBySlug(
  slug: string,
): Promise<MarketStore> {
  const { data, error } = await db
    .from("market_stores")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Do‘kon topilmadi.");

  const profiles = await loadProfiles([data.owner_id]);

  return {
    ...data,
    owner: profiles.get(data.owner_id) ?? null,
  };
}

export async function getMarketStoreById(
  storeId: string,
): Promise<MarketStore> {
  const { data, error } = await db
    .from("market_stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Do‘kon topilmadi.");

  const profiles = await loadProfiles([data.owner_id]);

  return {
    ...data,
    owner: profiles.get(data.owner_id) ?? null,
  };
}

export async function getMarketStoreListings(
  storeId: string,
  ownerId?: string,
): Promise<MarketListing[]> {
  return getMarketListings({
    storeId,
    ownerId,
    limit: 100,
  });
}

export async function getMarketFavoriteIds(
  userId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("market_favorites")
    .select("listing_id")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []).map(
    (item: { listing_id: string }) => item.listing_id,
  );
}

export async function toggleMarketFavorite(
  userId: string,
  listingId: string,
  currentlySaved: boolean,
): Promise<void> {
  if (currentlySaved) {
    const { error } = await db
      .from("market_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);

    if (error) throw error;
    return;
  }

  const { error } = await db.from("market_favorites").insert({
    user_id: userId,
    listing_id: listingId,
  });

  if (error) throw error;
}

export type CreateListingInput = {
  sellerId: string;
  storeId?: string | null;
  kind: MarketKind;
  title: string;
  description: string;
  category: string;
  price: number | null;
  currency: "UZS" | "USD";
  isNegotiable: boolean;
  condition: "new" | "used" | "refurbished" | "not_applicable";
  region: string;
  city: string;
  images: MarketImageAsset[];
};

export async function createMarketListing(
  input: CreateListingInput,
): Promise<string> {
  const title = input.title.trim();
  const description = input.description.trim();
  const category = input.category.trim();

  if (title.length < 5 || title.length > 120) {
    throw new Error("Sarlavha 5–120 ta belgi bo‘lishi kerak.");
  }

  if (!category || category.length > 60) {
    throw new Error("Kategoriyani tanlang.");
  }

  if (description.length > 5000) {
    throw new Error("Tavsif 5000 belgidan oshmasligi kerak.");
  }

  if (input.images.length > MARKET_IMAGE_LIMIT) {
    throw new Error("Bir e’longa ko‘pi bilan 8 ta rasm qo‘shish mumkin.");
  }

  input.images.forEach(validateImage);

  const { data: listing, error: listingError } = await db
    .from("market_listings")
    .insert({
      seller_id: input.sellerId,
      store_id: input.storeId || null,
      kind: input.kind,
      title,
      description,
      category,
      price: input.price,
      currency: input.currency,
      is_negotiable: input.isNegotiable,
      condition: input.kind === "product" ? input.condition : "not_applicable",
      country: "Uzbekistan",
      region: input.region.trim() || null,
      city: input.city.trim() || null,
      status: "active",
    })
    .select("id")
    .single();

  if (listingError) throw listingError;

  const uploadedPaths: string[] = [];

  try {
    for (let index = 0; index < input.images.length; index += 1) {
      const image = input.images[index];
      const extension = getImageExtension(image.mimeType);

      const uploaded = await uploadMarketImage(
        input.sellerId,
        `listings/${listing.id}`,
        image,
      );

      uploadedPaths.push(uploaded.path);

      const { error: mediaError } = await db
        .from("market_listing_media")
        .insert({
          listing_id: listing.id,
          storage_path: uploaded.path,
          mime_type: image.mimeType,
          file_name: image.fileName || `${listing.id}-${index}.${extension}`,
          sort_order: index,
        });

      if (mediaError) throw mediaError;
    }

    return listing.id as string;
  } catch (error) {
    try {
      await removeMarketImages(uploadedPaths);
    } catch {
      // Preserve the original upload/database error.
    }

    await db.from("market_listings").delete().eq("id", listing.id);

    throw error;
  }
}

export type CreateMarketStoreInput = {
  ownerId: string;
  name: string;
  description: string;
  region: string;
  city: string;
  avatar?: MarketImageAsset | null;
  cover?: MarketImageAsset | null;
};

function makeStoreSlug(name: string, ownerId: string): string {
  const baseSlug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 38) || "store";

  return `${baseSlug}-${ownerId.slice(0, 6)}-${Date.now().toString().slice(-5)}`;
}

export async function createMarketStore(
  input: CreateMarketStoreInput,
): Promise<string> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length < 2 || name.length > 80) {
    throw new Error("Do‘kon nomi 2–80 ta belgi bo‘lishi kerak.");
  }

  if (description.length > 2000) {
    throw new Error("Tavsif 2000 belgidan oshmasligi kerak.");
  }

  if (input.avatar) validateImage(input.avatar);
  if (input.cover) validateImage(input.cover);

  const { data, error } = await db
    .from("market_stores")
    .insert({
      owner_id: input.ownerId,
      name,
      slug: makeStoreSlug(name, input.ownerId),
      description,
      country: "Uzbekistan",
      region: input.region.trim() || null,
      city: input.city.trim() || null,
    })
    .select("id")
    .single();

  if (error) throw error;

  const uploadedPaths: string[] = [];

  try {
    const updates: Record<string, string | null> = {};

    if (input.avatar) {
      const uploaded = await uploadMarketImage(
        input.ownerId,
        `stores/${data.id}/avatar`,
        input.avatar,
      );
      uploadedPaths.push(uploaded.path);
      updates.avatar_url = uploaded.url;
    }

    if (input.cover) {
      const uploaded = await uploadMarketImage(
        input.ownerId,
        `stores/${data.id}/cover`,
        input.cover,
      );
      uploadedPaths.push(uploaded.path);
      updates.cover_url = uploaded.url;
    }

    if (Object.keys(updates).length) {
      const { error: updateError } = await db
        .from("market_stores")
        .update(updates)
        .eq("id", data.id)
        .eq("owner_id", input.ownerId);

      if (updateError) throw updateError;
    }

    return data.id as string;
  } catch (error) {
    try {
      await removeMarketImages(uploadedPaths);
    } catch {
      // Preserve the original create error.
    }

    await db
      .from("market_stores")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", input.ownerId);

    throw error;
  }
}

export type UpdateMarketStoreInput = {
  storeId: string;
  ownerId: string;
  name: string;
  description: string;
  region: string;
  city: string;
  avatar?: MarketImageAsset | null;
  cover?: MarketImageAsset | null;
};

export async function updateMarketStore(
  input: UpdateMarketStoreInput,
): Promise<void> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length < 2 || name.length > 80) {
    throw new Error("Do‘kon nomi 2–80 ta belgi bo‘lishi kerak.");
  }

  if (description.length > 2000) {
    throw new Error("Tavsif 2000 belgidan oshmasligi kerak.");
  }

  if (input.avatar) validateImage(input.avatar);
  if (input.cover) validateImage(input.cover);

  const { data: current, error: currentError } = await db
    .from("market_stores")
    .select("avatar_url, cover_url")
    .eq("id", input.storeId)
    .eq("owner_id", input.ownerId)
    .single();

  if (currentError) throw currentError;

  const uploadedPaths: string[] = [];
  const update: Record<string, string | null> = {
    name,
    description,
    region: input.region.trim() || null,
    city: input.city.trim() || null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (input.avatar !== undefined) {
      if (input.avatar) {
        const uploaded = await uploadMarketImage(
          input.ownerId,
          `stores/${input.storeId}/avatar`,
          input.avatar,
        );
        uploadedPaths.push(uploaded.path);
        update.avatar_url = uploaded.url;
      } else {
        update.avatar_url = null;
      }
    }

    if (input.cover !== undefined) {
      if (input.cover) {
        const uploaded = await uploadMarketImage(
          input.ownerId,
          `stores/${input.storeId}/cover`,
          input.cover,
        );
        uploadedPaths.push(uploaded.path);
        update.cover_url = uploaded.url;
      } else {
        update.cover_url = null;
      }
    }

    const { error } = await db
      .from("market_stores")
      .update(update)
      .eq("id", input.storeId)
      .eq("owner_id", input.ownerId);

    if (error) throw error;
  } catch (error) {
    try {
      await removeMarketImages(uploadedPaths);
    } catch {
      // Preserve the original update error.
    }

    throw error;
  }

  const oldPaths: string[] = [];

  if (input.avatar !== undefined && current.avatar_url) {
    const path = storagePathFromUrl(current.avatar_url);
    if (path) oldPaths.push(path);
  }

  if (input.cover !== undefined && current.cover_url) {
    const path = storagePathFromUrl(current.cover_url);
    if (path) oldPaths.push(path);
  }

  if (oldPaths.length) {
    try {
      await removeMarketImages(oldPaths);
    } catch {
      // The store update is already saved; an old asset can be cleaned later.
    }
  }
}

export async function reportMarketListing(input: {
  listingId: string;
  reporterId: string;
  reason: "spam" | "fraud" | "prohibited_item" | "misleading" | "other";
  details: string;
}): Promise<void> {
  const { error } = await db.from("market_reports").insert({
    listing_id: input.listingId,
    reporter_id: input.reporterId,
    reason: input.reason,
    details: input.details.trim(),
  });

  if (error) throw error;
}

export async function setMarketListingStatus(
  listingId: string,
  sellerId: string,
  status: "active" | "sold" | "archived",
): Promise<void> {
  const { error } = await db
    .from("market_listings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("seller_id", sellerId);

  if (error) throw error;
}

export async function deleteMarketListing(
  listingId: string,
  sellerId: string,
): Promise<void> {
  const { data: media, error: mediaError } = await db
    .from("market_listing_media")
    .select("storage_path")
    .eq("listing_id", listingId);

  if (mediaError) throw mediaError;

  const paths = (media ?? []).map(
    (item: { storage_path: string }) => item.storage_path,
  );

  if (paths.length) {
    await removeMarketImages(paths);
  }

  const { error } = await db
    .from("market_listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", sellerId);

  if (error) throw error;
}
