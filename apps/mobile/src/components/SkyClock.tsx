import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { f } from "../theme";

type Sky = "day" | "dusk" | "night";
const GRAD: Record<Sky, [string, string]> = { day: ["#8FD3FF", "#FFEEC7"], dusk: ["#F6A96B", "#FFD9A0"], night: ["#14224A", "#31407A"] };
const ICON: Record<Sky, keyof typeof Ionicons.glyphMap> = { day: "sunny", dusk: "partly-sunny", night: "moon" };

export function hourIn(tz: string | undefined, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now)) % 24;
  } catch { return now.getHours(); }
}
function textIn(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  } catch { return now.toLocaleTimeString(); }
}
export const skyFor = (h: number): Sky => (h >= 6 && h < 17 ? "day" : (h >= 17 && h < 20) || h === 5 ? "dusk" : "night");

/** Signature element: two clocks, each with a sky that matches that person's actual time of day. */
export function SkyClock({ you, them, youLabel, themLabel, themWeather }: { you: string; them: string; youLabel: string; themLabel: string; themWeather?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const cells = [{ label: youLabel, tz: you }, { label: themLabel, tz: them }];
  return (
    <View style={{ flexDirection: "row", borderRadius: 22, overflow: "hidden" }}>
      {cells.map((cell) => {
        const sky = skyFor(hourIn(cell.tz, now));
        const fg = sky === "night" ? "#fff" : "#1F2A2E";
        return (
          <LinearGradient key={cell.label} colors={GRAD[sky]} style={{ flex: 1, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: fg, opacity: 0.85, fontFamily: f.semi, fontSize: 12 }}>{cell.label}</Text>
              <Text style={{ color: fg, fontFamily: f.serif, fontSize: 21 }}>{textIn(cell.tz, now)}</Text>
              {cell.label === themLabel && !!themWeather && <Text style={{ color: fg, opacity: 0.85, fontFamily: f.semi, fontSize: 12 }}>{themWeather}</Text>}
            </View>
            <Ionicons name={ICON[sky]} size={24} color={fg} />
          </LinearGradient>
        );
      })}
    </View>
  );
}
