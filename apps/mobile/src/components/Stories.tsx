import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Story } from "../api";
import { f } from "../theme";
import { Mitthu } from "./Mitthu";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { medicines: "medkit", checkin: "sunny", task: "checkmark-done" };
const DURATION = 4500;

/** "Maa's Day": tap-through stories, the daily habit loop. */
export function Stories({ stories, onClose }: { stories: Story[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const p = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const s = stories[i];

  useEffect(() => {
    p.setValue(0);
    const anim = Animated.timing(p, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) setI((n) => (n < stories.length - 1 ? n + 1 : n)); });
    return () => anim.stop();
  }, [i, p, stories.length]);

  if (!s) return null;
  return (
    <Modal animationType="fade" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={["#2B1F3F", "#16111E"]} style={{ flex: 1, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }}>
        <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 14 }}>
          {stories.map((_, n) => (
            <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
              <Animated.View style={{ height: 4, backgroundColor: "#fff", width: n < i ? "100%" : n === i ? p.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : "0%" }} />
            </View>
          ))}
        </View>
        <Pressable accessibilityLabel="Close stories" onPress={onClose} style={{ position: "absolute", right: 14, top: insets.top + 24, padding: 10, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", zIndex: 5 }}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Pressable accessibilityLabel="Previous story" style={{ flex: 1 }} onPress={() => setI((n) => Math.max(0, n - 1))} />
          <Pressable accessibilityLabel="Next story" style={{ flex: 2 }} onPress={() => (i >= stories.length - 1 ? onClose() : setI(i + 1))} />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 18 }}>
          <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(255,200,97,0.18)", borderWidth: 1.5, borderColor: "#FFC861", alignItems: "center", justifyContent: "center" }}><Ionicons name={ICON[s.kind] ?? "flower"} size={52} color="#FFC861" /></View>
          <Text style={{ fontFamily: f.serif, fontSize: 30, color: "#fff", textAlign: "center", lineHeight: 38 }}>{s.title}</Text>
          <Text style={{ fontFamily: f.semi, fontSize: 16, color: "rgba(255,255,255,0.85)" }}>{s.ok ? "✓ All good" : "A gentle nudge may help"}</Text>
          <Mitthu mood={s.ok ? "celebrate" : "idle"} size={96} />
        </View>
      </LinearGradient>
    </Modal>
  );
}
