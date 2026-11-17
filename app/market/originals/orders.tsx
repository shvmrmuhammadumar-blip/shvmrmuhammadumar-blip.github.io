import React, { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import { canManageOfficialCatalog, getPlatformRoles, type PlatformRole } from "../../../lib/market-official";
import {
  deleteOfficialOrder,
  getOfficialOrders,
  setupOfficialTelegramBot,
  testOfficialTelegram,
  updateOfficialOrderStatus,
  type OfficialOrder,
} from "../../../lib/market-orders";
import { colors } from "../../../lib/theme";

type OrderTab = "new" | "orders";

function price(value: number, currency: "USD" | "UZS") {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(value) || 0);
  return currency === "USD" ? "$" + formatted : formatted + " UZS";
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OfficialOrdersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [orders, setOrders] = useState<OfficialOrder[]>([]);
  const [tab, setTab] = useState<OrderTab>("new");
  const [selectedOrder, setSelectedOrder] = useState<OfficialOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [settingUpTelegram, setSettingUpTelegram] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!userId) {
      setRoles([]);
      setOrders([]);
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const nextRoles = await getPlatformRoles(userId);
      setRoles(nextRoles);
      if (!canManageOfficialCatalog(nextRoles)) {
        setOrders([]);
        return;
      }
      const rows = await getOfficialOrders();
      setOrders(rows);
      setSelectedOrder((current) => current ? rows.find((item) => item.id === current.id) ?? null : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const newOrders = useMemo(() => orders.filter((item) => item.status === "new"), [orders]);
  const pastOrders = useMemo(() => orders, [orders]);
  const visibleOrders = tab === "new" ? newOrders : pastOrders;
  const isManager = canManageOfficialCatalog(roles);

  const openOrder = async (order: OfficialOrder) => {
    setSelectedOrder(order);
    setDetailVisible(true);
    if (order.status !== "new") return;
    setBusy(true);
    try {
      await updateOfficialOrderStatus(order.id, "processing");
      const updated = { ...order, status: "processing" as const, updated_at: new Date().toISOString() };
      setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
      setSelectedOrder(updated);
    } catch (updateError) {
      Alert.alert("Could not update order", updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const markCompleted = async () => {
    if (!selectedOrder) return;
    setBusy(true);
    try {
      await updateOfficialOrderStatus(selectedOrder.id, "completed");
      const updated = { ...selectedOrder, status: "completed" as const, updated_at: new Date().toISOString() };
      setOrders((current) => current.map((item) => item.id === selectedOrder.id ? updated : item));
      setSelectedOrder(updated);
    } catch (updateError) {
      Alert.alert("Update failed", updateError instanceof Error ? updateError.message : "Could not complete this order.");
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = () => {
    if (!selectedOrder || selectedOrder.status !== "completed") return;
    Alert.alert(
      "Delete order?",
      "This permanently deletes the order from the LUMO database. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteOfficialOrder(selectedOrder.id);
              setOrders((current) => current.filter((item) => item.id !== selectedOrder.id));
              setSelectedOrder(null);
              setDetailVisible(false);
            } catch (deleteError) {
              Alert.alert("Delete failed", deleteError instanceof Error ? deleteError.message : "Could not delete this order.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const callCustomer = () => {
    if (!selectedOrder?.customer_phone) return;
    const number = selectedOrder.customer_phone.replace(/[^+\d]/g, "");
    void Linking.openURL("tel:" + number);
  };

  const setupTelegramBot = async () => {
    setSettingUpTelegram(true);
    try {
      const result = await setupOfficialTelegramBot();
      Alert.alert(
        "LUMO bot is ready",
        (result.botUsername ? "@" + result.botUsername + " is connected. " : "") +
          "The three persistent order buttons and Telegram commands have been installed.",
      );
    } catch (setupError) {
      Alert.alert("Bot setup failed", setupError instanceof Error ? setupError.message : "Could not configure the Telegram bot.");
    } finally {
      setSettingUpTelegram(false);
    }
  };

  const sendTelegramTest = async () => {
    setTestingTelegram(true);
    try {
      await testOfficialTelegram();
      Alert.alert("Telegram connected", "LUMO test notification was delivered to your Telegram chat.");
    } catch (testError) {
      Alert.alert("Telegram test failed", testError instanceof Error ? testError.message : "Could not send a test message.");
    } finally {
      setTestingTelegram(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.accentStrong} /><Text style={styles.muted}>Loading orders...</Text></View>;
  }

  if (!isManager) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.accentStrong} />
        <Text style={styles.title}>Access restricted</Text>
        <Text style={styles.muted}>Order management is available to LUMO Owners, Admins and Developers.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Go back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerIcon} hitSlop={8}>
          <Ionicons name="arrow-back" size={19} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LUMO ORIGINALS</Text>
          <Text style={styles.title}>Order management</Text>
        </View>
        <Pressable onPress={() => void load(true)} style={styles.headerIcon} accessibilityLabel="Refresh orders">
          {refreshing ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="refresh" size={18} color={colors.accentStrong} />}
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{newOrders.length}</Text>
          <Text style={styles.summaryLabel}>NEW ORDERS</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pastOrders.length}</Text>
          <Text style={styles.summaryLabel}>ORDERS</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{orders.filter((item) => item.status === "completed").length}</Text>
          <Text style={styles.summaryLabel}>COMPLETED</Text>
        </View>
      </View>

      <Pressable
        onPress={() => void setupTelegramBot()}
        disabled={settingUpTelegram}
        style={[styles.telegramTestButton, settingUpTelegram && styles.disabled]}
      >
        {settingUpTelegram ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="settings-outline" size={15} color={colors.accentStrong} />}
        <Text style={styles.telegramTestText}>{settingUpTelegram ? "INSTALLING BOT COMMANDS..." : "INSTALL / REFRESH TELEGRAM BUTTONS"}</Text>
      </Pressable>

      <Pressable
        onPress={() => void sendTelegramTest()}
        disabled={testingTelegram}
        style={[styles.telegramTestButton, styles.telegramTestSecondary, testingTelegram && styles.disabled]}
      >
        {testingTelegram ? <ActivityIndicator size="small" color={colors.muted} /> : <Ionicons name="paper-plane-outline" size={14} color={colors.muted} />}
        <Text style={styles.telegramTestSecondaryText}>{testingTelegram ? "CHECKING..." : "TEST TELEGRAM NOTIFICATION"}</Text>
      </Pressable>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab("new")} style={[styles.tab, tab === "new" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "new" && styles.tabTextActive]}>NEW ORDERS</Text>
          {newOrders.length > 0 ? <View style={styles.countPill}><Text style={styles.countText}>{newOrders.length}</Text></View> : null}
        </Pressable>
        <Pressable onPress={() => setTab("orders")} style={[styles.tab, tab === "orders" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "orders" && styles.tabTextActive]}>ORDERS</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorPanel}>
          <Text style={styles.errorTitle}>Could not load orders</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable onPress={() => void load(true)} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {visibleOrders.length ? visibleOrders.map((order) => (
            <Pressable key={order.id} onPress={() => void openOrder(order)} style={({ pressed }) => [styles.orderCard, pressed && styles.cardPressed]}>
              <View style={styles.orderTop}>
                <Text style={styles.orderNumber}>ORDER #{order.id}</Text>
                <View style={[styles.statusPill, order.status === "completed" ? styles.statusCompleted : order.status === "processing" ? styles.statusProcessing : styles.statusNew]}>
                  <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.productName} numberOfLines={1}>{order.product_name}</Text>
              <Text style={styles.customerName}>{order.customer_name} · {order.customer_phone}</Text>
              <View style={styles.orderBottom}>
                <Text style={styles.orderDate}>{dateLabel(order.created_at)}</Text>
                <Text style={styles.orderPrice}>{price(order.subtotal, order.currency)}</Text>
              </View>
            </Pressable>
          )) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name={tab === "new" ? "mail-open-outline" : "receipt-outline"} size={28} color={colors.muted} /></View>
              <Text style={styles.emptyTitle}>{tab === "new" ? "No new orders yet" : "No orders yet"}</Text>
              <Text style={styles.emptyText}>{tab === "new" ? "New customer orders will appear here automatically." : "Orders you have opened will be listed here."}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.eyebrow}>LUMO / ORDER</Text>
                <Text style={styles.sheetTitle}>#{selectedOrder?.id ?? "—"}</Text>
              </View>
              <Pressable onPress={() => setDetailVisible(false)} style={styles.headerIcon}>
                <Ionicons name="close" size={19} color={colors.text} />
              </Pressable>
            </View>
            {selectedOrder ? (
              <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailProduct}>
                  <Text style={styles.detailLabel}>PRODUCT</Text>
                  <Text style={styles.detailProductName}>{selectedOrder.product_name}</Text>
                  <Text style={styles.detailMuted}>{selectedOrder.product_sku || "No SKU"} · {selectedOrder.variant_name || "Standard option"}</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.detailMuted}>{selectedOrder.quantity} × {price(selectedOrder.unit_price, selectedOrder.currency)}</Text>
                    <Text style={styles.totalPrice}>{price(selectedOrder.subtotal, selectedOrder.currency)}</Text>
                  </View>
                </View>

                <View style={styles.detailPanel}>
                  <Text style={styles.detailLabel}>CUSTOMER</Text>
                  <Text style={styles.detailPrimary}>{selectedOrder.customer_name}</Text>
                  <Text style={styles.detailPhone}>{selectedOrder.customer_phone}</Text>
                  {selectedOrder.customer_address ? <Text style={styles.detailMuted}>{selectedOrder.customer_address}</Text> : null}
                  {selectedOrder.customer_note ? <Text style={styles.detailNote}>“{selectedOrder.customer_note}”</Text> : null}
                  <Pressable onPress={callCustomer} style={styles.callCustomer}>
                    <Ionicons name="call-outline" size={16} color={colors.bg} />
                    <Text style={styles.callCustomerText}>CALL CUSTOMER</Text>
                  </Pressable>
                </View>

                <View style={styles.detailPanel}>
                  <Text style={styles.detailLabel}>ORDER DETAILS</Text>
                  <View style={styles.detailLine}><Text style={styles.detailMuted}>Placed</Text><Text style={styles.detailValue}>{dateLabel(selectedOrder.created_at)}</Text></View>
                  <View style={styles.detailLine}><Text style={styles.detailMuted}>Status</Text><Text style={styles.detailValue}>{selectedOrder.status.toUpperCase()}</Text></View>
                  <View style={styles.detailLine}><Text style={styles.detailMuted}>Telegram</Text><Text style={styles.detailValue}>{selectedOrder.notification_status.toUpperCase()}</Text></View>
                </View>

                {selectedOrder.status !== "completed" ? (
                  <Pressable onPress={() => void markCompleted()} disabled={busy} style={[styles.completeButton, busy && styles.disabled]}>
                    {busy ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="checkmark-circle-outline" size={18} color={colors.bg} />}
                    <Text style={styles.completeButtonText}>MARK AS COMPLETED</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={removeOrder} disabled={busy} style={[styles.deleteButton, busy && styles.disabled]}>
                    <Ionicons name="trash-outline" size={17} color={colors.like} />
                    <Text style={styles.deleteButtonText}>DELETE ORDER</Text>
                  </Pressable>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 10 },
  header: { minHeight: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  headerIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  muted: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: "center" },
  summaryRow: { flexDirection: "row", gap: 8, paddingHorizontal: 17, marginTop: 15 },
  summaryCard: { flex: 1, paddingVertical: 13, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 },
  summaryValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  summaryLabel: { color: colors.dim, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  telegramTestButton: { minHeight: 38, marginHorizontal: 17, marginTop: 11, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  telegramTestText: { color: colors.accentStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  telegramTestSecondary: { minHeight: 33, marginTop: 6, backgroundColor: "transparent" },
  telegramTestSecondaryText: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.6 },
  tabs: { flexDirection: "row", marginHorizontal: 17, marginTop: 16, padding: 4, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  tab: { flex: 1, minHeight: 39, paddingHorizontal: 10, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  tabTextActive: { color: colors.bg },
  countPill: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  countText: { color: colors.accentStrong, fontSize: 8, fontWeight: "900" },
  listContent: { padding: 17, paddingTop: 13, paddingBottom: 35, gap: 10, flexGrow: 1 },
  orderCard: { padding: 14, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 7 },
  cardPressed: { opacity: 0.8 },
  orderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  orderNumber: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  statusNew: { backgroundColor: "rgba(228,180,91,0.13)" },
  statusProcessing: { backgroundColor: "rgba(117,157,204,0.13)" },
  statusCompleted: { backgroundColor: "rgba(91,166,125,0.13)" },
  statusText: { color: colors.text, fontSize: 7, fontWeight: "900", letterSpacing: 0.6 },
  productName: { color: colors.text, fontSize: 13, fontWeight: "900" },
  customerName: { color: colors.muted, fontSize: 9 },
  orderBottom: { marginTop: 4, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  orderDate: { color: colors.dim, fontSize: 8 },
  orderPrice: { color: colors.accentStrong, fontSize: 12, fontWeight: "900" },
  emptyState: { minHeight: 260, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 17, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", gap: 9 },
  emptyIcon: { width: 57, height: 57, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  emptyText: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: "center", maxWidth: 280 },
  errorPanel: { margin: 17, padding: 17, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8, alignItems: "center" },
  errorTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  retryButton: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceRaised, borderRadius: 9 },
  retryText: { color: colors.accentStrong, fontSize: 9, fontWeight: "900" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  detailSheet: { maxHeight: "90%", backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 17, paddingTop: 10, paddingBottom: 25 },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: colors.dim, marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  detailContent: { paddingBottom: 15, gap: 11 },
  detailProduct: { padding: 13, borderRadius: 13, backgroundColor: colors.surfaceRaised, gap: 6 },
  detailLabel: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  detailProductName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  detailMuted: { color: colors.muted, fontSize: 9, lineHeight: 15 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 3, gap: 10 },
  totalPrice: { color: colors.accentStrong, fontSize: 15, fontWeight: "900" },
  detailPanel: { padding: 13, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 7 },
  detailPrimary: { color: colors.text, fontSize: 13, fontWeight: "900" },
  detailPhone: { color: colors.accentStrong, fontSize: 11, fontWeight: "800" },
  detailNote: { color: colors.muted, fontSize: 10, lineHeight: 16, fontStyle: "italic" },
  callCustomer: { alignSelf: "flex-start", minHeight: 36, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
  callCustomerText: { color: colors.bg, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  detailLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  detailValue: { color: colors.text, fontSize: 9, fontWeight: "800" },
  completeButton: { minHeight: 44, borderRadius: 11, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  completeButtonText: { color: colors.bg, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  deleteButton: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: "rgba(220,95,95,0.32)", backgroundColor: "rgba(220,95,95,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  deleteButtonText: { color: colors.like, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  primaryButton: { minHeight: 39, paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.accent, justifyContent: "center", marginTop: 6 },
  primaryButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 25, backgroundColor: colors.bg, gap: 11 },
});