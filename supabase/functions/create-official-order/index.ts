import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseServerKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default || Object.values(parsed)[0] || "";
  } catch {
    return "";
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[char] ?? char));
}

function keyboard() {
  return {
    keyboard: [
      [{ text: "NEW ORDERS" }, { text: "ORDERS" }],
      [{ text: "DELETE ORDER" }],
    ],
    is_persistent: true,
    resize_keyboard: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serverKey = getSupabaseServerKey();
  if (!supabaseUrl || !serverKey) return json({ error: "Server configuration is incomplete." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to place an order." }, 401);

  const admin = createClient(supabaseUrl, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const productId = String(body.productId ?? "");
  const variantId = body.variantId ? String(body.variantId) : null;
  const quantity = Number(body.quantity);
  const customerName = String(body.customerName ?? "").trim();
  const customerPhone = String(body.customerPhone ?? "").trim();
  const customerAddress = String(body.customerAddress ?? "").trim();
  const customerNote = String(body.customerNote ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(productId)) return json({ error: "Invalid product." }, 400);
  if (variantId && !/^[0-9a-f-]{36}$/i.test(variantId)) return json({ error: "Invalid product option." }, 400);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return json({ error: "Quantity must be between 1 and 99." }, 400);
  if (customerName.length < 2 || customerName.length > 120) return json({ error: "Enter your full name." }, 400);
  if (customerPhone.replace(/\D/g, "").length < 7 || customerPhone.length > 32) return json({ error: "Enter a valid phone number." }, 400);
  if (customerAddress.length > 500 || customerNote.length > 1000) return json({ error: "Address or note is too long." }, 400);

  const { data: product, error: productError } = await admin
    .from("lumo_official_products")
    .select("id, store_id, name, sku, status, price, currency")
    .eq("id", productId)
    .eq("status", "active")
    .maybeSingle();
  if (productError) return json({ error: "Could not verify this product." }, 500);
  if (!product) return json({ error: "This product is no longer available." }, 404);

  const { data: store, error: storeError } = await admin
    .from("lumo_official_store")
    .select("id, is_published")
    .eq("id", product.store_id)
    .maybeSingle();
  if (storeError || !store) return json({ error: "Store information is unavailable." }, 500);

  const { data: roleRows } = await admin
    .from("platform_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  const isManager = (roleRows ?? []).some((row: { role: string }) => row.role === "owner" || row.role === "developer" || row.role === "admin");
  if (!store.is_published && !isManager) return json({ error: "The official store is not accepting public orders yet." }, 409);

  let variant: Record<string, unknown> | null = null;
  if (variantId) {
    const { data, error } = await admin
      .from("lumo_official_product_variants")
      .select("id, name, color, size, price_override, stock_quantity, is_active")
      .eq("id", variantId)
      .eq("product_id", product.id)
      .maybeSingle();
    if (error) return json({ error: "Could not verify the selected option." }, 500);
    if (!data || !data.is_active) return json({ error: "This product option is no longer available." }, 409);
    if (Number(data.stock_quantity) > 0 && Number(data.stock_quantity) < quantity) {
      return json({ error: "There is not enough stock for this quantity." }, 409);
    }
    variant = data as Record<string, unknown>;
  }

  const unitPrice = Number(variant?.price_override ?? product.price);
  const subtotal = Math.round(unitPrice * quantity * 100) / 100;
  const variantName = variant
    ? [variant.name, variant.color, variant.size].filter(Boolean).join(" · ")
    : null;

  const { data: order, error: insertError } = await admin
    .from("lumo_official_orders")
    .insert({
      store_id: product.store_id,
      product_id: product.id,
      variant_id: variant?.id ?? null,
      product_name: product.name,
      product_sku: product.sku,
      variant_name: variantName,
      unit_price: unitPrice,
      currency: product.currency,
      quantity,
      subtotal,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress || null,
      customer_note: customerNote || null,
      created_by: authData.user.id,
      status: "new",
      notification_status: "pending",
      notification_error: null,
      telegram_message_id: null,
    })
    .select("id, created_at")
    .single();
  if (insertError || !order) return json({ error: "Could not save your order. Please try again." }, 500);

  return json({
    success: true,
    orderId: order.id,
    notificationStatus: "pending",
    message: "Order saved. Open NEW ORDERS in Telegram to view it.",
  }, 201);
});