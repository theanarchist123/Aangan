import { Animated, View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { c, isDark } from "../theme";
import { useLoop } from "../ui";

const S = 250, M = S / 2;
const ticks = (n: number, r1: number, r2: number, color: string, w: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return <Line key={i} x1={M + Math.cos(a) * r1} y1={M + Math.sin(a) * r1} x2={M + Math.cos(a) * r2} y2={M + Math.sin(a) * r2} stroke={color} strokeWidth={i % 5 === 0 ? w * 1.8 : w} strokeLinecap="round" />;
  });

/** The tijori's combination dial. It idles gently; `open` (0 → 1) spins both rings against each other and swells. */
export function SafeDial({ open, unlocked }: { open: Animated.Value; unlocked: boolean }) {
  const idle = useLoop(26000);
  const glow = useLoop(1800, true);
  const gold = isDark() ? "#FFC861" : "#C07A16";
  const face = isDark() ? "#241C2F" : "#FFFDF8";
  const layer = { position: "absolute" as const, left: 0, top: 0, width: S, height: S };
  const spin = (turns: number) => open.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${turns}deg`] });

  return (
    <Animated.View style={{ width: S, height: S, transform: [{ scale: open.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.96, 1.18] }) }] }}>
      <Animated.View style={[layer, { borderRadius: M, backgroundColor: gold, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.14] }), transform: [{ scale: 1.1 }] }]} />
      <View style={layer}><Svg width={S} height={S}><Circle cx={M} cy={M} r={120} fill={face} stroke={c.line} strokeWidth={2} /></Svg></View>
      <Animated.View style={[layer, { transform: [{ rotate: idle.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]}>
        <Animated.View style={{ transform: [{ rotate: spin(540) }] }}>
          <Svg width={S} height={S}>{ticks(60, 103, 113, gold, 1.6)}</Svg>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[layer, { transform: [{ rotate: spin(-720) }] }]}>
        <Svg width={S} height={S}>
          <Circle cx={M} cy={M} r={86} fill="none" stroke={gold} strokeWidth={10} strokeDasharray="64 20" opacity={0.85} />
          {ticks(24, 66, 72, c.muted, 1.5)}
        </Svg>
      </Animated.View>
      <Animated.View style={[layer, { transform: [{ rotate: spin(360) }] }]}>
        <Svg width={S} height={S}>
          <Circle cx={M} cy={M} r={54} fill={isDark() ? "#3A2D3F" : "#2B1D12"} />
          <G stroke={gold} strokeWidth={7} strokeLinecap="round"><Path d={`M${M},${M - 54} V${M - 40} M${M},${M + 54} V${M + 40} M${M - 54},${M} H${M - 40} M${M + 54},${M} H${M + 40}`} /></G>
          <Circle cx={M} cy={M} r={37} fill="none" stroke={gold} strokeWidth={2} />
        </Svg>
      </Animated.View>
      <View style={[layer, { alignItems: "center", justifyContent: "center" }]}><Ionicons name={unlocked ? "lock-open" : "lock-closed"} size={34} color="#FFC861" /></View>
    </Animated.View>
  );
}
