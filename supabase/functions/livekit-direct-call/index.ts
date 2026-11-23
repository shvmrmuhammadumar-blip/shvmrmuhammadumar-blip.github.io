import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.20.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CallType = "audio" | "video";
type CallStatus = "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
type DirectCall = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: CallType;
  status: CallStatus;
  room_name: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serverKey = getServerKey();
  const liveKitUrl = Deno.env.get("LIVEKIT_URL") ?? "";
  const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
  const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

  if (!supabaseUrl || !serverKey) {
    return json({ error: "LUMO call authentication is temporarily unavailable." }, 500);
  }
  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return json({
      code: "LIVE_PROVIDER_NOT_CONFIGURED",
      error: "LUMO calls are not connected to the voice/video provider yet.",
    }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sign in to make or answer a call." }, 401);

  let body: {
    action?: string;
    calleeId?: string;
    callType?: CallType;
    callId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const admin = createClient(supabaseUrl, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json({ error: "Your session is invalid. Sign in again." }, 401);
  }

  const userId = authData.user.id;
  const action = String(body.action ?? "");

  if (action === "start") {
    const calleeId = String(body.calleeId ?? "");
    const callType = body.callType;
    if (!isUuid(calleeId) || calleeId === userId) {
      return json({ error: "Choose a valid person to call." }, 400);
    }
    if (callType !== "audio" && callType !== "video") {
      return json({ error: "Choose an audio or video call." }, 400);
    }

    const { data: callee, error: calleeError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", calleeId)
      .maybeSingle();
    if (calleeError) return json({ error: "Could not verify this person." }, 500);
    if (!callee) return json({ error: "This LUMO account is no longer available." }, 404);

    const staleBefore = new Date(Date.now() - 60_000).toISOString();
    const { error: expireError } = await admin
      .from("direct_calls")
      .update({ status: "missed", ended_at: new Date().toISOString() })
      .in("status", ["ringing"])
      .lt("created_at", staleBefore)
      .or(`caller_id.eq.${userId},callee_id.eq.${userId},caller_id.eq.${calleeId},callee_id.eq.${calleeId}`);
    if (expireError) return json({ error: "Could not check the call status. Try again." }, 500);

    const { data: activeCalls, error: activeError } = await admin
      .from("direct_calls")
      .select("id")
      .in("status", ["ringing", "accepted"])
      .or(`caller_id.eq.${userId},callee_id.eq.${userId},caller_id.eq.${calleeId},callee_id.eq.${calleeId}`)
      .limit(1);
    if (activeError) return json({ error: "Could not check whether either person is already on a call." }, 500);
    if (activeCalls?.length) {
      return json({ code: "CALL_BUSY", error: "You or this person is already in another call." }, 409);
    }

    const callId = crypto.randomUUID();
    const { data: call, error: createError } = await admin
      .from("direct_calls")
      .insert({
        id: callId,
        caller_id: userId,
        callee_id: calleeId,
        call_type: callType,
        status: "ringing",
        room_name: `lumo-direct-${callId}`,
      })
      .select("id, caller_id, callee_id, call_type, status, room_name, created_at, answered_at, ended_at")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        return json({ code: "CALL_BUSY", error: "You or this person is already in another call." }, 409);
      }
      return json({ error: "The call could not be started. Try again." }, 500);
    }
    return json({ call: call as DirectCall });
  }

  const callId = String(body.callId ?? "");
  if (!isUuid(callId)) return json({ error: "This call is not valid." }, 400);

  const { data: call, error: callError } = await admin
    .from("direct_calls")
    .select("id, caller_id, callee_id, call_type, status, room_name, created_at, answered_at, ended_at")
    .eq("id", callId)
    .maybeSingle();

  if (callError) return json({ error: "Could not load this call." }, 500);
  if (!call) return json({ error: "This call no longer exists." }, 404);

  const currentCall = call as DirectCall;
  const isCaller = currentCall.caller_id === userId;
  const isCallee = currentCall.callee_id === userId;
  if (!isCaller && !isCallee) return json({ error: "You are not a participant in this call." }, 403);

  if (action === "token") {
    if (currentCall.status !== "accepted") {
      return json({ error: "The other person has not accepted the call yet." }, 409);
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
      identity: userId,
      name: profile?.username || "LUMO member",
      ttl: "1h",
    });
    token.addGrant({
      roomJoin: true,
      room: currentCall.room_name,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });
    const clientUrl = liveKitUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
    return json({ url: clientUrl, token: await token.toJwt(), call: currentCall });
  }

  const now = new Date().toISOString();
  let nextStatus: CallStatus;
  let updateQuery: any;

  if (action === "accept") {
    if (!isCallee || currentCall.status !== "ringing") {
      return json({ error: "This incoming call is no longer available." }, 409);
    }
    if (Date.now() - new Date(currentCall.created_at).getTime() > 60_000) {
      await admin.from("direct_calls").update({ status: "missed", ended_at: now })
        .eq("id", callId).eq("status", "ringing");
      return json({ error: "This call has expired." }, 410);
    }
    nextStatus = "accepted";
    updateQuery = admin.from("direct_calls").update({ status: nextStatus, answered_at: now });
  } else if (action === "decline") {
    if (!isCallee || currentCall.status !== "ringing") {
      return json({ error: "This incoming call is no longer available." }, 409);
    }
    nextStatus = "declined";
    updateQuery = admin.from("direct_calls").update({ status: nextStatus, ended_at: now });
  } else if (action === "cancel") {
    if (!isCaller || currentCall.status !== "ringing") {
      return json({ error: "This outgoing call is no longer ringing." }, 409);
    }
    nextStatus = "cancelled";
    updateQuery = admin.from("direct_calls").update({ status: nextStatus, ended_at: now });
  } else if (action === "miss") {
    if (!isCaller || currentCall.status !== "ringing" ||
      Date.now() - new Date(currentCall.created_at).getTime() < 60_000) {
      return json({ error: "This call cannot be marked as missed yet." }, 409);
    }
    nextStatus = "missed";
    updateQuery = admin.from("direct_calls").update({ status: nextStatus, ended_at: now });
  } else if (action === "end") {
    if (currentCall.status !== "accepted") {
      return json({ error: "This call is not connected." }, 409);
    }
    nextStatus = "ended";
    updateQuery = admin.from("direct_calls").update({ status: nextStatus, ended_at: now });
  } else {
    return json({ error: "Unsupported call action." }, 400);
  }

  const participantColumn = action === "accept" || action === "decline" ? "callee_id" :
    action === "cancel" || action === "miss" ? "caller_id" : null;
  if (participantColumn) updateQuery = updateQuery.eq(participantColumn, userId);

  const { data: updated, error: updateError } = await updateQuery
    .eq("id", callId)
    .eq("status", currentCall.status)
    .select("id, caller_id, callee_id, call_type, status, room_name, created_at, answered_at, ended_at")
    .maybeSingle();

  if (updateError) return json({ error: "Could not update this call." }, 500);
  if (!updated) return json({ error: "The call status has already changed." }, 409);
  return json({ call: updated as DirectCall });
});
