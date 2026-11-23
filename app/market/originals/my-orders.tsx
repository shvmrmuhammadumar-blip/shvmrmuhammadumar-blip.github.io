import React, { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../../lib/auth";
import { getOfficialOrders, type OfficialOrder } from "../../../lib/market-orders";
import { colors } from "../../../lib/theme";
import { useThemedStyles } from "../../../lib/theme-styles";

function price(value: number, currency: "USD" | "UZS") {
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(value) || 0);
  return currency === "USD" ? "$" + amount : amount + " UZS";
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

function statusLabel(status: OfficialOrder["status"]) {
  if (status === "completed") return "COMPLETED";
  if (status === "processing") return "IN PROGRESS";
  return "RECEIVED";
}

export default function MyOfficialOrdersScreen() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [orders, setOrders] = useState<OfficialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const rows = await getOfficialOrders({ createdBy: userId });
      setOrders(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return (
    <View style={lumoStyles.root}>
      <View style={lumoStyles.header}>
        <Pressable onPress={() => router.back()} style={lumoStyles.iconButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={19} color={colors.text} />
        </Pressable>
        <View style={lumoStyles.headerCopy}>
          <Text style={lumoStyles.eyebrow}>LUMO ORIGINALS</Text>
          <Text style={lumoStyles.title}>My orders</Text>
        </View>
        <Pressable onPress={() => void load(true)} style={lumoStyles.iconButton} accessibilityLabel="Refresh my orders">
          {refreshing ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="refresh" size={18} color={colors.accentStrong} />}
        </Pressable>
      </View>

      <View style={lumoStyles.intro}>
        <View style={lumoStyles.introIcon}><Ionicons name="receipt-outline" size={21} color={colors.accentStrong} /></View>
        <View style={lumoStyles.introCopy}>
          <Text style={lumoStyles.introTitle}>Your order history</Text>
          <Text style={lumoStyles.introText}>Buy from Lumo Originals and follow every order here.</Text>
        </View>
        <Text style={lumoStyles.count}>{orders.length}</Text>
      </View>

      {loading ? (
        <View style={lumoStyles.center}><ActivityIndicator size="large" color={colors.accentStrong} /><Text style={lumoStyles.muted}>Loading your orders...</Text></View>
      ) : error ? (
        <View style={lumoStyles.center}>
          <Ionicons name="alert-circle-outline" size={27} color={colors.like} />
          <Text style={lumoStyles.emptyTitle}>Could not load orders</Text>
          <Text style={lumoStyles.muted}>{error}</Text>
          <Pressable onPress={() => void load(true)} style={lumoStyles.primaryButton}><Text style={lumoStyles.primaryButtonText}>Try again</Text></Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={lumoStyles.list} showsVerticalScrollIndicator={false}>
          {orders.length ? orders.map((order) => (
            <View key={order.id} style={lumoStyles.card}>
              <View style={lumoStyles.cardTop}>
                <Text style={lumoStyles.orderNumber}>ORDER #{order.id}</Text>
                <View style={[lumoStyles.status, order.status === "completed" ? lumoStyles.completed : order.status === "processing" ? lumoStyles.processing : lumoStyles.received]}>
                  <Text style={lumoStyles.statusText}>{statusLabel(order.status)}</Text>
                </View>
              </View>
              <Text style={lumoStyles.productName}>{order.product_name}</Text>
              <Text style={lumoStyles.meta}>{order.product_sku || "Lumo Originals"} · {order.variant_name || "Standard option"}</Text>
              <View style={lumoStyles.details}>
                <Text style={lumoStyles.meta}>{order.quantity} × {price(order.unit_price, order.currency)}</Text>
                <Text style={lumoStyles.total}>{price(order.subtotal, order.currency)}</Text>
              </View>
              <View style={lumoStyles.footer}>
                <Ionicons name="time-outline" size={13} color={colors.dim} />
                <Text style={lumoStyles.date}>{dateLabel(order.created_at)}</Text>
              </View>
              {order.customer_note ? <Text style={lumoStyles.note}>Note: {order.customer_note}</Text> : null}
            </View>
          )) : (
            <View style={lumoStyles.empty}>
              <View style={lumoStyles.emptyIcon}><Ionicons name="bag-handle-outline" size={27} color={colors.muted} /></View>
              <Text style={lumoStyles.emptyTitle}>No orders yet</Text>
              <Text style={lumoStyles.muted}>Your Lumo Originals purchases will appear here.</Text>
              <Pressable onPress={() => router.replace("/(tabs)/market" as never)} style={lumoStyles.primaryButton}>
                <Text style={lumoStyles.primaryButtonText}>Explore Originals</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.bg} />
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 10 },
  header: { minHeight: 56, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  iconButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  intro: { marginHorizontal: 17, marginTop: 13, marginBottom: 13, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  introIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  introCopy: { flex: 1, gap: 3 },
  introTitle: { color: colors.text, fontSize: 11, fontWeight: "900" },
  introText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  count: { color: colors.accentStrong, fontSize: 17, fontWeight: "900" },
  list: { padding: 17, paddingTop: 0, paddingBottom: 35, gap: 10, flexGrow: 1 },
  card: { padding: 14, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 7 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  orderNumber: { color: colors.dim, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  received: { backgroundColor: "rgba(228,180,91,0.13)" },
  processing: { backgroundColor: "rgba(117,157,204,0.13)" },
  completed: { backgroundColor: "rgba(91,166,125,0.13)" },
  statusText: { color: colors.text, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  productName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  details: { paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  total: { color: colors.accentStrong, fontSize: 13, fontWeight: "900" },
  footer: { flexDirection: "row", alignItems: "center", gap: 5 },
  date: { color: colors.dim, fontSize: 8 },
  note: { color: colors.muted, fontSize: 9, lineHeight: 14, fontStyle: "italic" },
  empty: { minHeight: 290, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 17, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", gap: 10 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  muted: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: "center", maxWidth: 300 },
  primaryButton: { minHeight: 40, marginTop: 5, paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryButtonText: { color: colors.bg, fontSize: 10, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 25, backgroundColor: colors.bg, gap: 11 },
});
