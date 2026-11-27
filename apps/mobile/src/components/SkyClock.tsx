import { useEffect, useState } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { f } from "../theme";
import { useLoop } from "../ui";
import { Mitthu } from "./Mitthu";

type Sky = "day" | "dusk" | "night";
const SKY: Record<Sky, { bg: string; fg: string; sub: string }> = {
  day: { bg: "#FFB547", fg: "#2B1600", sub: "#5A3A08" },
  dusk: { bg: "#E8765A", fg: "#2A0E08", sub: "#45150C" },
  night: { bg: "#1C2340", fg: "#F2EFFF", sub: "#B4BCE0" },
};

export function hourIn(tz: string | undefined, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now)) % 24;
  } catch { return now.getHours(); }
}
export function timeIn(tz: string | undefined, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  } catch { return now.toLocaleTimeString(); }
}
export function dayIn(tz: string | undefined, now: Date, opts: Intl.DateTimeFormatOptions): string {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(now); }
  catch { return now.toDateString(); }
}
export const skyFor = (h: number): Sky => (h >= 6 && h < 17 ? "day" : (h >= 17 && h < 20) || h === 5 ? "dusk" : "night");

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** A sun that slowly turns, or a moon with twinkling stars. */
function Orb({ sky, color }: { sky: Sky; color: string }) {
  const turn = useLoop(14000);
  const twinkle = useLoop(1500, true);
  if (sky === "night") {
    return (
      <View style={{ width: 62, height: 34 }}>
        <Svg width={28} height={28} viewBox="0 0 24 24"><Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#E9E4FF" /></Svg>
        <Animated.View style={{ position: "absolute", left: 34, top: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: "#fff", opacity: twinkle }} />
        <Animated.View style={{ position: "absolute", left: 52, top: 16, width: 3, height: 3, borderRadius: 2, backgroundColor: "#fff", opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) }} />
        <Animated.View style={{ position: "absolute", left: 36, top: 25, width: 2, height: 2, borderRadius: 1, backgroundColor: "#fff", opacity: twinkle }} />
      </View>
    );
  }
  return (
    <Animated.View style={{ width: 34, height: 34, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
      <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
        <Circle cx={12} cy={12} r={4.6} fill="#FFF1C9" />
        <Path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
      </Svg>
    </Animated.View>
  );
}

/** Signature element: your sky and their sky, matched to each one's real local time, with Mitthu perched between. */
export function SkyClock({ you, them, youLabel, themLabel, themWeather }: { you: string; them: string; youLabel: string; themLabel: string; themWeather?: string }) {
  const now = useNow();
  const cells = [{ label: youLabel, tz: you, extra: "" }, { label: themLabel, tz: them, extra: themWeather ?? "" }];
  return (
    <View style={{ height: 150, borderRadius: 28, overflow: "hidden", flexDirection: "row" }}>
      {cells.map((cell, i) => {
        const sky = skyFor(hourIn(cell.tz, now));
        const s = SKY[sky];
        const right = i === 1;
        return (
          <View key={i} style={{ flex: 1, backgroundColor: s.bg, padding: 15, justifyContent: "space-between", alignItems: right ? "flex-end" : "flex-start" }}>
            <Orb sky={sky} color={s.fg} />
            <View style={{ alignItems: right ? "flex-end" : "flex-start" }}>
              <Text numberOfLines={1} style={{ color: s.sub, fontFamily: f.bold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", maxWidth: 130 }}>{cell.label}</Text>
              <Text style={{ color: s.fg, fontFamily: f.display, fontSize: 30 }}>{timeIn(cell.tz, now).toLowerCase()}</Text>
              <Text numberOfLines={1} style={{ color: s.sub, fontFamily: f.semi, fontSize: 11.5, maxWidth: 130, minHeight: 15 }}>{cell.extra}</Text>
            </View>
          </View>
        );
      })}
      <View style={{ pointerEvents: "none", position: "absolute", left: 0, right: 0, top: 12, alignItems: "center" }}><Mitthu size={78} /></View>
    </View>
  );
}
