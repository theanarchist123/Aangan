import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Mitthu, type Mood } from "./components/Mitthu";
import { useTheme } from "./ThemeContext";
import { c, f, isDark, shadow } from "./theme";

export type IconName = keyof typeof Ionicons.glyphMap;
export type Tab = "home" | "tasks" | "vault" | "family" | "safety";

// Styles are built per render (not once at import) so they always use the current light/dark palette.
const mk = () => StyleSheet.create({
  body: { fontFamily: f.reg, fontSize: 15, color: c.ink, lineHeight: 21 },
  title: { fontFamily: f.display, fontSize: isDark() ? 38 : 33, lineHeight: isDark() ? 41 : 38, color: c.ink },
  big: { fontFamily: f.display, fontSize: 34, color: c.teal },
  h2: { fontFamily: f.serif, fontSize: isDark() ? 23 : 19.5, color: c.ink },
  muted: { fontFamily: f.reg, fontSize: 13.5, color: c.muted, lineHeight: 19 },
  kicker: { fontFamily: f.xbold, fontSize: 11, letterSpacing: 1.1, color: c.muted, textTransform: "uppercase" },
  card: { backgroundColor: c.card, borderRadius: 24, padding: 16, borderWidth: 1, borderColor: c.line, ...(isDark() ? {} : shadow) },
  btn: { minHeight: 52, borderRadius: isDark() ? 16 : 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 22 },
});

