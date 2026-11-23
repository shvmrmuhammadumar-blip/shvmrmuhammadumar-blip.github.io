import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { Alert } from "./alert";
import Avatar from "../components/Avatar";
import DirectCallRoom from "../components/DirectCallRoom";

export type DirectCallType = "audio" | "video";
export type DirectCallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "cancelled"
  | "missed"
  | "ended";

export type DirectCallRecord = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: DirectCallType;
  status: DirectCallStatus;
  room_name: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

type CallCredentials = { url: string; token: string };
type CallProfile = { username: string; avatar_url: string | null };
export type DirectCallState = {
  call: DirectCallRecord;
  role: "caller" | "callee";
  remote: CallProfile;
  phase: "incoming" | "outgoing" | "connecting" | "connected";
  credentials?: CallCredentials;
};

type DirectCallsContextValue = {
  call: DirectCallState | null;
  starting: boolean;
  startCall: (calleeId: string, callType: DirectCallType) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: () => Promise<void>;
  markConnected: (callId: string) => void;
};

const DirectCallsContext = createContext<DirectCallsContextValue | null>(null);
const db = supabase as any;

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function invokeCallAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("livekit-direct-call", {
    body,
  });
  if (error) {
    const serverMessage = (data as { error?: string } | null)?.error;
    if (serverMessage) throw new Error(serverMessage);
    const response = (error as { context?: Response }).context;
    if (response && typeof response.clone === "function") {
      const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || "Call service is unavailable.");
  }
  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as any;
}

