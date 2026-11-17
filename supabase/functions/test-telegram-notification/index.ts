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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to test the Telegram connection." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  let publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!publishableKey) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      publishableKey = keys.default || "";
    } catch {
      publishableKey = "";
    }
  }
  if (!supabaseUrl || !publishableKey) {
    return json({ error: "Supabase authentication configuration is missing." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: "Bearer " + jwt } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

  const { data: roleRows, error: roleError } = await userClient
    .from("platform_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (roleError) return json({ error: "Could not verify LUMO manager access." }, 500);

  const allowed = (roleRows ?? []).some((row: { role: string }) => row.role === "owner" || row.role === "developer" || row.role === "admin");
  if (!allowed) return json({ error: "Only LUMO Owners, Admins and Developers can test Telegram notifications." }, 403);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
  if (!botToken || !chatId) {
    return json({
      error: "Missing Telegram secrets. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Supabase Edge Function Secrets.",
    }, 409);
  }

  try {
    const response = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ <b>LUMO ORIGINALS — CONNECTION TEST</b>\n\nTelegram is connected. New customer orders are saved silently and appear under NEW ORDERS.",
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      const reason = String(result.description || "Telegram rejected the message.").slice(0, 240);
      return json({ error: reason }, 502);
    }
    return json({ success: true, message: "Telegram test notification delivered." });
  } catch {
    return json({ error: "Could not reach Telegram. Please try again." }, 502);
  }
});