import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { applyPalette } from "./theme";

export type ThemePref = "system" | "light" | "dark";
const KEY = "aangan.theme";

type Ctx = { pref: ThemePref; scheme: "light" | "dark"; setPref: (p: ThemePref) => void };
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const [pref, setPrefState] = useState<ThemePref>("system");
  useEffect(() => { void load().then(setPrefState); }, []);
  const scheme = pref === "system" ? system : pref;
  applyPalette(scheme); // before children render, so they read the right colours
  const setPref = useCallback((p: ThemePref) => { setPrefState(p); void save(p); }, []);
  const value = useMemo(() => ({ pref, scheme, setPref }), [pref, scheme, setPref]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
