import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { AlertButton } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { subscribeAlert, type AlertPayload } from "../lib/alert";
import { colors } from "../lib/theme";
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


export default function LumoAlertHost() {
  const lumoStyles = useThemedStyles(styles);
  const [queue, setQueue] = useState<AlertPayload[]>([]);

  useEffect(() => subscribeAlert((p) => setQueue((q) => [...q, p])), []);

  const current = queue[0];
  const close = () => setQueue((q) => q.slice(1));

  const buttons: AlertButton[] =
    current?.buttons && current.buttons.length > 0 ? current.buttons : [{ text: "OK" }];

  const isError = /error|invalid|fail|not sent|unavailable|could not|xato/i.test(
    `${current?.title ?? ""} ${current?.message ?? ""}`,
  );

  return (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={close}>
      <View style={lumoStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        {current && (
          <View style={lumoStyles.card}>
            <View style={[lumoStyles.icon, isError && lumoStyles.iconError]}>
              <Ionicons
                name={isError ? "alert-circle-outline" : "sparkles-outline"}
                size={24}
                color={isError ? colors.danger : colors.lime}
              />
            </View>
            <Text style={lumoStyles.eyebrow}>LUMO</Text>
            <Text style={lumoStyles.title}>{current.title}</Text>
            {!!current.message && <Text style={lumoStyles.body}>{current.message}</Text>}
            <View style={lumoStyles.buttons}>
              {buttons.map((b, i) => {
                const cancel = b.style === "cancel";
                const destructive = b.style === "destructive";
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      close();
                      b.onPress?.();
                    }}
                    style={({ pressed }) => [
                      lumoStyles.btn,
                      cancel ? lumoStyles.btnCancel : destructive ? lumoStyles.btnDanger : lumoStyles.btnMain,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={[lumoStyles.btnText, cancel && { color: colors.text }, destructive && { color: colors.text }]}>
                      {b.text ?? "OK"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(5,4,9,0.74)" },
  card: {
    width: "100%", maxWidth: 380, alignItems: "center", padding: 24, borderRadius: 24,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  icon: {
    width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center",
    marginBottom: 14, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border,
  },
  iconError: { backgroundColor: "#241619", borderColor: "#58303D" },
  eyebrow: { color: colors.lime, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  title: { color: colors.text, fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 6 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16, alignSelf: "stretch" },
  btn: { flexGrow: 1, flexBasis: "40%", minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnMain: { backgroundColor: colors.lime },
  btnCancel: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: "#742C3D" },
  btnText: { color: colors.bg, fontSize: 13, fontWeight: "900" },
});