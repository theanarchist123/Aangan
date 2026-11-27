import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Svg, { Circle, Defs, G, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, isDark } from "../theme";

/** The art in the top corner: a marigold lamp glow at dusk, faint rangoli rings in sunlight. */
export function Backdrop() {
  return (
    <View style={{ pointerEvents: "none", position: "absolute", right: -130, top: -130, width: 380, height: 380 }}>
      {isDark() ? (
        <Svg width={380} height={380}>
          <Defs><RadialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><Stop offset="0" stopColor={c.glow} stopOpacity={0.3} /><Stop offset="0.65" stopColor={c.glow} stopOpacity={0.07} /><Stop offset="1" stopColor={c.glow} stopOpacity={0} /></RadialGradient></Defs>
          <Rect width={380} height={380} fill="url(#lamp)" />
        </Svg>
      ) : (
        <Svg width={380} height={380} opacity={0.5}>
          <G fill="none" stroke={c.glow} strokeWidth={1.5}><Circle cx={190} cy={190} r={58} /><Circle cx={190} cy={190} r={92} /><Circle cx={190} cy={190} r={126} /></G>
          <G fill={c.glow}>
            {Array.from({ length: 12 }, (_, i) => <Circle key={i} cx={190 + Math.cos((i / 12) * Math.PI * 2) * 126} cy={190 + Math.sin((i / 12) * Math.PI * 2) * 126} r={i % 3 ? 4 : 7} />)}
          </G>
        </Svg>
      )}
    </View>
  );
}

/** Scrolling page that respects the status bar and pulls to refresh. */
export function Screen({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [r, setR] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.ivory }}
      contentContainerStyle={{ paddingBottom: 28 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={r} progressViewOffset={insets.top} colors={[c.teal]} tintColor={c.teal} onRefresh={async () => { setR(true); await onRefresh(); setR(false); }} /> : undefined}
    >
      <Backdrop />
      <View style={{ padding: 18, paddingTop: insets.top + 14, gap: 16 }}>{children}</View>
    </ScrollView>
  );
}
