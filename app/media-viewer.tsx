import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import LumoVideoPlayer from "../components/LumoVideoPlayer";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";



export default function MediaViewer() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [imageLoading, setImageLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);

  const params = useLocalSearchParams<{
    url?: string | string[];
    type?: string | string[];
  }>();

  const url = Array.isArray(params.url) ? params.url[0] : params.url;
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const isVideo = rawType === "video";
  const isValidType = rawType === "image" || rawType === "video";
  const playerUrl = isVideo && url && !mediaError ? url : null;


  const goBack = () => router.back();

  return (
    <View style={lumoStyles.screen}>
      <StatusBar hidden />
      <Stack.Screen
        options={{
          headerShown: false,
          animation: "fade",
          gestureEnabled: true,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />

      <View style={lumoStyles.mediaStage}>
        {url && isValidType && !mediaError ? (
          isVideo ? (
            <LumoVideoPlayer uri={url} style={{ width, height }} topInset={90} bottomInset={24} />
          ) : (
            <>
              <Image
                source={{ uri: url }}
                style={lumoStyles.image}
                contentFit="contain"
                transition={220}
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageLoading(false);
                  setMediaError(true);
                }}
              />
              {imageLoading && (
                <View style={lumoStyles.loader} pointerEvents="none">
                  <ActivityIndicator size="large" color={colors.lime} />
                </View>
              )}
            </>
          )
        ) : (
          <View style={lumoStyles.errorState}>
            <View style={lumoStyles.errorIcon}>
              <Ionicons name="image-outline" size={30} color={colors.lime} />
            </View>
            <Text style={lumoStyles.errorTitle}>Media ochilmadi</Text>
            <Text style={lumoStyles.errorDescription}>
              {url && isValidType
                ? "Faylni yuklab bo‘lmadi. Internet aloqasini tekshiring va qayta urinib ko‘ring."
                : "Media manzili yoki turi topilmadi. Chatdan qayta ochib ko‘ring."}
            </Text>
            <Pressable onPress={goBack} style={lumoStyles.backButton}>
              <Text style={lumoStyles.backButtonText}>Orqaga qaytish</Text>
            </Pressable>
          </View>
        )}
      </View>

      <SafeAreaView edges={["top"]} pointerEvents="box-none" style={lumoStyles.topOverlay}>
        <View style={lumoStyles.topBar}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Yopish"
            hitSlop={12}
            style={({ pressed }) => [lumoStyles.closeButton, pressed && lumoStyles.buttonPressed]}
          >
            <Ionicons name="close" size={23} color={resolveThemeColor(colors.mediaText, "color")} />
          </Pressable>

          <View style={lumoStyles.titleContainer}>
            <View style={lumoStyles.brandRow}>
              <Image
                source={require('../assets/lumo-mark.png')}
                style={lumoStyles.brandLogo}
                contentFit="contain"
              />
              <Text style={lumoStyles.brand}>LUMO</Text>
            </View>
            <Text style={lumoStyles.subtitle}>{isVideo ? "VIDEO" : "PHOTO"}</Text>
          </View>

          <View style={lumoStyles.mediaBadge}>
            <Ionicons name={isVideo ? "videocam" : "image"} size={17} color={colors.lime} />
          </View>
        </View>
      </SafeAreaView>

      {!isVideo && (
        <SafeAreaView edges={["bottom"]} pointerEvents="none" style={lumoStyles.bottomOverlay}>
          <View style={lumoStyles.bottomContent}>
            <View style={lumoStyles.bottomLine} />
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mediaStage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  video: {
    width: "100%",
    height: "80%",
  },
  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(8,10,8,0.76)",
  },
  topBar: {
    minHeight: 70,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.95 }],
  },
  titleContainer: {
    flex: 1,
    gap: 3,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  brandLogo: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  brand: {
    color: colors.mediaText,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
  },
  mediaBadge: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomContent: {
    alignItems: "center",
    paddingVertical: 12,
  },
  bottomLine: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lime,
    opacity: 0.8,
  },
  errorState: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorIcon: {
    width: 68,
    height: 68,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    marginBottom: 4,
  },
  errorTitle: {
    color: colors.mediaText,
    fontSize: 20,
    fontWeight: "800",
  },
  errorDescription: {
    color: "#9993A7",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: "#7654E8",
    marginTop: 8,
  },
  backButtonText: {
    color: colors.mediaText,
    fontSize: 13,
    fontWeight: "800",
  },
});
