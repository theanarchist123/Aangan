import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { onWaking } from "../api";
import { c, f } from "../theme";

/** Soft notice while the (free-tier) server wakes from sleep, instead of a scary error. */
export function ConnectionBanner() {
  const [waking, setWaking] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => onWaking(setWaking), []);
  if (!waking) return null;
  return (
    <View accessibilityLiveRegion="polite" pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, top: insets.top + 8, zIndex: 50, backgroundColor: c.marigold, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
      <Text style={{ fontFamily: f.bold, fontSize: 13, color: "#2a1c00", textAlign: "center" }}>Waking the server… this can take up to a minute after a quiet spell.</Text>
    </View>
  );
}
