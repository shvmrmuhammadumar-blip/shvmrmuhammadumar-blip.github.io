import { createClient } from "npm:@supabase/supabase-js@2";

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

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[char] ?? char));
}

function clip(value: unknown, max = 240) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return escapeHtml(text.slice(0, max));
}

function keyboard() {
  return {
    keyboard: [
      [{ text: "NEW ORDERS" }, { text: "ORDERS" }],
      [{ text: "DELETE ORDER" }],
    ],
    is_persistent: true,
    resize_keyboard: true,
  };
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function money(value: number, currency: string) {
  const amount = Number(value) || 0;
  return currency === "USD"
    ? "$" + amount.toFixed(2)
    : amount.toLocaleString("en-US") + " UZS";
}

function statusLabel(status: string) {
  if (status === "new") return "🔴 UNREAD / NEW";
  if (status === "completed") return "✅ COMPLETED";
  return "📖 READ / IN PROGRESS";
}

function formatOrder(order: Record<string, any>) {
  const created = order.created_at
    ? new Date(order.created_at).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent",
      }) + " (Tashkent)"
    : "—";
  const unit = money(order.unit_price, order.currency);
  const total = money(order.subtotal, order.currency);

  return [
    "🛍 <b>ORDER #" + order.id + "</b>",
    "<b>Status:</b> " + statusLabel(String(order.status)),
    "",
    "<b>PRODUCT</b>",
    "Name: " + clip(order.product_name, 180),
    "SKU: " + clip(order.product_sku, 100),
    "Option: " + clip(order.variant_name, 240),
    "Unit price: " + escapeHtml(unit),
    "Quantity: " + Number(order.quantity || 0),
    "TOTAL: <b>" + escapeHtml(total) + "</b>",
    "",
    "<b>CUSTOMER</b>",
    "Name: " + clip(order.customer_name, 120),
    "Phone: " + clip(order.customer_phone, 32),
    "Address: " + clip(order.customer_address, 420),
    "Note: " + clip(order.customer_note, 700),
    "",
    "<b>ORDER TIME:</b> " + escapeHtml(created),
    "<b>Telegram notification:</b> " + escapeHtml(String(order.notification_status || "pending").toUpperCase()),
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response({ ok: false }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serverKey = getServerKey();
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const configuredChatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
  if (!supabaseUrl || !serverKey || !botToken || !configuredChatId) return response({ ok: false }, 500);

  const admin = createClient(supabaseUrl, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  const { data: config } = await admin
    .from("lumo_telegram_bot_config")
    .select("webhook_secret")
    .eq("singleton", true)
    .maybeSingle();
  if (!config?.webhook_secret || secretHeader !== config.webhook_secret) {
    return response({ ok: false, error: "Unauthorized webhook" }, 401);
  }

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return response({ ok: true });
  }
  const updateId = Number(update.update_id);
  if (Number.isSafeInteger(updateId)) {
    const { error: duplicateError } = await admin
      .from("lumo_telegram_processed_updates")
      .insert({ update_id: updateId });
    if (duplicateError) {
      if (duplicateError.code === "23505") return response({ ok: true, duplicate: true });
      return response({ ok: false }, 500);
    }
  }

  const message = update.message;
  if (!message?.chat || !message?.from) return response({ ok: true });
  const chatId = String(message.chat.id);
  if (chatId !== configuredChatId || String(message.from.id) !== configuredChatId || message.chat.type !== "private") {
    return response({ ok: true });
  }

  const send = async (text: string, markup = true) => {
    const result = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: configuredChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(markup ? { reply_markup: keyboard() } : {}),
      }),
    });
    const body = await result.json();
    if (!result.ok || !body.ok) throw new Error(String(body.description || "Telegram message failed."));
    return body.result;
  };

  const orderFields = "id, product_name, product_sku, variant_name, unit_price, quantity, subtotal, currency, customer_name, customer_phone, customer_address, customer_note, status, notification_status, created_at";

  // Keep each Telegram message comfortably below Telegram's 4096-character limit.
  const sendOrderBatches = async (
    heading: string,
    rows: Record<string, any>[],
    markUnreadAsRead: boolean,
  ) => {
    if (!rows.length) return;
    let currentText = heading;
    let currentIds: number[] = [];
    const chunks: { text: string; ids: number[] }[] = [];

    for (const order of rows) {
      const block = formatOrder(order);
      const candidate = currentText + "\n\n" + block;
      if (candidate.length > 3600 && currentIds.length > 0) {
        chunks.push({ text: currentText, ids: currentIds });
        currentText = heading + "\n\n" + block;
        currentIds = [Number(order.id)];
      } else {
        currentText = candidate;
        currentIds.push(Number(order.id));
      }
    }
    if (currentIds.length) chunks.push({ text: currentText, ids: currentIds });

    for (const chunk of chunks) {
      await send(chunk.text);
      if (markUnreadAsRead) {
        const { error: moveError } = await admin
          .from("lumo_official_orders")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .in("id", chunk.ids)
          .eq("status", "new");
        if (moveError) throw moveError;
      }
    }
    return chunks.length;
  };

  try {
    const text = String(message.text || "").trim();
    const normalized = text.toUpperCase();
    const command = text.split("@")[0].toLowerCase();

    if (command === "/start" || command === "/help") {
      await send(
        "👋 <b>LUMO ORIGINALS ORDER MANAGER</b>\n\n<b>NEW ORDERS</b> — only unread orders. Opening this list marks the displayed orders as read and moves them out of NEW ORDERS.\n\n<b>ORDERS</b> — every order that has not been deleted, including unread, read and completed orders. Full customer and product details are shown.\n\n<b>DELETE ORDER</b> — choose an order ID and send that number to permanently delete it.",
      );
      return response({ ok: true });
    }

    if (command === "/new_orders" || normalized === "NEW ORDERS") {
      const { data: rows, error } = await admin
        .from("lumo_official_orders")
        .select(orderFields)
        .eq("status", "new")
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      if (!rows?.length) {
        await send("📭 <b>No unread orders.</b>\n\nAll new orders have been viewed.");
        return response({ ok: true });
      }

      const count = await sendOrderBatches(
        "🆕 <b>NEW ORDERS — UNREAD (" + rows.length + ")</b>",
        rows as Record<string, any>[],
        true,
      );
      await send(
        "✅ <b>" + rows.length + " order(s) opened.</b>\nThey have moved out of NEW ORDERS and are now marked as READ in ORDERS." +
          (rows.length === 100 ? "\nShowing up to 100 unread orders. Tap again for remaining unread orders." : ""),
      );
      return response({ ok: true, sentBatches: count });
    }

    if (command === "/orders" || normalized === "ORDERS") {
      const { data: rows, error } = await admin
        .from("lumo_official_orders")
        .select(orderFields)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (!rows?.length) {
        await send("📭 <b>No orders yet.</b>\n\nNew customer orders will appear here.");
        return response({ ok: true });
      }

      const count = await sendOrderBatches(
        "📦 <b>ALL ORDERS — " + rows.length + "</b>",
        rows as Record<string, any>[],
        false,
      );
      await send(
        "📚 <b>All " + rows.length + " saved order(s) displayed.</b>" +
          (rows.length === 500 ? "\nShowing the latest 500 orders." : "") +
          "\nUNREAD = not opened yet · READ = opened · COMPLETED = fulfilled.",
      );
      return response({ ok: true, sentBatches: count });
    }

    if (command === "/delete_order" || normalized === "DELETE ORDER") {
      const { data: rows, error } = await admin
        .from("lumo_official_orders")
        .select("id, product_name, customer_name, customer_phone, status, subtotal, currency, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (!rows?.length) {
        await admin.from("lumo_telegram_bot_state").delete().eq("chat_id", Number(configuredChatId));
        await send("🗑 <b>No orders to delete.</b>");
        return response({ ok: true });
      }
      await admin.from("lumo_telegram_bot_state").upsert({
        chat_id: Number(configuredChatId),
        awaiting_action: "delete_order",
        updated_at: new Date().toISOString(),
      }, { onConflict: "chat_id" });

      const lines = rows.map((order: Record<string, any>) =>
        "<b>#" + order.id + "</b> · " + clip(order.product_name, 80) +
        "\n" + clip(order.customer_name, 80) + " · " + clip(order.customer_phone, 32) +
        "\n" + escapeHtml(statusLabel(String(order.status))) + " · " +
        escapeHtml(money(order.subtotal, order.currency))
      );
      let listMessage = "🗑 <b>DELETE ORDER — SELECT ID</b>\n\n";
      for (const line of lines) {
        if (listMessage.length + line.length + 2 > 3500 && listMessage.trim()) {
          await send(listMessage);
          listMessage = "🗑 <b>DELETE ORDER — CONTINUED</b>\n\n";
        }
        listMessage += line + "\n\n";
      }
      listMessage += (rows.length === 500 ? "Showing the latest 500 orders.\n\n" : "") +
        "Send only the order ID number to permanently delete it.\nSend /cancel to cancel.";
      await send(listMessage);
      return response({ ok: true });
    }

    if (command === "/cancel") {
      await admin.from("lumo_telegram_bot_state").delete().eq("chat_id", Number(configuredChatId));
      await send("Deletion cancelled. Your orders are unchanged.");
      return response({ ok: true });
    }

    const { data: state } = await admin
      .from("lumo_telegram_bot_state")
      .select("awaiting_action")
      .eq("chat_id", Number(configuredChatId))
      .maybeSingle();

    if (state?.awaiting_action === "delete_order") {
      const match = text.match(/^#?(\d{1,18})$/);
      if (!match) {
        await send("Send only the numeric order ID from the DELETE ORDER list, or use /cancel.");
        return response({ ok: true });
      }
      const orderId = Number(match[1]);
      const { data: order, error: readError } = await admin
        .from("lumo_official_orders")
        .select("id, product_name")
        .eq("id", orderId)
        .maybeSingle();
      if (readError) throw readError;
      if (!order) {
        await send("❌ Order #" + orderId + " was not found. No order was deleted. Choose DELETE ORDER to see the latest list.");
        await admin.from("lumo_telegram_bot_state").delete().eq("chat_id", Number(configuredChatId));
        return response({ ok: true });
      }
      const { error: deleteError } = await admin
        .from("lumo_official_orders")
        .delete()
        .eq("id", orderId);
      if (deleteError) throw deleteError;
      await admin.from("lumo_telegram_bot_state").delete().eq("chat_id", Number(configuredChatId));
      await send("✅ <b>Order #" + orderId + " deleted.</b>\n" + clip(order.product_name, 180) + "\n\nThe order has been permanently removed from LUMO.");
      return response({ ok: true });
    }

    await send("Use the buttons below to manage LUMO orders. Choose DELETE ORDER before sending an order ID.");
    return response({ ok: true });
  } catch (error) {
    try {
      await send("⚠️ LUMO bot error: " + escapeHtml(error instanceof Error ? error.message : "Could not process this command."));
    } catch {
      // The bot may be temporarily unavailable.
    }
    return response({ ok: true });
  }
});