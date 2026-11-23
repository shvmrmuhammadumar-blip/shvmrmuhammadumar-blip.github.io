import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function env(name: string, fallback = "") {
  return (Deno.env.get(name) ?? fallback).trim();
}
function secretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  try { return String(JSON.parse(env("SUPABASE_SECRET_KEYS", "{}")).default ?? ""); }
  catch { return ""; }
}
function same(left: string, right: string) {
  if (left.length !== right.length) return false;
  let value = 0;
  for (let i = 0; i < left.length; i++) value |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return value === 0;
}
async function sha1(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function md5(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}
async function verifyPayme(body: Record<string, unknown>, secret: string) {
  const received = String(body.signature ?? "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(received)) return false;
  const values = Object.entries(body)
    .filter(([key]) => key !== "signature" && key !== "response_signature_string")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([, value]) => value === null || value === undefined ? "" : String(value))
    .filter((value) => value !== "");
  const material = [secret, ...values].join("|");
  return same(await sha1(material), received);
}
function verifyClick(data: Record<string, string>, secret: string) {
  const action = String(data.action ?? "");
  const fields = [
    data.click_trans_id ?? "",
    data.service_id ?? "",
    secret,
    data.merchant_trans_id ?? "",
  ];
  if (action === "1") fields.push(data.merchant_prepare_id ?? "");
  fields.push(data.amount ?? "", action, data.sign_time ?? "");
  const expected = md5(fields.join(""));
  return /^[a-f0-9]{32}$/i.test(data.sign_string ?? "") &&
    same(expected.toLowerCase(), (data.sign_string ?? "").toLowerCase());
}
function clickAmountMatches(value: string, amount: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed.toFixed(2) === amount.toFixed(2);
}

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname.toLowerCase();
  const provider = path.endsWith("/payme") ? "payme" : path.endsWith("/click") ? "click" : "";
  if (req.method !== "POST" || !provider) return json({ error: "Not found." }, 404);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKeyValue = secretKey();
  if (!supabaseUrl || !serviceKeyValue) return json({ error: "Webhook service is not configured." }, 503);
  const admin = createClient(supabaseUrl, serviceKeyValue, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (provider === "payme") {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: "Invalid Payme callback." }, 400);
      const secret = env("PAYME_TEST_SECRET_KEY", "test");
      const merchantId = Number(env("PAYME_TEST_MERCHANT_ID", "1549901"));
      if (!await verifyPayme(body, secret)) return json({ error: "Invalid Payme signature." }, 401);
      if (Number(body.merchant_id) !== merchantId || String(body.currency) !== "UZS") {
        return json({ error: "Payme merchant or currency mismatch." }, 400);
      }
      const orderId = String(body.order_id ?? "");
      const amount = Number(body.amount);
      if (!orderId || !Number.isSafeInteger(amount) || amount !== 120000) {
        return json({ error: "Payme order or amount mismatch." }, 400);
      }
      const { data: order, error } = await admin
        .from("developer_payment_orders")
        .select("id, provider, payme_amount")
        .eq("id", orderId)
        .eq("environment", "test")
        .maybeSingle();
      if (error || !order) return json({ error: "Payment order not found." }, 404);
      if (order.provider !== "payme" || Number(order.payme_amount) !== amount) {
        return json({ error: "Payment does not match this order." }, 400);
      }
      const approved = String(body.order_status ?? "").toLowerCase() === "approved" &&
        String(body.response_status ?? "").toLowerCase() === "success";
      const { data: finalized, error: finalizeError } = await admin.rpc(
        "finalize_developer_payment_order",
        {
          p_order_id: order.id,
          p_provider: "payme",
          p_provider_transaction_id: body.payment_id == null ? null : String(body.payment_id),
          p_result: approved ? "paid" : "failed",
          p_failure_code: approved ? null : String(body.response_code ?? body.order_status ?? "PAYME_NOT_APPROVED"),
        },
      );
      if (finalizeError) return json({ error: "Could not finalize Payme payment." }, 500);
      return json({ success: true, result: finalized?.status ?? (approved ? "paid" : "failed") });
    }

    const form = await req.text();
    const params = new URLSearchParams(form);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });
    const secret = env("CLICK_TEST_SECRET_KEY");
    const serviceId = env("CLICK_TEST_SERVICE_ID");
    if (env("CLICK_TEST_MODE") !== "true" || !secret || !serviceId) {
      return json({ click_trans_id: data.click_trans_id ?? "", merchant_trans_id: data.merchant_trans_id ?? "",
        error: -1, error_note: "CLICK TEST SERVICE NOT CONFIGURED" }, 503);
    }

    const action = String(data.action ?? "");
    if (!["0", "1"].includes(action)) {
      return json({ click_trans_id: data.click_trans_id ?? "", merchant_trans_id: data.merchant_trans_id ?? "",
        error: -3, error_note: "Invalid action" }, 400);
    }
    if (data.service_id !== serviceId || !verifyClick(data, secret)) {
      return json({ click_trans_id: data.click_trans_id ?? "", merchant_trans_id: data.merchant_trans_id ?? "",
        error: -1, error_note: "SIGN CHECK FAILED" });
    }

    const { data: order, error: orderError } = await admin
      .from("developer_payment_orders")
      .select("id, provider, status, amount_uzs, click_prepare_id, provider_transaction_id")
      .eq("id", data.merchant_trans_id)
      .eq("environment", "test")
      .maybeSingle();
    if (orderError || !order) {
      return json({ click_trans_id: data.click_trans_id ?? "", merchant_trans_id: data.merchant_trans_id ?? "",
        error: -5, error_note: "Payment order not found" });
    }
    if (order.provider !== "click" || !clickAmountMatches(data.amount ?? "", Number(order.amount_uzs))) {
      return json({ click_trans_id: data.click_trans_id ?? "", merchant_trans_id: data.merchant_trans_id ?? "",
        error: -2, error_note: "Incorrect amount or provider" });
    }
    const prepareId = String(order.click_prepare_id);
    if (action === "0") {
      if (order.status === "paid") {
        return json({ click_trans_id: data.click_trans_id, merchant_trans_id: data.merchant_trans_id,
          error: -4, error_note: "Already paid" });
      }
      if (order.status !== "pending") {
        return json({ click_trans_id: data.click_trans_id, merchant_trans_id: data.merchant_trans_id,
          error: -9, error_note: "Payment order is not payable" });
      }
      return json({
        click_trans_id: data.click_trans_id,
        merchant_trans_id: data.merchant_trans_id,
        merchant_prepare_id: prepareId,
        error: 0,
        error_note: "Success",
      });
    }

    if (String(data.merchant_prepare_id ?? "") !== prepareId) {
      return json({ click_trans_id: data.click_trans_id, merchant_trans_id: data.merchant_trans_id,
        error: -6, error_note: "Invalid prepare transaction" });
    }
    if (order.status === "paid") {
      return json({
        click_trans_id: data.click_trans_id,
        merchant_trans_id: data.merchant_trans_id,
        merchant_confirm_id: String(order.provider_transaction_id ?? data.click_trans_id),
        error: 0,
        error_note: "Already completed",
      });
    }

    const approved = String(data.error ?? "0") === "0";
    const { data: finalized, error: finalizeError } = await admin.rpc(
      "finalize_developer_payment_order",
      {
        p_order_id: order.id,
        p_provider: "click",
        p_provider_transaction_id: data.click_trans_id ?? null,
        p_result: approved ? "paid" : "cancelled",
        p_failure_code: approved ? null : String(data.error_note ?? data.error ?? "CLICK_CANCELLED"),
      },
    );
    if (finalizeError) {
      return json({ click_trans_id: data.click_trans_id, merchant_trans_id: data.merchant_trans_id,
        merchant_prepare_id: prepareId, error: -9, error_note: "Could not finalize the payment" }, 500);
    }
    return json({
      click_trans_id: data.click_trans_id,
      merchant_trans_id: data.merchant_trans_id,
      merchant_confirm_id: String(data.click_trans_id),
      error: 0,
      error_note: finalized?.status === "paid" ? "Success" : "Payment cancelled",
    });
  } catch (error) {
    return provider === "click"
      ? json({ error: -9, error_note: error instanceof Error ? error.message : "Unexpected Click error" }, 500)
      : json({ error: error instanceof Error ? error.message : "Unexpected Payme error" }, 500);
  }
});
