import { supabase } from "./supabase";

const db = supabase as any;

export type OfficialOrderStatus = "new" | "processing" | "completed";

export type OfficialOrder = {
  id: number;
  store_id: number;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  product_sku: string | null;
  variant_name: string | null;
  unit_price: number;
  currency: "USD" | "UZS";
  quantity: number;
  subtotal: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  customer_note: string | null;
  status: OfficialOrderStatus;
  notification_status: "pending" | "sent" | "failed" | "not_configured";
  notification_error: string | null;
  telegram_message_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateOfficialOrderInput = {
  productId: string;
  variantId: string | null;
  quantity: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNote: string;
};

export async function createOfficialOrder(input: CreateOfficialOrderInput) {
  const { data, error } = await supabase.functions.invoke("create-official-order", {
    body: input,
  });
  if (error) {
    const context = (error as any)?.context;
    let message = error.message || "Could not create the order.";
    try {
      if (context && typeof context.json === "function") {
        const body = await context.json();
        if (body?.error) message = String(body.error);
      }
    } catch {
      // Keep the original function error when no response body is available.
    }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(data?.error || "Could not create the order.");
  return data as { success: true; orderId: number; notificationStatus: string; message: string };
}

export async function setupOfficialTelegramBot(): Promise<{ botUsername: string | null }> {
  const { data, error } = await supabase.functions.invoke("setup-lumo-telegram-bot", {
    body: {},
  });
  if (error) {
    let message = error.message || "Could not set up the Telegram bot.";
    try {
      const context = (error as any)?.context;
      if (context && typeof context.json === "function") {
        const body = await context.json();
        if (body?.error) message = String(body.error);
      }
    } catch {
      // Keep the original function error when no response body is available.
    }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(data?.error || "Could not set up the Telegram bot.");
  return data as { botUsername: string | null };
}

export async function testOfficialTelegram(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("test-telegram-notification", {
    body: {},
  });
  if (error) {
    let message = error.message || "Telegram test failed.";
    try {
      const context = (error as any)?.context;
      if (context && typeof context.json === "function") {
        const body = await context.json();
        if (body?.error) message = String(body.error);
      }
    } catch {
      // Keep the original function error if no response body is available.
    }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(data?.error || "Telegram test failed.");
}

export async function getOfficialOrders(options: { createdBy?: string } = {}): Promise<OfficialOrder[]> {
  let query = db
    .from("lumo_official_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (options.createdBy) query = query.eq("created_by", options.createdBy);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OfficialOrder[];
}

export async function updateOfficialOrderStatus(
  orderId: number,
  status: OfficialOrderStatus,
): Promise<void> {
  const { error } = await db
    .from("lumo_official_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;
}

export async function deleteOfficialOrder(orderId: number): Promise<void> {
  const { error } = await db
    .from("lumo_official_orders")
    .delete()
    .eq("id", orderId);
  if (error) throw error;
}
