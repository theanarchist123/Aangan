import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";

const ACircle = Animated.createAnimatedComponent(Circle);
export type RingSpec = { label: string; value: number; color: string };

function Ring({ r, size, stroke, color, value, delay }: { r: number; size: number; stroke: number; color: string; value: number; delay: number }) {
  const p = useRef(new Animated.Value(0)).current;
  const circ = 2 * Math.PI * r;
  useEffect(() => {
    Animated.timing(p, { toValue: Math.min(1, Math.max(0, value)), duration: 900, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, delay, p]);
  const offset = p.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  return (
    <>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.18} strokeWidth={stroke} fill="none" />
      <ACircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none"
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset as unknown as number} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
    </>
  );
}

export function Rings({ rings, size = 88 }: { rings: RingSpec[]; size?: number }) {
  const stroke = size * 0.1;
  return (
    <Svg width={size} height={size} accessibilityLabel={rings.map((r) => `${r.label} ${Math.round(r.value * 100)} percent`).join(", ")}>
      {rings.map((r, i) => <Ring key={r.label} size={size} stroke={stroke} r={size / 2 - stroke / 2 - i * (stroke + 3)} color={r.color} value={r.value} delay={i * 150} />)}
    </Svg>
  );
}
