import { createContext, useContext, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { c, f, shadow } from "./theme";

// Styles are built per render (not once at import) so they always use the current light/dark palette.
const mk = () => StyleSheet.create({
  body: { fontFamily: f.reg, fontSize: 15, color: c.ink },
  title: { fontFamily: f.serif, fontSize: 28, color: c.ink },
  big: { fontFamily: f.serif, fontSize: 34, color: c.teal },
  h2: { fontFamily: f.serif, fontSize: 19, color: c.ink },
  muted: { fontFamily: f.reg, fontSize: 14, color: c.muted },
  kicker: { fontFamily: f.xbold, fontSize: 11, letterSpacing: 0.8, color: c.muted, textTransform: "uppercase" },
  card: { backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.line, ...shadow },
  btn: { minHeight: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 22 },
});

export function Txt({ children, style, variant = "body", ...rest }: { children?: ReactNode; style?: StyleProp<TextStyle>; variant?: "body" | "title" | "h2" | "muted" | "kicker" | "big" } & React.ComponentProps<typeof Text>) {
  return <Text {...rest} style={[mk()[variant], style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[mk().card, style]}>{children}</View>;
}

type Kind = "primary" | "teal" | "ghost" | "sos";
export function Btn({ label, onPress, kind = "primary", disabled, icon, small }: { label: string; onPress: () => void; kind?: Kind; disabled?: boolean; icon?: ReactNode; small?: boolean }) {
  const BTN: Record<Kind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.marigold, fg: "#2a1c00" },
    teal: { bg: c.teal, fg: c.ivory === "#12161C" ? "#0B1216" : "#FFFFFF" },
    ghost: { bg: "transparent", fg: c.ink, border: c.line },
    sos: { bg: c.sos, fg: "#fff" },
  };
  const k = BTN[kind];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [mk().btn, small && { minHeight: 40, paddingHorizontal: 16 }, { backgroundColor: k.bg, borderColor: k.border ?? k.bg, borderWidth: 1.5, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {icon}
      <Text style={{ color: k.fg, fontFamily: f.bold, fontSize: small ? 14 : 16 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, bg, fg }: { label: string; bg?: string; fg?: string }) {
  return <View style={{ backgroundColor: bg ?? c.tealSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}><Text style={{ color: fg ?? c.teal, fontFamily: f.semi, fontSize: 12 }}>{label}</Text></View>;
}

export function ErrorText({ children }: { children?: string | null }) {
  return children ? <Text accessibilityRole="alert" style={{ color: c.terracotta, fontFamily: f.bold, marginTop: 6 }}>{children}</Text> : null;
}

export function Empty({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 28 }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Txt variant="h2" style={{ marginTop: 6 }}>{title}</Txt>
      {hint ? <Txt variant="muted" style={{ textAlign: "center", marginTop: 4 }}>{hint}</Txt> : null}
    </Card>
  );
}

/** Text input that follows the theme. */
export const inputStyle = () => ({
  borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
  fontFamily: f.reg, backgroundColor: c.inputBg, color: c.ink,
}) as const;

// Lets any screen trigger the SOS overlay or switch mode without prop-drilling.
export const AppCtx = createContext<{ openSos: (personId?: string, fail?: boolean) => void; senior: () => void }>({ openSos: () => {}, senior: () => {} });
export const useApp = () => useContext(AppCtx);
