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

function getServerKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || "";
  } catch {
    return "";
  }
}

function newWebhookSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function telegram(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(String(result.description || "Telegram " + method + " request failed."));
  }
  return result.result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to configure the Telegram bot." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serverKey = getServerKey();
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
  if (!supabaseUrl || !serverKey) return json({ error: "Supabase server configuration is missing." }, 500);
  if (!botToken || !chatId) return json({ error: "Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to Edge Function Secrets." }, 409);

  const admin = createClient(supabaseUrl, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userResult.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

  const { data: roles, error: roleError } = await admin
    .from("platform_roles")
    .select("role")
    .eq("user_id", userResult.user.id);
  if (roleError) return json({ error: "Could not verify manager access." }, 500);
  if (!(roles || []).some((row: { role: string }) => row.role === "owner" || row.role === "developer" || row.role === "admin")) {
    return json({ error: "Only LUMO Owners, Admins and Developers can configure this bot." }, 403);
  }

  try {
    const bot = await telegram(botToken, "getMe", {}) as { id: number; username?: string };
    const webhookSecret = newWebhookSecret();
    const { error: configError } = await admin
      .from("lumo_telegram_bot_config")
      .upsert({ singleton: true, webhook_secret: webhookSecret, updated_at: new Date().toISOString() }, { onConflict: "singleton" });
    if (configError) throw new Error("Could not save the webhook security configuration.");

    const webhookUrl = supabaseUrl.replace(/\/$/, "") + "/functions/v1/lumo-telegram-bot";
    await telegram(botToken, "setMyCommands", {
      commands: [
        { command: "new_orders", description: "View new customer orders" },
        { command: "orders", description: "View orders already reviewed" },
        { command: "delete_order", description: "Choose an order ID to delete" },
      ],
    });
    await telegram(botToken, "setWebhook", {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });

    const keyboard = {
      keyboard: [
        [{ text: "NEW ORDERS" }, { text: "ORDERS" }],
        [{ text: "DELETE ORDER" }],
      ],
      is_persistent: true,
      resize_keyboard: true,
    };
    await telegram(botToken, "sendMessage", {
      chat_id: chatId,
      text: "✅ <b>LUMO ORIGINALS BOT IS READY</b>\n\nUse the buttons below to manage your orders.\n\n• NEW ORDERS — lists new orders and moves displayed orders to ORDERS.\n• ORDERS — lists reviewed and completed orders.\n• DELETE ORDER — sends order IDs; reply with an ID to delete that order.",
      parse_mode: "HTML",
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });

    return json({
      success: true,
      botUsername: bot.username || null,
      webhookConfigured: true,
      commandsConfigured: true,
      keyboardSent: true,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Could not configure Telegram bot.",
    }, 502);
  }
});