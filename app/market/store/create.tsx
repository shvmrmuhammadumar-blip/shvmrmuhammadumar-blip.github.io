import React, { useState } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import {
  createMarketStore,
  getMarketStoreById,
  type MarketImageAsset,
} from "../../../lib/market";
import { colors } from "../../../lib/theme";

export default function CreateStoreScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("Tashkent Region");
  const [city, setCity] = useState("Chinoz");
  const [avatar, setAvatar] = useState<MarketImageAsset | null>(null);
  const [cover, setCover] = useState<MarketImageAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const pickImage = async (type: "avatar" | "cover") => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Allow photo library access to select your store image.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: type === "avatar" ? [1, 1] : [16, 6],
        quality: 0.88,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const selected = result.assets[0];

      const image: MarketImageAsset = {
        uri: selected.uri,
        fileName: selected.fileName || `store-${type}.jpg`,
        mimeType: selected.mimeType || "image/jpeg",
        fileSize: selected.fileSize,
      };

      if (type === "avatar") setAvatar(image);
      else setCover(image);
    } catch (error) {
      Alert.alert(
        "Image error",
        error instanceof Error ? error.message : "Could not select image.",
      );
    }
  };

  const submit = async () => {
    if (!userId) {
      Alert.alert("Sign in required", "Log in to create a store.");
      return;
    }

    if (name.trim().length < 2) {
      Alert.alert("Store name", "Enter a name with at least 2 characters.");
      return;
    }

    setSaving(true);

    try {
      const storeId = await createMarketStore({
        ownerId: userId,
        name,
        description,
        region,
        city,
        avatar,
        cover,
      });

      const createdStore = await getMarketStoreById(storeId);

      router.replace(`/market/store/${createdStore.slug}` as never);
    } catch (error) {
      Alert.alert(
        "Could not create store",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={18} color={colors.muted} />
            <Text style={styles.backText}>Back to Market</Text>
          </Pressable>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>LUMO MARKET / SELLER SPACE</Text>
            <Text style={styles.title}>Create your store.</Text>
            <Text style={styles.subtitle}>
              Build a storefront for your business, brand or personal shop.
              Customize its identity and publish products in one place.
            </Text>
          </View>

          <View style={styles.freeBanner}>
            <View style={styles.freeIcon}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
            <View style={styles.freeCopy}>
              <Text style={styles.freeTitle}>Your store is free</Text>
              <Text style={styles.freeDescription}>
                No store creation fee, no listing fees and no sales commission.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Store identity</Text>
              <Text style={styles.sectionCaption}>
                Make your storefront recognizable.
              </Text>
            </View>

            <Pressable
              onPress={() => void pickImage("cover")}
              style={styles.coverPicker}
            >
              {cover ? (
                <Image
                  source={{ uri: cover.uri }}
                  style={styles.coverPreview}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={27}
                    color={colors.muted}
                  />
                  <Text style={styles.coverText}>Add store cover</Text>
                  <Text style={styles.coverHint}>Wide banner · JPG, PNG, WebP</Text>
                </View>
              )}

              <View style={styles.coverEdit}>
                <Ionicons name="camera-outline" size={15} color={colors.text} />
                <Text style={styles.coverEditText}>
                  {cover ? "Change cover" : "Upload cover"}
                </Text>
              </View>
            </Pressable>

            <View style={styles.logoRow}>
              <Pressable
                onPress={() => void pickImage("avatar")}
                style={styles.logoPicker}
              >
                {avatar ? (
                  <Image
                    source={{ uri: avatar.uri }}
                    style={styles.logoPreview}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons
                      name="storefront-outline"
                      size={27}
                      color={colors.muted}
                    />
                  </View>
                )}

                <View style={styles.logoCamera}>
                  <Ionicons name="camera" size={12} color={colors.bg} />
                </View>
              </Pressable>

              <View style={styles.logoCopy}>
                <Text style={styles.logoTitle}>Store logo</Text>
                <Text style={styles.logoDescription}>
                  Choose a square image that represents your store.
                </Text>
                <Pressable onPress={() => void pickImage("avatar")}>
                  <Text style={styles.uploadLink}>
                    {avatar ? "Change logo" : "Upload logo"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Store information</Text>
              <Text style={styles.sectionCaption}>
                Tell people what your store offers.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>STORE NAME *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Urban Objects"
              placeholderTextColor={colors.dim}
              maxLength={80}
              style={styles.input}
            />
            <Text style={styles.counter}>{name.length}/80</Text>

            <Text style={styles.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your brand, products and what makes your store different..."
              placeholderTextColor={colors.dim}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              style={[styles.input, styles.textArea]}
            />
            <Text style={styles.counter}>{description.length}/2000</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Store location</Text>
              <Text style={styles.sectionCaption}>
                Help nearby customers discover you.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>REGION</Text>
            <TextInput
              value={region}
              onChangeText={setRegion}
              placeholder="Region"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>CITY / DISTRICT</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City or district"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
          </View>

          <View style={styles.bottomNote}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.muted}
            />
            <Text style={styles.bottomNoteText}>
              You can update your logo, banner, description and location later
              from Store Manager.
            </Text>
          </View>

          <Pressable
            onPress={() => void submit()}
            disabled={saving || name.trim().length < 2}
            style={[
              styles.submitButton,
              (saving || name.trim().length < 2) && styles.submitDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <>
                <Ionicons name="storefront" size={18} color={colors.bg} />
                <Text style={styles.submitText}>Create my store</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.bg} />
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { alignItems: "center", padding: 18, paddingBottom: 45 },
  container: { width: "100%", maxWidth: 900, gap: 23 },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 39,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  heading: { gap: 8 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 31, fontWeight: "900", letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, maxWidth: 650 },
  freeBanner: {
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  freeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  freeCopy: { flex: 1, gap: 3 },
  freeTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  freeDescription: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  section: {
    padding: 17,
    gap: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 19,
  },
  sectionHeading: { gap: 4, marginBottom: 3 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  sectionCaption: { color: colors.muted, fontSize: 10 },
  coverPicker: {
    width: "100%",
    aspectRatio: 16 / 5,
    minHeight: 125,
    maxHeight: 220,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  coverPreview: { width: "100%", height: "100%" },
  coverPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  coverText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  coverHint: { color: colors.dim, fontSize: 9 },
  coverEdit: {
    position: "absolute",
    bottom: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "rgba(9,12,18,0.88)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  coverEditText: { color: colors.text, fontSize: 9, fontWeight: "800" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 5 },
  logoPicker: { width: 76, height: 76, position: "relative" },
  logoPreview: { width: 76, height: 76, borderRadius: 22 },
  logoPlaceholder: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCamera: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 25,
    height: 25,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  logoCopy: { flex: 1, gap: 4 },
  logoTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  logoDescription: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  uploadLink: { color: colors.accentStrong, fontSize: 10, fontWeight: "800", marginTop: 2 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "900",
    marginTop: 4,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: 12,
  },
  textArea: { minHeight: 110, paddingTop: 12, lineHeight: 19 },
  counter: { color: colors.dim, fontSize: 9, textAlign: "right", marginTop: -7 },
  bottomNote: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  bottomNoteText: { flex: 1, color: colors.dim, fontSize: 10, lineHeight: 16 },
  submitButton: {
    minHeight: 52,
    paddingHorizontal: 17,
    borderRadius: 14,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: colors.bg, fontSize: 12, fontWeight: "900" },
});
