import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.20.0";

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
  const liveKitUrl = Deno.env.get("LIVEKIT_URL") ?? "";
  const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
  const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return json({
      code: "LIVE_PROVIDER_NOT_CONFIGURED",
      error: "LUMO LIVE video service is not connected yet. Configure the LiveKit server credentials first.",
    }, 503);
  }

  if (!supabaseUrl || !serverKey) {
    return json({ error: "LUMO LIVE authentication is temporarily unavailable." }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to join this live." }, 401);

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

  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json({ error: "Your session is invalid. Sign in again." }, 401);
  }

  const userId = authData.user.id;
  const [{ data: session, error: sessionError }, { data: participant, error: participantError }, { data: profile }] =
    await Promise.all([
      admin.from("live_sessions")
        .select("id, host_id, room_name, status")
        .eq("id", sessionId)
        .maybeSingle(),
      admin.from("live_participants")
        .select("role, status")
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (sessionError || participantError) {
    return json({ error: "Could not verify your place in this live." }, 500);
  }
  if (!session || !participant || participant.status !== "joined") {
    return json({ error: "Join this live before requesting a video connection." }, 403);
  }

  const isHost = session.host_id === userId && participant.role === "host";
  if (session.status !== "live" && !(isHost && session.status === "starting")) {
    return json({ error: "This live session is not available." }, 409);
  }

  if (participant.role === "guest") {
    const { data: request, error: requestError } = await admin
      .from("live_guest_requests")
      .select("id")
      .eq("session_id", sessionId)
      .eq("requester_id", userId)
      .eq("status", "accepted")
      .maybeSingle();
    if (requestError || !request) {
      return json({ error: "The host has not approved your stage request." }, 403);
    }
  }

  const role = participant.role as "host" | "guest" | "viewer";
  const canPublish = role === "host" || role === "guest";
  const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: userId,
    name: profile?.username || "LUMO member",
    ttl: "2h",
  });

  token.addGrant({
    roomJoin: true,
    room: session.room_name,
    roomAdmin: isHost,
    canPublish,
    canPublishData: role !== "viewer",
    canSubscribe: true,
  });

  const clientUrl = liveKitUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");

  return json({
    url: clientUrl,
    token: await token.toJwt(),
    role,
  });
});
