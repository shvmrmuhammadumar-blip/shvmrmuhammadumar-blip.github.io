import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.20.0";

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
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default || Object.values(parsed)[0] || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serverKey = getServerKey();
  if (!supabaseUrl || !serverKey) return json({ error: "Server configuration is incomplete." }, 500);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to end this live." }, 401);

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const sessionId = String(body.sessionId ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return json({ error: "Invalid live session." }, 400);
  }

  const admin = createClient(supabaseUrl, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actor = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY") ?? serverKey,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Your session is invalid." }, 401);

  const [{ data: live, error: liveError }, { data: host, error: hostError }] = await Promise.all([
    admin.from("live_sessions")
      .select("id, host_id, room_name, status")
      .eq("id", sessionId)
      .maybeSingle(),
    admin.from("live_participants")
      .select("role, status")
      .eq("session_id", sessionId)
      .eq("user_id", authData.user.id)
      .maybeSingle(),
  ]);

  if (liveError || hostError) return json({ error: "Could not verify this live session." }, 500);
  if (!live || live.host_id !== authData.user.id || host?.role !== "host") {
    return json({ error: "Only the host can end this live." }, 403);
  }
  if (live.status === "ended") return json({ success: true, alreadyEnded: true });
  if (live.status !== "live" && live.status !== "starting") {
    return json({ error: "This live session cannot be ended." }, 409);
  }

  const liveKitUrl = Deno.env.get("LIVEKIT_URL") ?? "";
  const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
  const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

  if (liveKitUrl && liveKitApiKey && liveKitApiSecret) {
    try {
      const serviceUrl = liveKitUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
      const roomService = new RoomServiceClient(serviceUrl, liveKitApiKey, liveKitApiSecret);
      await roomService.deleteRoom(live.room_name);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : "";
      if (!message.includes("not found") && !message.includes("does not exist") && !message.includes("room")) {
        return json({ error: cause instanceof Error ? cause.message : "Could not close the video room." }, 502);
      }
    }
  }

  const endedAt = new Date().toISOString();
  const [{ error: sessionUpdateError }, { error: participantsUpdateError }, { error: requestsUpdateError }] =
    await Promise.all([
      admin.from("live_sessions")
        .update({ status: "ended", ended_at: endedAt })
        .eq("id", sessionId)
        .eq("host_id", authData.user.id),
      admin.from("live_participants")
        .update({ status: "left", left_at: endedAt })
        .eq("session_id", sessionId)
        .eq("status", "joined"),
      actor.from("live_guest_requests")
        .update({ status: "cancelled" })
        .eq("session_id", sessionId)
        .in("status", ["pending", "accepted"]),
    ]);

  if (sessionUpdateError || participantsUpdateError || requestsUpdateError) {
    return json({ error: "The live video closed, but some session records could not be updated." }, 500);
  }

  return json({ success: true });
});
