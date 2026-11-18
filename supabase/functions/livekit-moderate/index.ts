import { createClient } from "npm:@supabase/supabase-js@2";
import {
  RoomServiceClient,
  TrackSource,
  TrackType,
} from "npm:livekit-server-sdk@2.20.0";

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
      error: "LUMO LIVE video service is not connected yet.",
    }, 503);
  }
  if (!supabaseUrl || !serverKey) return json({ error: "Server configuration is incomplete." }, 500);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to manage this live." }, 401);

  let body: { sessionId?: string; targetUserId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const sessionId = String(body.sessionId ?? "");
  const targetUserId = String(body.targetUserId ?? "");
  const action = String(body.action ?? "");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(sessionId) || !uuidPattern.test(targetUserId)) {
    return json({ error: "Invalid live or participant." }, 400);
  }
  if (!["mute", "unmute", "remove"].includes(action)) {
    return json({ error: "Unsupported moderation action." }, 400);
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

  const [{ data: live, error: liveError }, { data: host, error: hostError }, { data: target, error: targetError }] =
    await Promise.all([
      admin.from("live_sessions")
        .select("id, host_id, room_name, status")
        .eq("id", sessionId)
        .maybeSingle(),
      admin.from("live_participants")
        .select("role, status")
        .eq("session_id", sessionId)
        .eq("user_id", authData.user.id)
        .maybeSingle(),
      admin.from("live_participants")
        .select("role, status")
        .eq("session_id", sessionId)
        .eq("user_id", targetUserId)
        .maybeSingle(),
    ]);

  if (liveError || hostError || targetError) return json({ error: "Could not verify live permissions." }, 500);
  if (!live || live.status !== "live" || live.host_id !== authData.user.id || host?.role !== "host" || host?.status !== "joined") {
    return json({ error: "Only the live host can moderate this stage." }, 403);
  }
  if (!target || target.role !== "guest" || target.status !== "joined" || targetUserId === authData.user.id) {
    return json({ error: "This participant is not an active guest." }, 404);
  }

  const serviceUrl = liveKitUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  const roomService = new RoomServiceClient(serviceUrl, liveKitApiKey, liveKitApiSecret);

  try {
    if (action === "remove") {
      try {
        await roomService.removeParticipant(live.room_name, targetUserId);
      } catch (roomError) {
        // A guest may have already disconnected. Continue clearing the persisted stage state.
        const message = roomError instanceof Error ? roomError.message.toLowerCase() : "";
        if (!message.includes("not found") && !message.includes("does not exist") && !message.includes("participant")) {
          throw roomError;
        }
      }

      const [{ error: participantDeleteError }, { error: requestUpdateError }] = await Promise.all([
        admin.from("live_participants")
          .delete()
          .eq("session_id", sessionId)
          .eq("user_id", targetUserId)
          .eq("role", "guest"),
        actor.from("live_guest_requests")
          .update({ status: "cancelled" })
          .eq("session_id", sessionId)
          .eq("requester_id", targetUserId)
          .eq("status", "accepted"),
      ]);

      if (participantDeleteError || requestUpdateError) {
        return json({ error: "The guest was disconnected, but the stage record could not be fully updated." }, 500);
      }
      return json({ success: true, action, targetUserId });
    }

    const participant = await roomService.getParticipant(live.room_name, targetUserId);
    const microphoneTracks = participant.tracks.filter(
      track => track.type === TrackType.AUDIO && track.source === TrackSource.MICROPHONE,
    );

    if (!microphoneTracks.length) return json({ error: "This guest has no active microphone track." }, 409);

    await Promise.all(microphoneTracks.map(track =>
      roomService.mutePublishedTrack(live.room_name, targetUserId, track.sid, action === "mute"),
    ));

    return json({ success: true, action, targetUserId });
  } catch (cause) {
    return json({
      error: cause instanceof Error ? cause.message : "The moderation action failed.",
    }, 502);
  }
});
