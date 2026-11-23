import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function env(name: string, fallback = "") {
  return (Deno.env.get(name) ?? fallback).trim();
}
function envObjectKey(name: string, keyName: string) {
  try { return String(JSON.parse(env(name, "{}"))[keyName] ?? ""); }
  catch { return ""; }
}
function publishableKey() {
  return env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") ||
    envObjectKey("SUPABASE_PUBLISHABLE_KEYS", "default");
}
function serviceKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") ||
    envObjectKey("SUPABASE_SECRET_KEYS", "default");
}
async function sha1(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required." }, 401);
    const url = env("SUPABASE_URL");
    const anon = publishableKey();
    const secret = serviceKey();
    if (!url || !anon || !secret) return json({ error: "Payment service is not configured." }, 503);
    const userClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Your session is not valid." }, 401);

    const body = await req.json().catch(() => null);
    const productType = body?.product_type;
    const provider = body?.provider;
    const giftId = typeof body?.gift_id === "string" ? body.gift_id : null;
    const key = typeof body?.idempotency_key === "string" ? body.idempotency_key : "";
    if (!["lumo_plus", "gift"].includes(productType) ||
        !["payme", "click"].includes(provider) ||
        key.length < 12 || key.length > 128 ||
        (productType === "gift" && !giftId) ||
        (productType === "lumo_plus" && giftId)) {
      return json({ error: "Invalid payment request." }, 400);
    }

    if (provider === "click" && (
      env("CLICK_TEST_MODE") !== "true" ||
      !env("CLICK_TEST_SERVICE_ID") ||
      !env("CLICK_TEST_MERCHANT_ID") ||
      !env("CLICK_TEST_SECRET_KEY")
    )) {
      return json({ error: "Click Sandbox credentials are not configured yet.", code: "CLICK_TEST_CREDENTIALS_MISSING" }, 503);
    }

    const merchantId = Number(env("PAYME_TEST_MERCHANT_ID", "1549901"));
    const paymeSecret = env("PAYME_TEST_SECRET_KEY", "test");
    if (provider === "payme" && (!Number.isInteger(merchantId) || !paymeSecret)) {
      return json({ error: "Payme Sandbox configuration is incomplete." }, 503);
    }

    const { data: created, error: createError } = await userClient.rpc(
      "create_developer_payment_order",
      { p_product_type: productType, p_provider: provider, p_idempotency_key: key, p_gift_id: giftId },
    );
    if (createError) {
      const denied = createError.code === "42501" || /Developer accounts/i.test(createError.message);
      return json({ error: denied ? "Only Developer accounts can use this test checkout." : createError.message }, denied ? 403 : 400);
    }
    const orderId = String(created?.id ?? "");
    if (!orderId) return json({ error: "Payment order could not be created." }, 500);
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin
      .from("developer_payment_orders")
      .select("id, user_id, product_type, provider, status, amount_usd, amount_uzs, payme_amount, click_prepare_id, provider_payment_id, checkout_url")
      .eq("id", orderId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (orderError || !order) return json({ error: "Payment order could not be loaded." }, 500);
    if (order.status !== "pending") return json({ error: "This payment order has already been processed." }, 409);
    if (order.checkout_url) {
      return json({ success: true, test_mode: true, order_id: order.id, provider,
        checkout_url: order.checkout_url, amount_usd: 0.10, amount_uzs: 1200 });
    }

    const callbackBase = `${url.replace(/\/$/, "")}/functions/v1/developer-payment-webhook`;
    const returnUrl = env("LUMO_PAYMENT_RETURN_URL", "lumo://wallet?section=premium");
    let checkoutUrl = "";
    let providerPaymentId: string | null = null;

    if (provider === "payme") {
      const description = productType === "lumo_plus"
        ? "LUMO Plus 30 days - Developer test"
        : "LUMO Gift - Developer test";
      const callbackUrl = `${callbackBase}/payme`;
      const amount = Number(order.payme_amount);
      const requestParams: Record<string, string | number> = {
        order_id: order.id,
        currency: "UZS",
        merchant_id: merchantId,
        order_desc: description,
        amount,
        server_callback_url: callbackUrl,
      };
      const orderedKeys = Object.keys(requestParams).sort();
      const signatureValues = orderedKeys
        .filter((key) => requestParams[key] !== "")
        .map((key) => String(requestParams[key]));
      const signature = await sha1(`${paymeSecret}|${signatureValues.join("|")}`);
      const response = await fetch("https://pay.flitt.com/api/checkout/url/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "FlittPay-nodejs-sdk",
        },
        body: JSON.stringify({ request: { ...requestParams, signature } }),
      });
      const payload = await response.json().catch(() => null);
      const result = payload?.response;
      if (!response.ok || result?.response_status !== "success" ||
          typeof result?.checkout_url !== "string") {
        await admin.from("developer_payment_orders")
          .update({ status: "failed", failure_code: String(result?.error_code ?? "PAYME_CREATE_FAILED"), updated_at: new Date().toISOString() })
          .eq("id", order.id).eq("status", "pending");
        return json({
          error: String(result?.error_message ?? "Payme could not create the test checkout."),
          code: "PAYME_CREATE_FAILED",
          provider_error_code: result?.error_code ?? null,
        }, 502);
      }
      const parsed = new URL(result.checkout_url);
      if (parsed.hostname !== "pay.flitt.com") {
        return json({ error: "Payme returned an unexpected checkout host." }, 502);
      }
      checkoutUrl = parsed.toString();
      providerPaymentId = result.payment_id == null ? null : String(result.payment_id);
    } else {
      const clickUrl = new URL("https://my.click.uz/services/pay");
      clickUrl.searchParams.set("service_id", env("CLICK_TEST_SERVICE_ID"));
      clickUrl.searchParams.set("merchant_id", env("CLICK_TEST_MERCHANT_ID"));
      clickUrl.searchParams.set("amount", "1200.00");
      clickUrl.searchParams.set("transaction_param", order.id);
      clickUrl.searchParams.set("return_url", returnUrl);
      checkoutUrl = clickUrl.toString();
    }

    const { error: updateError } = await admin
      .from("developer_payment_orders")
      .update({
        checkout_url: checkoutUrl,
        provider_payment_id: providerPaymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending");
    if (updateError) return json({ error: "Checkout link could not be saved. Retry this same order." }, 500);

    return json({
      success: true, test_mode: true, order_id: order.id, provider,
      checkout_url: checkoutUrl, amount_usd: 0.10, amount_uzs: 1200,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected payment error." }, 500);
  }
});
