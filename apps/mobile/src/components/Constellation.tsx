import { useState } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Ellipse, Line } from "react-native-svg";
import type { Person } from "../api";
import { c, f, isDark } from "../theme";
import { Rise, Tap, useLoop } from "../ui";
import { callName } from "./HomeBlocks";
import { Mitthu } from "./Mitthu";

const H = 372, NODE = 58;
const RING: Record<string, string> = { sponsor: "#B27BD0", parent: "#E09A2B", relative: "#3FA987", neighbour: "#7C8CE0", secretary: "#7C8CE0", poa: "#C8735A", caregiver: "#E5707E" };

function Node({ p, x, y, on, index, onPress }: { p: Person; x: number; y: number; on: boolean; index: number; onPress: () => void }) {
  const float = useLoop(2200 + (index % 4) * 320, true);
  const ring = RING[p.role] ?? "#8C8478";
  return (
    <View style={{ position: "absolute", left: x - 38, top: y - NODE / 2, width: 76 }}>
      <Rise delay={140 + index * 80} from={24}>
        <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }] }}>
          <Tap accessibilityLabel={`${p.name}, ${p.role}`} accessibilityState={{ selected: on }} onPress={onPress} style={{ alignItems: "center", gap: 4 }}>
            <View style={{ width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: on ? 3.5 : 2, borderColor: ring, backgroundColor: on ? ring : c.card, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: f.serif, fontSize: 22, color: on ? "#fff" : c.ink }}>{callName(p.name)[0]}</Text>
              {p.is_emergency_contact && <View style={{ position: "absolute", right: -3, top: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: c.sos, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.ivory }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>!</Text></View>}
            </View>
            <Text numberOfLines={1} style={{ fontFamily: on ? f.xbold : f.semi, fontSize: 12, color: c.ink, backgroundColor: c.ivory, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden", maxWidth: 76 }}>{callName(p.name)}</Text>
          </Tap>
        </Animated.View>
      </Rise>
    </View>
  );
}

/** The family as a circle around the courtyard: parents on the inner ring, everyone else around them. */
export function Constellation({ people, selected, onSelect }: { people: Person[]; selected?: string; onSelect: (id: string) => void }) {
  const [w, setW] = useState(0);
  const breathe = useLoop(2600, true);
  const cx = w / 2, cy = H / 2 - 6;
  const inner = people.filter((p) => p.role === "parent");
  const outer = people.filter((p) => p.role !== "parent");
  const place = (list: Person[], rx: number, ry: number, start: number) => list.map((p, i) => {
    const a = start + (i / Math.max(1, list.length)) * Math.PI * 2;
    return { p, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
  const spots = w ? [...place(inner, w * 0.24, 66, Math.PI), ...place(outer, w * 0.39, 150, -Math.PI / 2)] : [];

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 && (
        <>
          <Svg width={w} height={H} style={{ position: "absolute" }}>
            {[[w * 0.24, 66], [w * 0.39, 150]].map(([rx, ry]) => <Ellipse key={ry} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={c.line} strokeWidth={1.5} strokeDasharray="3 7" />)}
            {spots.map((s) => <Line key={s.p.id} x1={cx} y1={cy} x2={s.x} y2={s.y} stroke={s.p.id === selected ? c.teal : c.line} strokeWidth={s.p.id === selected ? 2.5 : 1} />)}
          </Svg>
          <Animated.View style={{ position: "absolute", left: cx - 40, top: cy - 40, width: 80, height: 80, borderRadius: 40, backgroundColor: isDark() ? "#2F2440" : "#FBEBCB", alignItems: "center", justifyContent: "center", transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] }} />
          <View style={{ pointerEvents: "none", position: "absolute", left: cx - 27, top: cy - 34 }}><Mitthu size={54} /></View>
          {spots.map((s, i) => <Node key={s.p.id} index={i} p={s.p} x={s.x} y={s.y} on={s.p.id === selected} onPress={() => onSelect(s.p.id)} />)}
        </>
      )}
    </View>
  );
}
