const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("direct call records are participant-only and published to Realtime", () => {
  const sql = read("supabase/migrations/20261123024752_create_lumo_direct_calls.sql");
  assert.match(sql, /alter table public\.direct_calls enable row level security/i);
  assert.match(sql, /caller_id = \(select auth\.uid\(\)\)[\s\S]*callee_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /grant select on table public\.direct_calls to authenticated/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.direct_calls/i);
  assert.match(sql, /direct_calls_one_active_outgoing_per_user/i);
  assert.match(sql, /direct_calls_one_active_incoming_per_user/i);
});

test("the call token endpoint authenticates and only issues tokens after acceptance", () => {
  const edge = read("supabase/functions/livekit-direct-call/index.ts");
  assert.match(edge, /admin\.auth\.getUser\(jwt\)/);
  assert.match(edge, /currentCall\.status !== "accepted"/);
  assert.match(edge, /roomJoin: true/);
  assert.match(edge, /canPublish: true/);
  assert.match(edge, /canSubscribe: true/);
});

test("incoming calls are handled globally outside the chat route", () => {
  const layout = read("app/_layout.tsx");
  const provider = read("lib/direct-calls.tsx");
  assert.match(layout, /<DirectCallsProvider>/);
  assert.match(provider, /table: "direct_calls", filter: `callee_id=eq\.\$\{me\}`/);
  assert.match(provider, /action: "accept"/);
  assert.match(provider, /action: "decline"/);
  assert.match(provider, /action: "cancel"/);
  assert.match(provider, /action: "end"/);
});

test("chat audio and video buttons use the shared call provider", () => {
  const chat = read("app/chat/chat-screen.tsx");
  assert.match(chat, /startCall\(otherId, "audio"\)/);
  assert.match(chat, /startCall\(otherId, "video"\)/);
});

test("native and web call screens connect to LiveKit and control devices", () => {
  const native = read("components/DirectCallRoom.native.tsx");
  const web = read("components/DirectCallRoom.web.tsx");
  assert.match(native, /<LiveKitRoom/);
  assert.match(native, /setMicrophoneEnabled/);
  assert.match(native, /setCameraEnabled/);
  assert.match(web, /new Room\(/);
  assert.match(web, /room\.connect\(/);
  assert.match(web, /setMicrophoneEnabled/);
  assert.match(web, /setCameraEnabled/);
});
