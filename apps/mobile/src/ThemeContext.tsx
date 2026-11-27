import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, useColorScheme, useWindowDimensions, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { applyPalette, dark, light } from "./theme";

export type ThemePref = "system" | "light" | "dark";
export type Origin = { x: number; y: number };
const KEY = "aangan.theme";
const BASE = 100; // diameter of the reveal circle before scaling

type Ctx = { pref: ThemePref; scheme: "light" | "dark"; setPref: (p: ThemePref, origin?: Origin) => void };
const ThemeCtx = createContext<Ctx>({ pref: "system", scheme: "light", setPref: () => {} });
export const useTheme = () => useContext(ThemeCtx);

async function load(): Promise<ThemePref> {
  try {
    const v = Platform.OS === "web" ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}
async function save(p: ThemePref) {
  try {
    if (Platform.OS === "web") { if (p === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); }
    else if (p === "system") await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, p);
  } catch {}
}

/**
 * Theme changes play as sunrise or nightfall: a circle of the new background grows from the tapped button (on the native
 * animation thread), the palette swaps while the screen is covered, then the cover fades away.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const [pref, setPrefState] = useState<ThemePref>("system");
  useEffect(() => { void load().then(setPrefState); }, []);
  const scheme = pref === "system" ? system : pref;
  applyPalette(scheme); // before children render, so they read the right colours

  const { width, height } = useWindowDimensions();
  const [veil, setVeil] = useState<(Origin & { to: "light" | "dark"; size: number }) | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const running = useRef(false);

  const setPref = useCallback((p: ThemePref, origin?: Origin) => {
    const next = p === "system" ? system : p;
    const commit = () => { setPrefState(p); void save(p); };
    if (running.current) return;
    if (next === scheme) return commit();
    running.current = true;
    const o = origin ?? { x: width / 2, y: height / 2 };
    const radius = Math.hypot(Math.max(o.x, width - o.x), Math.max(o.y, height - o.y));
    grow.setValue(0); fade.setValue(1);
    setVeil({ ...o, to: next, size: (radius * 2) / BASE + 0.4 });
    Animated.timing(grow, { toValue: 1, duration: 520, easing: Easing.bezier(0.6, 0, 0.25, 1), useNativeDriver: true }).start(() => {
      commit();
      // give React two frames to repaint underneath before lifting the cover
      requestAnimationFrame(() => requestAnimationFrame(() => {
        Animated.timing(fade, { toValue: 0, duration: 420, delay: 60, easing: Easing.out(Easing.quad), useNativeDriver: true })
          .start(() => { setVeil(null); running.current = false; });
      }));
    });
  }, [scheme, system, width, height, grow, fade]);

  const value = useMemo(() => ({ pref, scheme, setPref }), [pref, scheme, setPref]);
  return (
    <ThemeCtx.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {veil && (
          <Animated.View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden", opacity: fade, zIndex: 999 }}>
            <Animated.View style={{
              position: "absolute", left: veil.x - BASE / 2, top: veil.y - BASE / 2, width: BASE, height: BASE, borderRadius: BASE / 2,
              backgroundColor: (veil.to === "dark" ? dark : light).ivory,
              transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.01, veil.size] }) }],
            }} />
            <Animated.View style={{
              position: "absolute", left: width / 2 - 44, top: height / 2 - 44, width: 88, height: 88, alignItems: "center", justifyContent: "center",
              opacity: grow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
              transform: [{ rotate: grow.interpolate({ inputRange: [0, 1], outputRange: ["-120deg", "0deg"] }) }, { scale: grow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.4, 1] }) }],
            }}>
              <Ionicons name={veil.to === "dark" ? "moon" : "sunny"} size={72} color={veil.to === "dark" ? dark.teal : light.marigold} />
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </ThemeCtx.Provider>
  );
}
