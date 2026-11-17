import React from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../lib/theme";
import type { MarketListing } from "../../lib/market";

type Props = {
  item: MarketListing;
  onPress: () => void;
  own?: boolean;
};

function formatPrice(item: MarketListing) {
  if (item.price === null) return "Price on request";
  if (item.price === 0) return "Free";

  const amount = new Intl.NumberFormat("uz-UZ", {
    maximumFractionDigits: 0,
  }).format(item.price);

  return item.currency === "USD" ? `$${amount}` : `${amount} so'm`;
}

export default function MarketListingCard({
  item,
  onPress,
  own = false,
}: Props) {
  const image = item.images[0];
  const sellerName =
    item.seller?.full_name?.trim() ||
    item.seller?.username ||
    "Lumo member";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.imageWrap}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={styles.image}
            contentFit="cover"
            transition={180}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons
              name={item.kind === "service" ? "construct-outline" : "cube-outline"}
              size={34}
              color={colors.dim}
            />
            <Text style={styles.noImage}>No image</Text>
          </View>
        )}

        <View style={styles.kindBadge}>
          <Text style={styles.kindText}>
            {item.kind === "service" ? "SERVICE" : "PRODUCT"}
          </Text>
        </View>

        {own && item.status !== "active" ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.category}>
          {item.category}
        </Text>

        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>

        <Text numberOfLines={1} style={styles.price}>
          {formatPrice(item)}
        </Text>

        {item.is_negotiable ? (
          <Text style={styles.negotiable}>Price is negotiable</Text>
        ) : (
          <View style={styles.negotiableSpacer} />
        )}

        <View style={styles.footer}>
          <View style={styles.location}>
            <Ionicons
              name="location-outline"
              size={12}
              color={colors.dim}
            />
            <Text numberOfLines={1} style={styles.locationText}>
              {[item.city, item.region].filter(Boolean).join(", ") || "Uzbekistan"}
            </Text>
          </View>

          <Text numberOfLines={1} style={styles.seller}>
            {sellerName}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "48%",
    flexGrow: 1,
    maxWidth: "49%",
    minWidth: 0,
    overflow: "hidden",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 1.05,
    backgroundColor: colors.surfaceRaised,
    position: "relative",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  noImage: {
    color: colors.dim,
    fontSize: 10,
    fontWeight: "600",
  },
  kindBadge: {
    position: "absolute",
    left: 9,
    top: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "rgba(9,12,18,0.86)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  kindText: {
    color: colors.accentStrong,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  statusBadge: {
    position: "absolute",
    right: 8,
    top: 9,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "rgba(9,12,18,0.88)",
  },
  statusText: {
    color: colors.accentStrong,
    fontSize: 8,
    fontWeight: "800",
  },
  body: {
    padding: 11,
    gap: 5,
  },
  category: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    minHeight: 36,
  },
  price: {
    color: colors.accentStrong,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  negotiable: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "600",
  },
  negotiableSpacer: {
    height: 13,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 5,
    gap: 4,
  },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  locationText: {
    color: colors.dim,
    fontSize: 9,
    flex: 1,
  },
  seller: {
    color: colors.muted,
    fontSize: 9,
  },
});
