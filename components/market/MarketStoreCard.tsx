import React from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../lib/theme";
import type { MarketStore } from "../../lib/market";

type Props = {
  store: MarketStore;
  onPress: () => void;
};

export default function MarketStoreCard({ store, onPress }: Props) {
  const ownerName =
    store.owner?.full_name?.trim() ||
    store.owner?.username ||
    "Store owner";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${store.name} store`}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.coverWrap}>
        {store.cover_url ? (
          <Image
            source={{ uri: store.cover_url }}
            style={styles.cover}
            contentFit="cover"
            transition={180}
          />
        ) : (
          <View style={styles.coverFallback}>
            <Ionicons name="storefront-outline" size={34} color={colors.dim} />
            <Text style={styles.coverFallbackText}>YOUR BRAND, YOUR SPACE</Text>
          </View>
        )}
        <View style={styles.coverShade} />
      </View>

      <View style={styles.identityRow}>
        <View style={styles.avatarWrap}>
          {store.avatar_url ? (
            <Image
              source={{ uri: store.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="storefront" size={23} color={colors.accentStrong} />
            </View>
          )}
        </View>

        <View style={styles.identityCopy}>
          <Text numberOfLines={1} style={styles.name}>
            {store.name}
          </Text>
          <Text numberOfLines={1} style={styles.owner}>
            by {ownerName}
          </Text>
        </View>

        <Ionicons name="arrow-forward" size={19} color={colors.muted} />
      </View>

      {store.description ? (
        <Text numberOfLines={2} style={styles.description}>
          {store.description}
        </Text>
      ) : (
        <Text style={styles.descriptionMuted}>
          Explore this store on Lumo Market
        </Text>
      )}

      <View style={styles.footer}>
        <View style={styles.location}>
          <Ionicons name="location-outline" size={13} color={colors.dim} />
          <Text numberOfLines={1} style={styles.locationText}>
            {[store.city, store.region].filter(Boolean).join(", ") || "Uzbekistan"}
          </Text>
        </View>
        <Text style={styles.visit}>VISIT STORE</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.87,
  },
  coverWrap: {
    height: 116,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  coverFallbackText: {
    color: colors.dim,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  coverShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,8,12,0.10)",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginTop: -22,
    gap: 10,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceRaised,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 20,
    gap: 3,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  owner: {
    color: colors.muted,
    fontSize: 10,
  },
  description: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingTop: 12,
    minHeight: 48,
  },
  descriptionMuted: {
    color: colors.dim,
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingTop: 12,
    minHeight: 48,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  location: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    color: colors.dim,
    fontSize: 10,
    flex: 1,
  },
  visit: {
    color: colors.accentStrong,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
});
