import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Alert } from "../../lib/alert";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import {
  pickPostMedia,
  uploadPostMedia,
  type PickedPostMedia,
} from "../../lib/api";
import { colors } from "../../lib/theme";

export default function CreatePost() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const previewSize = Math.min(width - 32, 340);

  const [media, setMedia] = useState<PickedPostMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    try {
      const picked = await pickPostMedia();
      if (picked) setMedia(picked);
    } catch (error) {
      Alert.alert(
        "Media library unavailable",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const share = async () => {
    if (!media || busy) return;

    setBusy(true);

    try {
      const uploaded = await uploadPostMedia(media, me);
      const isVideo = media.type === "video";

      const { error } = await supabase.from("posts").insert({
        user_id: me,
        image_url: isVideo ? null : uploaded.publicUrl,
        video_url: isVideo ? uploaded.publicUrl : null,
        media_type: media.type,
        media_path: uploaded.path,
        media_mime_type: media.mimeType,
        media_file_name: media.fileName,
        caption: caption.trim() || null,
      });

      if (error) {
        await supabase.storage.from("images").remove([uploaded.path]);
        throw error;
      }

      setMedia(null);
      setCaption("");
      router.navigate("/(tabs)");
    } catch (error) {
      Alert.alert(
        "Could not share",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>New post</Text>
          <Text style={styles.subtitle}>
            Share a photo or a video with your community.
          </Text>
        </View>

        <Pressable
          onPress={choose}
          style={[
            styles.photoPicker,
            { width: previewSize, height: previewSize },
          ]}
        >
          {media?.type === "image" ? (
            <Image
              source={{ uri: media.uri }}
              style={styles.photoPreview}
              contentFit="cover"
            />
          ) : media?.type === "video" ? (
            <View style={styles.videoPreview}>
              <View style={styles.videoPreviewIcon}>
                <Ionicons name="play" size={30} color={colors.lime} />
              </View>
              <Text style={styles.videoPreviewTitle}>Video selected</Text>
              <Text style={styles.videoPreviewName} numberOfLines={2}>
                {media.fileName ?? "Selected video"}
              </Text>
              <Text style={styles.videoPreviewHint}>READY TO PUBLISH</Text>
            </View>
          ) : (
            <View style={styles.photoPrompt}>
              <View style={styles.photoIcon}>
                <Ionicons name="images-outline" size={30} color={colors.lime} />
              </View>
              <Text style={styles.photoPromptTitle}>Choose photo or video</Text>
              <Text style={styles.photoPromptHint}>
                Browse your media library
              </Text>
            </View>
          )}
        </Pressable>

        <View style={styles.form}>
          <Text style={styles.mediaHint}>
            Photos and videos · Maximum 50 MB · Videos up to 3 minutes
          </Text>

          <TextInput
            style={styles.caption}
            placeholder="Write a caption…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2200}
            value={caption}
            onChangeText={setCaption}
          />

          <Pressable
            style={[styles.button, (!media || busy) && { opacity: 0.5 }]}
            onPress={share}
            disabled={!media || busy}
          >
            {busy ? (
              <ActivityIndicator color="#090C12" />
            ) : (
              <Text style={styles.buttonText}>
                {media?.type === "video" ? "Publish video" : "Share post"}
              </Text>
            )}
          </Pressable>

          {!!media && (
            <Pressable onPress={choose} disabled={busy}>
              <Text style={styles.change}>Choose different media</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 7,
  },
  photoPicker: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoPreview: { width: "100%", height: "100%" },
  photoPrompt: { alignItems: "center", paddingHorizontal: 16 },
  photoIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  photoPromptTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  photoPromptHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 5,
  },
  videoPreview: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0D110C",
  },
  videoPreviewIcon: {
    width: 66,
    height: 66,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#202A18",
    borderWidth: 1,
    borderColor: "#3B4A2B",
    marginBottom: 17,
  },
  videoPreviewTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  videoPreviewName: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
  videoPreviewHint: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 15,
  },
  form: { padding: 16, paddingTop: 18, gap: 12 },
  mediaHint: {
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
  },
  caption: {
    minHeight: 70,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: "top",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.accentStrong,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#090C12",
    fontWeight: "900",
    fontSize: 16,
  },
  change: {
    textAlign: "center",
    color: colors.lime,
    fontWeight: "600",
  },
});