export function DirectCallsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [call, setCall] = useState<DirectCallState | null>(null);
  const [starting, setStarting] = useState(false);
  const callRef = useRef<DirectCallState | null>(null);
  const tokenCallRef = useRef<string | null>(null);

  const setActiveCall = useCallback((next: DirectCallState | null) => {
    callRef.current = next;
    setCall(next);
    if (!next) tokenCallRef.current = null;
  }, []);

  const connectToCall = useCallback(async (state: DirectCallState) => {
    const callId = state.call.id;
    if (tokenCallRef.current === callId) return;
    tokenCallRef.current = callId;
    setActiveCall({ ...state, phase: "connecting", credentials: undefined });
    try {
      const data = await invokeCallAction({ action: "token", callId });
      if (!data?.url || !data?.token) {
        throw new Error("The secure call connection could not be created.");
      }
      const current = callRef.current;
      if (!current || current.call.id !== callId) return;
      setActiveCall({
        ...current,
        phase: "connecting",
        credentials: { url: data.url, token: data.token },
      });
    } catch (error) {
      if (callRef.current?.call.id === callId) {
        await invokeCallAction({ action: "end", callId }).catch(() => undefined);
        setActiveCall(null);
        Alert.alert("Call connection failed", messageFrom(error, "Please try again."));
      }
    } finally {
      if (tokenCallRef.current === callId) tokenCallRef.current = null;
    }
  }, [setActiveCall]);

  const handleCallUpdate = useCallback((row: DirectCallRecord) => {
    const current = callRef.current;
    if (!current || current.call.id !== row.id) return;

    const updated = { ...current, call: row };
    setActiveCall(updated);

    if (row.status === "accepted" && current.role === "caller" && current.phase === "outgoing") {
      void connectToCall(updated);
      return;
    }

    if (["declined", "cancelled", "missed", "ended"].includes(row.status)) {
      setActiveCall(null);
      if (row.status === "declined") Alert.alert("Call declined", "The person declined your call.");
      else if (row.status === "missed") Alert.alert("No answer", "The call was not answered.");
    }
  }, [connectToCall, setActiveCall]);

  const receiveIncoming = useCallback(async (row: DirectCallRecord) => {
    if (!me || row.callee_id !== me || row.status !== "ringing" || callRef.current) return;
    try {
      const { data, error } = await db
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", row.caller_id)
        .maybeSingle();
      if (error) throw error;
      if (callRef.current) return;
      setActiveCall({
        call: row,
        role: "callee",
        remote: {
          username: data?.username || "LUMO member",
          avatar_url: data?.avatar_url ?? null,
        },
        phase: "incoming",
      });
    } catch (error) {
      Alert.alert("Incoming call unavailable", messageFrom(error, "Could not load caller details."));
    }
  }, [me, setActiveCall]);

  useEffect(() => {
    if (!me) {
      setActiveCall(null);
      return;
    }

    let active = true;
    const channel = supabase
      .channel(`direct-calls-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_calls", filter: `callee_id=eq.${me}` },
        (payload) => {
          if (active) void receiveIncoming(payload.new as DirectCallRecord);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_calls", filter: `caller_id=eq.${me}` },
        (payload) => {
          if (active) handleCallUpdate(payload.new as DirectCallRecord);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_calls", filter: `callee_id=eq.${me}` },
        (payload) => {
          if (active) handleCallUpdate(payload.new as DirectCallRecord);
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || !active) return;
        void (async () => {
          const { data, error } = await db
            .from("direct_calls")
            .select("id, caller_id, callee_id, call_type, status, room_name, created_at, answered_at, ended_at")
            .eq("callee_id", me)
            .eq("status", "ringing")
            .gte("created_at", new Date(Date.now() - 60_000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1);
          if (!active || error || !data?.[0]) return;
          await receiveIncoming(data[0] as DirectCallRecord);
        })();
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [handleCallUpdate, me, receiveIncoming, setActiveCall]);

  useEffect(() => {
    if (!call || call.phase !== "outgoing") return;
    const callId = call.call.id;
    const createdAt = new Date(call.call.created_at).getTime();
    const timer = setInterval(() => {
      if (Date.now() - createdAt >= 60_000) {
        void invokeCallAction({ action: "miss", callId })
          .catch(() => undefined)
          .finally(() => {
            if (callRef.current?.call.id === callId) setActiveCall(null);
          });
        return;
      }
      void (async () => {
        const { data } = await db
          .from("direct_calls")
          .select("id, caller_id, callee_id, call_type, status, room_name, created_at, answered_at, ended_at")
          .eq("id", callId)
          .maybeSingle();
        if (data) handleCallUpdate(data as DirectCallRecord);
      })();
    }, 1500);
    return () => clearInterval(timer);
  }, [call, handleCallUpdate, setActiveCall]);

  const startCall = useCallback(async (calleeId: string, callType: DirectCallType) => {
    if (!me || !calleeId || calleeId === me || callRef.current || starting) return;
    setStarting(true);
    try {
      const { data: profile, error } = await db
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", calleeId)
        .maybeSingle();
      if (error) throw error;
      const data = await invokeCallAction({ action: "start", calleeId, callType });
      if (!data?.call) throw new Error("The call could not be started.");
      setActiveCall({
        call: data.call as DirectCallRecord,
        role: "caller",
        remote: {
          username: profile?.username || "LUMO member",
          avatar_url: profile?.avatar_url ?? null,
        },
        phase: "outgoing",
      });
    } catch (error) {
      Alert.alert("Could not start call", messageFrom(error, "Please try again."));
    } finally {
      setStarting(false);
    }
  }, [me, setActiveCall, starting]);

  const acceptIncoming = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.phase !== "incoming") return;
    try {
      const data = await invokeCallAction({ action: "accept", callId: current.call.id });
      const accepted = { ...current, call: data.call as DirectCallRecord, phase: "connecting" as const };
      setActiveCall(accepted);
      await connectToCall(accepted);
    } catch (error) {
      Alert.alert("Could not answer", messageFrom(error, "This call is no longer available."));
      setActiveCall(null);
    }
  }, [connectToCall, setActiveCall]);

  const declineIncoming = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.phase !== "incoming") return;
    try {
      await invokeCallAction({ action: "decline", callId: current.call.id });
      setActiveCall(null);
    } catch (error) {
      Alert.alert("Could not decline call", messageFrom(error, "Please try again."));
    }
  }, [setActiveCall]);

  const cancelCall = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.role !== "caller" || current.call.status !== "ringing") return;
    try {
      await invokeCallAction({ action: "cancel", callId: current.call.id });
      setActiveCall(null);
    } catch (error) {
      Alert.alert("Could not cancel call", messageFrom(error, "Please try again."));
    }
  }, [setActiveCall]);

  const endCall = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    try {
      if (current.call.status === "ringing") {
        await invokeCallAction({
          action: current.role === "caller" ? "cancel" : "decline",
          callId: current.call.id,
        });
      } else if (current.call.status === "accepted") {
        await invokeCallAction({ action: "end", callId: current.call.id });
      }
      setActiveCall(null);
    } catch (error) {
      Alert.alert("Could not end call", messageFrom(error, "Please try again."));
    }
  }, [setActiveCall]);

  const markConnected = useCallback((callId: string) => {
    const current = callRef.current;
    if (!current || current.call.id !== callId) return;
    setActiveCall({ ...current, phase: "connected" });
  }, [setActiveCall]);

  const value = useMemo<DirectCallsContextValue>(() => ({
    call,
    starting,
    startCall,
    acceptIncoming,
    declineIncoming,
    cancelCall,
    endCall,
    markConnected,
  }), [call, starting, startCall, acceptIncoming, declineIncoming, cancelCall, endCall, markConnected]);

  return (
    <DirectCallsContext.Provider value={value}>
      {children}
      <DirectCallLayer />
    </DirectCallsContext.Provider>
  );
}

export function useDirectCalls() {
  const context = useContext(DirectCallsContext);
  if (!context) throw new Error("useDirectCalls must be used inside DirectCallsProvider.");
  return context;
}

function DirectCallLayer() {
  const {
    call,
    acceptIncoming,
    declineIncoming,
    cancelCall,
    endCall,
    markConnected,
  } = useDirectCalls();

  if (!call) return null;

  if (call.credentials) {
    return (
      <DirectCallRoom
        key={call.call.id}
        url={call.credentials.url}
        token={call.credentials.token}
        callType={call.call.call_type}
        remoteName={call.remote.username}
        remoteAvatar={call.remote.avatar_url}
        onConnected={() => markConnected(call.call.id)}
        onHangup={() => void endCall()}
      />
    );
  }

  const incoming = call.phase === "incoming";
  const outgoing = call.phase === "outgoing";
  const video = call.call.call_type === "video";

  return (
    <View style={styles.pendingOverlay}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.topLabel}>
          <View style={styles.brandMark}><Ionicons name="call" size={15} color="#D8FF72" /></View>
          <Text style={styles.brandText}>LUMO CALL</Text>
        </View>

        <View style={styles.center}>
          <View style={styles.avatarHalo}>
            <Avatar uri={call.remote.avatar_url} name={call.remote.username} size={116} hasStory={false} />
          </View>
          <Text style={styles.name}>{call.remote.username}</Text>
          <Text style={styles.status}>
            {incoming
              ? `Incoming ${video ? "video" : "audio"} call`
              : outgoing
                ? "Calling…"
                : "Preparing secure connection…"}
          </Text>
          {call.phase === "connecting" ? (
            <ActivityIndicator color="#D8FF72" size="large" style={{ marginTop: 18 }} />
          ) : null}
        </View>

        <View style={styles.actions}>
          {incoming ? (
            <>
              <Pressable style={[styles.actionButton, styles.decline]} onPress={() => void declineIncoming()}>
                <Ionicons name="call" size={25} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
                <Text style={styles.actionLabel}>Decline</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.accept]} onPress={() => void acceptIncoming()}>
                <Ionicons name={video ? "videocam" : "call"} size={25} color="#081009" />
                <Text style={[styles.actionLabel, styles.acceptLabel]}>Accept</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={[styles.actionButton, styles.decline]} onPress={() => void (outgoing ? cancelCall() : endCall())}>
              <Ionicons name="call" size={25} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
              <Text style={styles.actionLabel}>{outgoing ? "Cancel" : "End"}</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pendingOverlay: { ...StyleSheet.absoluteFill, zIndex: 11000, elevation: 11000, backgroundColor: "#090C12" },
  screen: {
    flex: 1,
    backgroundColor: "#090C12",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 42,
  },
  topLabel: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#202A19", alignItems: "center", justifyContent: "center" },
  brandText: { color: "#D8FF72", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  center: { alignItems: "center", gap: 12 },
  avatarHalo: { padding: 9, borderRadius: 90, borderWidth: 1, borderColor: "rgba(216,255,114,0.45)", backgroundColor: "rgba(216,255,114,0.08)" },
  name: { color: "#F4F6F0", fontSize: 27, fontWeight: "900", marginTop: 8 },
  status: { color: "#AAB2A5", fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 34 },
  actionButton: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", gap: 4 },
  decline: { backgroundColor: "#C93650" },
  accept: { backgroundColor: "#D8FF72" },
  actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  acceptLabel: { color: "#081009" },
});
