import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, f, isDark } from "../theme";
import { useLoop, type IconName, type Tab } from "../ui";

export const TAB_ORDER: Tab[] = ["home", "tasks", "vault", "family", "safety"];

/** One page of the pager. It slides and fades between "off to the left", "here" and "off to the right". */
function Page({ pos, active, children }: { pos: number; active: boolean; children: ReactNode }) {
  const a = useRef(new Animated.Value(active ? 0 : pos || 1)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: pos, duration: 430, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [pos, a]);
  return (
    <Animated.View
      accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={{
        position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: active ? 2 : 1, pointerEvents: active ? "auto" : "none",
        backgroundColor: c.ivory,
        opacity: a.interpolate({ inputRange: [-1, -0.65, 0, 0.65, 1], outputRange: [0, 0, 1, 0, 0] }),
        transform: [
          { translateX: a.interpolate({ inputRange: [-1, 0, 1], outputRange: [-70, 0, 70] }) },
          { scale: a.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.965, 1, 0.965] }) },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

/** Keeps each visited tab alive (scroll position and half-typed text survive) and glides between them. */
export function Pager({ tab, render }: { tab: Tab; render: (t: Tab, active: boolean) => ReactNode }) {
  const [seen, setSeen] = useState<Tab[]>([tab]);
  if (!seen.includes(tab)) setSeen([...seen, tab]);
  const at = TAB_ORDER.indexOf(tab);
  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      {TAB_ORDER.filter((t) => seen.includes(t)).map((t) => (
        <Page key={t} active={t === tab} pos={Math.sign(TAB_ORDER.indexOf(t) - at)}>{render(t, t === tab)}</Page>
      ))}
    </View>
  );
}

type Item = { id: Tab; label: string; on: IconName; off: IconName };
const ITEMS: Item[] = [
  { id: "home", label: "Home", on: "home", off: "home-outline" },
  { id: "tasks", label: "Journeys", on: "git-branch", off: "git-branch-outline" },
  { id: "vault", label: "Vault", on: "lock-closed", off: "lock-closed-outline" },
  { id: "family", label: "Family", on: "people", off: "people-outline" },
];
const HOLD_MS = 900;

/** SOS needs a deliberate press-and-hold: a ring fills, then help starts. A stray tap only shows the hint. */
function SosButton({ onFire }: { onFire: () => void }) {
  const hold = useRef(new Animated.Value(0)).current;
  const pulse = useLoop(1900);
  const [hint, setHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  function start() {
    fired.current = false;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      fired.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      hold.setValue(0); setHint(false); onFire();
    }, HOLD_MS);
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    Animated.spring(hold, { toValue: 0, useNativeDriver: true }).start();
    if (!fired.current) {
      setHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1800);
    }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  return (
    <View style={{ width: 66, alignItems: "center", justifyContent: "center" }}>
      {hint && (
        <View style={{ position: "absolute", bottom: 72, width: 170, backgroundColor: c.sos, borderRadius: 12, paddingVertical: 8 }}>
          <Text accessibilityRole="alert" style={{ color: "#fff", fontFamily: f.bold, fontSize: 12.5, textAlign: "center" }}>Press and hold for SOS</Text>
        </View>
      )}
      <Animated.View style={{ pointerEvents: "none", position: "absolute", width: 58, height: 58, borderRadius: 29, backgroundColor: c.sos, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Emergency SOS. Press and hold." onPressIn={start} onPressOut={stop}
        accessibilityActions={[{ name: "activate" }]} onAccessibilityAction={onFire}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.sos, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 3, borderColor: c.raised }}>
          <Animated.View style={{ position: "absolute", width: 60, height: 60, borderRadius: 30, backgroundColor: "#8E0F22", opacity: hold.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] }), transform: [{ scale: hold }] }} />
          <Text style={{ color: "#fff", fontFamily: f.xbold, fontSize: 14, letterSpacing: 0.5 }}>SOS</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Dusk: a floating dock with a gliding marigold tile. Sunlit: a paper bar with a gliding ink-red marker. */
export function TabBar({ tab, setTab, onSos, pending }: { tab: Tab; setTab: (t: Tab) => void; onSos: () => void; pending: number }) {
  const insets = useSafeAreaInsets();
  const dk = isDark();
  const [w, setW] = useState(0);
  const slotOf = (t: Tab) => { const i = ITEMS.findIndex((x) => x.id === t); return i < 0 ? -1 : i < 2 ? i : i + 1; }; // slot 2 is SOS
  const slot = slotOf(tab);
  const sw = w / 5;
  const x = useRef(new Animated.Value(Math.max(0, slot))).current;
  const show = useRef(new Animated.Value(slot < 0 ? 0 : 1)).current;
  useEffect(() => {
    if (slot >= 0) Animated.spring(x, { toValue: slot, speed: 14, bounciness: 8, useNativeDriver: true }).start();
    Animated.timing(show, { toValue: slot < 0 ? 0 : 1, duration: 200, useNativeDriver: true }).start();
  }, [slot, x, show]);

  const button = (it: Item) => {
    const sel = tab === it.id;
    const color = sel ? (dk ? "#1E1626" : c.teal) : c.muted;
    return (
      <Pressable key={it.id} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={it.label} onPress={() => { void Haptics.selectionAsync().catch(() => {}); setTab(it.id); }}
        style={{ flex: 1, height: 62, alignItems: "center", justifyContent: "center", gap: 3 }}>
        <View>
          <Ionicons name={sel ? it.on : it.off} size={22} color={color} />
          {it.id === "home" && pending > 0 && <View style={{ position: "absolute", right: -11, top: -6, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.sos, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ fontFamily: f.xbold, fontSize: 10.5, color: "#fff" }}>{pending}</Text></View>}
        </View>
        <Text style={{ fontFamily: sel ? f.xbold : f.semi, fontSize: 10.5, color }}>{it.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={dk ? { backgroundColor: c.ivory, paddingHorizontal: 12, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10) } : { backgroundColor: c.raised, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: Math.max(insets.bottom, 6) }}>
      <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[{ flexDirection: "row", alignItems: "center", height: 70 }, dk && { backgroundColor: c.raised, borderRadius: 26, borderWidth: 1, borderColor: "#3A2F48" }]}>
        {sw > 0 && (
          <Animated.View style={{ pointerEvents: "none", position: "absolute", left: 0, top: dk ? 5 : 0, width: sw, alignItems: "center", opacity: show, transform: [{ translateX: Animated.multiply(x, sw) }] }}>
            <View style={dk ? { width: Math.min(sw - 8, 62), height: 58, borderRadius: 19, backgroundColor: c.teal } : { width: 30, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: c.teal }} />
          </Animated.View>
        )}
        {ITEMS.slice(0, 2).map(button)}
        <View style={{ flex: 1, alignItems: "center" }}><SosButton onFire={onSos} /></View>
        {ITEMS.slice(2).map(button)}
      </View>
    </View>
  );
}