export function Txt({ children, style, variant = "body", ...rest }: { children?: ReactNode; style?: StyleProp<TextStyle>; variant?: "body" | "title" | "h2" | "muted" | "kicker" | "big" } & React.ComponentProps<typeof Text>) {
  return <Text {...rest} style={[mk()[variant], style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[mk().card, style]}>{children}</View>;
}

/** A touchable that springs down under the finger. `style` styles the visible surface, `wrap` the touch box around it. */
export function Tap({ children, style, wrap, disabled, scaleTo = 0.96, ...rest }: Omit<PressableProps, "style" | "children"> & { children: ReactNode; style?: StyleProp<ViewStyle>; wrap?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const s = useRef(new Animated.Value(1)).current;
  const spring = (v: number) => Animated.spring(s, { toValue: v, speed: 40, bounciness: v === 1 ? 10 : 0, useNativeDriver: true }).start();
  return (
    <Pressable accessibilityRole="button" {...rest} disabled={disabled} style={wrap}
      onPressIn={(e) => { spring(scaleTo); rest.onPressIn?.(e); }} onPressOut={(e) => { spring(1); rest.onPressOut?.(e); }}>
      <Animated.View style={[style, { transform: [{ scale: s }] }, disabled ? { opacity: 0.5 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Content that floats up into place, so screens assemble themselves instead of popping in. */
export function Rise({ children, delay = 0, from = 18, style }: { children: ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 520, delay, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start(); }, [a, delay]);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>;
}

/** A looping 0 → 1 value for ambient motion (pulses, radar rings, floating). */
export function useLoop(duration: number, pingPong = false, active = true) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const step = (toValue: number) => Animated.timing(a, { toValue, duration, easing: pingPong ? Easing.inOut(Easing.sin) : Easing.linear, useNativeDriver: true });
    a.setValue(0);
    const l = Animated.loop(pingPong ? Animated.sequence([step(1), step(0)]) : step(1));
    l.start();
    return () => l.stop();
  }, [a, duration, pingPong, active]);
  return a;
}

type Kind = "primary" | "teal" | "ghost" | "sos";
export function Btn({ label, onPress, kind = "primary", disabled, icon, small }: { label: string; onPress: () => void; kind?: Kind; disabled?: boolean; icon?: ReactNode; small?: boolean }) {
  const BTN: Record<Kind, { bg: string; fg: string; border?: string }> = {
    primary: isDark() ? { bg: c.marigold, fg: "#1E1626" } : { bg: c.ink, fg: c.onTeal },
    teal: { bg: c.teal, fg: c.onTeal },
    ghost: { bg: "transparent", fg: c.ink, border: isDark() ? "#4A3D5A" : "#D6C3A6" },
    sos: { bg: c.sos, fg: "#fff" },
  };
  const k = BTN[kind];
  return (
    <Tap accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={[mk().btn, small ? { minHeight: 42, paddingHorizontal: 15, borderRadius: isDark() ? 13 : 999 } : null, { backgroundColor: k.bg, borderColor: k.border ?? k.bg, borderWidth: 1.5 }]}>
      {icon}
      <Text style={{ color: k.fg, fontFamily: f.bold, fontSize: small ? 13.5 : 15.5 }} numberOfLines={1}>{label}</Text>
    </Tap>
  );
}

/** Round (light) or squircle (dark) icon button used in headers. */
export function IconBtn({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: boolean }) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, borderRadius: isDark() ? 15 : 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={20} color={c.ink} />
      {badge && <View style={{ position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: c.sos }} />}
    </Tap>
  );
}

/** Sun / moon switch. The new theme spreads out from wherever you tap it. */
export function ThemeToggle() {
  const { scheme, setPref } = useTheme();
  const spin = useRef(new Animated.Value(scheme === "dark" ? 1 : 0)).current;
  useEffect(() => { Animated.spring(spin, { toValue: scheme === "dark" ? 1 : 0, friction: 6, useNativeDriver: true }).start(); }, [scheme, spin]);
  return (
    <Tap accessibilityLabel={`Switch to ${scheme === "dark" ? "light" : "dark"} theme`} onPress={(e) => setPref(scheme === "dark" ? "light" : "dark", { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      style={{ width: 44, height: 44, borderRadius: isDark() ? 15 : 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
        <Ionicons name={scheme === "dark" ? "sunny" : "moon"} size={20} color={scheme === "dark" ? c.teal : c.ink} />
      </Animated.View>
    </Tap>
  );
}

/** Segmented control with a pill that glides between options. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const [w, setW] = useState(0);
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  const x = useRef(new Animated.Value(i)).current;
  useEffect(() => { Animated.spring(x, { toValue: i, speed: 16, bounciness: 7, useNativeDriver: true }).start(); }, [i, x]);
  const seg = w ? (w - 10) / options.length : 0;
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", backgroundColor: c.card, borderRadius: isDark() ? 18 : 999, borderWidth: 1, borderColor: c.line, padding: 4 }}>
      {seg > 0 && <Animated.View style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: seg, borderRadius: isDark() ? 14 : 999, backgroundColor: isDark() ? c.teal : c.ink, transform: [{ translateX: Animated.multiply(x, seg) }] }} />}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.id)} style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center" }}>
            <Text numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 13, color: on ? (isDark() ? "#1E1626" : c.onTeal) : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, icon, disabled }: { label: string; on?: boolean; onPress: () => void; icon?: IconName; disabled?: boolean }) {
  return (
    <Tap accessibilityLabel={label} accessibilityState={{ selected: !!on }} disabled={disabled} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, minHeight: 38, borderRadius: 999, backgroundColor: on ? c.teal : c.card, borderWidth: 1, borderColor: on ? c.teal : c.line }}>
      {icon && <Ionicons name={icon} size={14} color={on ? c.onTeal : c.teal} />}
      <Text style={{ fontFamily: f.semi, fontSize: 13, color: on ? c.onTeal : c.ink }}>{label}</Text>
    </Tap>
  );
}

export function Pill({ label, bg, fg }: { label: string; bg?: string; fg?: string }) {
  return <View style={{ backgroundColor: bg ?? c.tealSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}><Text style={{ color: fg ?? c.teal, fontFamily: f.semi, fontSize: 12 }}>{label}</Text></View>;
}

/** Page heading: a small kicker over a display headline whose second half is set in coloured italics. */
export function Heading({ kicker, title, accent, right }: { kicker: string; title: string; accent?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="kicker">{kicker}</Txt>
        <Text accessibilityRole="header" style={mk().title}>{title}{accent ? <Text style={{ fontFamily: f.italic, color: c.teal }}> {accent}</Text> : null}</Text>
      </View>
      {right}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  return children ? <Text accessibilityRole="alert" style={{ color: c.terracotta, fontFamily: f.bold, marginTop: 6 }}>{children}</Text> : null;
}

export function Empty({ title, hint, mood = "sleeping" }: { title: string; hint?: string; mood?: Mood }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 24 }}>
      <Mitthu mood={mood} size={88} />
      <Txt variant="h2" style={{ marginTop: 8, textAlign: "center" }}>{title}</Txt>
      {hint ? <Txt variant="muted" style={{ textAlign: "center", marginTop: 4 }}>{hint}</Txt> : null}
    </Card>
  );
}

/** Text input that follows the theme. */
export const inputStyle = () => ({
  borderWidth: 1, borderColor: c.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, fontSize: 15.5,
  fontFamily: f.reg, backgroundColor: c.inputBg, color: c.ink,
}) as const;

// Lets any screen open the SOS overlay, switch mode or change tab without prop-drilling.
export const AppCtx = createContext<{ openSos: (personId?: string, fail?: boolean) => void; senior: () => void; go: (t: Tab) => void }>({ openSos: () => {}, senior: () => {}, go: () => {} });
export const useApp = () => useContext(AppCtx);
