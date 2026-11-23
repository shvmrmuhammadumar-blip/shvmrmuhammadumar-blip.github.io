import { supabase } from './supabase';

const giftsDb = supabase as any;

export type GiftRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type GiftCatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coin_price: number;
  rarity: GiftRarity;
  asset_path: string;
  preview_path: string | null;
  preview_url: string | null;
  model_url: string | null;
  collection_id: string | null;
  sort_order: number;
};

export type GiftInventoryItem = {
  id: string;
  created_at: string;
  gift: GiftCatalogItem | null;
};

export type GiftTransferResult = {
  transfer_id: string;
  inventory_id: string;
};

function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('gift-assets').getPublicUrl(path);
  return data.publicUrl || null;
}

export async function getMyCoinBalance(): Promise<number> {
  const { data, error } = await giftsDb.rpc('get_my_coin_balance');
  if (error) throw error;

  const value = Number(data ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function getGiftCatalog(): Promise<GiftCatalogItem[]> {
  const { data, error } = await giftsDb
    .from('gift_catalog')
    .select('id, slug, title, description, coin_price, rarity, asset_path, preview_path, collection_id, sort_order')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((item: Omit<GiftCatalogItem, 'preview_url'>) => ({
    ...item,
    coin_price: Number(item.coin_price),
    preview_url: getAssetUrl(item.preview_path),
    model_url: getAssetUrl(item.asset_path),
  }));
}

export async function getMyGiftInventory(): Promise<GiftInventoryItem[]> {
  const { data, error } = await giftsDb
    .from('gift_inventory')
    .select(
      'id, created_at, gift:gift_catalog!gift_inventory_gift_id_fkey(id, slug, title, description, coin_price, rarity, asset_path, preview_path, collection_id, sort_order)',
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((item: any) => {
    const gift = Array.isArray(item.gift) ? item.gift[0] : item.gift;
    return {
      id: item.id,
      created_at: item.created_at,
      gift: gift
        ? {
            ...gift,
            coin_price: Number(gift.coin_price),
            preview_url: getAssetUrl(gift.preview_path),
            model_url: getAssetUrl(gift.asset_path),
          }
        : null,
    };
  });
}

export async function purchaseGift(
  giftId: string,
  idempotencyKey: string,
): Promise<{ inventory_id: string; coin_balance: number; transaction_id: string }> {
  const { data, error } = await giftsDb.rpc('purchase_gift', {
    p_gift_id: giftId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.inventory_id || !row?.transaction_id) {
    throw new Error('The purchase response was incomplete.');
  }

  return {
    inventory_id: String(row.inventory_id),
    coin_balance: Number(row.coin_balance ?? 0),
    transaction_id: String(row.transaction_id),
  };
}

export async function findGiftRecipient(username: string): Promise<{
  id: string;
  username: string;
  full_name: string | null;
}> {
  const term = username.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{2,30}$/.test(term)) {
    throw new Error('Enter a valid LUMO username.');
  }

  const { data, error } = await giftsDb
    .from('profiles')
    .select('id, username, full_name')
    .ilike('username', term)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error('LUMO member not found.');
  return data;
}

export async function transferGift(
  inventoryId: string,
  receiverId: string,
  idempotencyKey: string,
  message = '',
): Promise<GiftTransferResult> {
  const { data, error } = await giftsDb.rpc('transfer_gift', {
    p_inventory_id: inventoryId,
    p_receiver_id: receiverId,
    p_idempotency_key: idempotencyKey,
    p_message: message.trim().slice(0, 240),
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.transfer_id || !row?.inventory_id) {
    throw new Error('The gift transfer response was incomplete.');
  }

  return {
    transfer_id: String(row.transfer_id),
    inventory_id: String(row.inventory_id),
  };
}

export function createGiftRequestKey(): string {
  return `gift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function formatCoinAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
