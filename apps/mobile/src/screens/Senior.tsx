import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { call, type Person, type Session } from "../api";
import Svg, { Circle, Ellipse } from "react-native-svg";
import { Mitthu } from "../components/Mitthu";
import { f } from "../theme";
import type { FamilyData } from "../useFamily";
import { Rise, useApp } from "../ui";
import { useTheme } from "../ThemeContext";

// Senior Mode uses its own high-contrast palette (>= 7:1) and 64pt+ targets.
const KL = { bg: "#FFFDF8", ink: "#111111", teal: "#0B4F5E", sos: "#B00020", gold: "#FFE6A6", green: "#1E6B2B", card: "#FFFFFF", garland: "#FFF1CC", ok: "#DFF3E1", gold_ink: "#111111" };
const KD = { bg: "#000000", ink: "#FFFFFF", teal: "#1F7F94", sos: "#C4162F", gold: "#4A3A10", green: "#2F8F3F", card: "#14181C", garland: "#2B2410", ok: "#123A1C", gold_ink: "#FFFFFF" };

function Marigold() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      {Array.from({ length: 10 }, (_, i) => <Ellipse key={i} cx={22} cy={10} rx={6} ry={10} fill={i % 2 ? "#FF8A3D" : "#F5A524"} rotation={i * 36} origin="22, 22" />)}
      <Circle cx={22} cy={22} r={7} fill="#B45309" />
    </Svg>
  );
}

/** Senior Mode: huge buttons, strong contrast, photos of the kids, and a garland that grows through the day. */
export function Senior({ sess, data, onExit }: { sess: Session; data: FamilyData; onExit: () => void }) {
  const { scheme } = useTheme();
  const K = scheme === "dark" ? KD : KL;
  const { openSos } = useApp();
  const insets = useSafeAreaInsets();
  const parents = data.people.filter((p) => p.role === "parent");
  const [meId, setMeId] = useState<string>(parents[0]?.id ?? "");
  const me: Person | undefined = parents.find((p) => p.id === meId) ?? parents[0];
  const kids = data.people.filter((p) => p.role === "sponsor" || p.role === "relative");
  const [msg, setMsg] = useState<string | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [fine, setFine] = useState(false);
  const flowers = taken.length + (fine ? 1 : 0);

  async function checkIn() {
    if (!me) return;
    try { await call(sess, `/people/${me.id}/checkin`, "POST"); setFine(true); setMsg("Thank you! Your family knows you are well. 🦜"); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not check in. Please try again."); }
  }
  async function took(name: string) {
    if (!me) return;
    try { await call(sess, `/people/${me.id}/medication-taken?name=${encodeURIComponent(name)}`, "POST"); setTaken((t) => [...t, name]); void Haptics.selectionAsync(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not save. Please try again."); }
  }

  const big = { borderRadius: 30, alignItems: "center", justifyContent: "center", padding: 16 } as const;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: K.bg }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mitthu size={64} mood={fine ? "celebrate" : "idle"} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.serif, fontSize: 30, color: K.ink }}>Namaste{me ? `, ${me.name.split(" ")[0]}` : ""}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.semi, fontSize: 20, color: K.ink }}>How are you today?</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave Senior Mode" onPress={onExit} style={{ padding: 12 }}><Ionicons name="close-circle" size={32} color="#666" /></Pressable>
      </View>

      {parents.length > 1 && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {parents.map((p) => (
            <Pressable key={p.id} onPress={() => { setMeId(p.id); setTaken([]); setFine(false); setMsg(null); }} style={{ flex: 1, minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: K.ink, backgroundColor: me?.id === p.id ? K.ink : K.card }}>
              <Text style={{ fontFamily: f.xbold, fontSize: 18, color: me?.id === p.id ? K.bg : K.ink }}>{p.name.split(" ")[0]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel="I need help" onPress={() => openSos(me?.id, false)} style={({ pressed }) => [big, { backgroundColor: K.sos, minHeight: 140, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <Ionicons name="alert-circle" size={46} color="#fff" />
        <Text style={{ fontFamily: f.xbold, fontSize: 34, color: "#fff", marginTop: 4 }}>I NEED HELP</Text>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel="I am fine today" disabled={!me || fine} onPress={checkIn} style={({ pressed }) => [big, { backgroundColor: fine ? K.green : K.teal, minHeight: 104, flexDirection: "row", gap: 14, opacity: !me ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <Ionicons name={fine ? "checkmark-circle" : "sunny"} size={40} color="#fff" />
        <Text style={{ fontFamily: f.xbold, fontSize: 28, color: "#fff" }}>{fine ? "Family told ✓" : "I am fine today"}</Text>
      </Pressable>

      <View style={{ borderWidth: 4, borderColor: K.ink, borderRadius: 30, backgroundColor: K.card, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Ionicons name="medkit" size={30} color={K.ink} /><Text style={{ fontFamily: f.xbold, fontSize: 26, color: K.ink }}>My medicines</Text></View>
        {(me?.medications ?? []).length === 0 && <Text style={{ fontFamily: f.semi, fontSize: 20, color: K.ink }}>No medicines are listed.</Text>}
        {(me?.medications ?? []).map((m) => {
          const done = taken.includes(m.name);
          return (
            <Pressable key={m.name} accessibilityRole="button" accessibilityLabel={`${m.name}, tap when taken`} disabled={done} onPress={() => took(m.name)}
              style={{ minHeight: 84, borderRadius: 22, backgroundColor: done ? K.green : K.gold, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: f.xbold, fontSize: 22, color: done ? "#fff" : K.gold_ink }}>{m.name}</Text>
                <Text style={{ fontFamily: f.semi, fontSize: 16, color: done ? "#fff" : K.gold_ink }}>{m.times?.join(", ")}</Text>
              </View>
              {done ? <Ionicons name="checkmark-circle" size={40} color="#fff" /> : <View style={{ backgroundColor: K.card, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 }}><Text style={{ fontFamily: f.xbold, fontSize: 18, color: K.ink }}>I took it</Text></View>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 12 }}>
        {kids.map((k) => (
          <Pressable key={k.id} accessibilityRole="button" accessibilityLabel={`Call ${k.name}`} onPress={() => Linking.openURL(`tel:${k.phone}`)}
            style={{ minHeight: 92, borderRadius: 30, borderWidth: 5, borderColor: K.teal, backgroundColor: K.card, flexDirection: "row", alignItems: "center", gap: 16, padding: 14 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: K.teal, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: f.serif, fontSize: 30, color: "#fff" }}>{k.name[0]}</Text></View>
            <Text style={{ flex: 1, fontFamily: f.xbold, fontSize: 26, color: K.ink }}>Call {k.name.split(" ")[0]}</Text>
            <Ionicons name="call" size={34} color={K.teal} />
          </Pressable>
        ))}
      </View>

      <View style={{ backgroundColor: K.garland, borderRadius: 26, padding: 18, alignItems: "center" }} accessibilityLabel={`Garland with ${flowers} flowers`}>
        <Text style={{ fontFamily: f.xbold, fontSize: 22, color: K.ink }}>Today&apos;s garland</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 10, minHeight: 44 }}>
          {flowers ? Array.from({ length: flowers }, (_, i) => <Rise key={i} from={20}><Marigold /></Rise>) : <Text style={{ fontFamily: f.semi, fontSize: 18, color: K.ink }}>Your first flower is waiting.</Text>}
        </View>
      </View>
      {msg && <Text accessibilityRole="alert" style={{ fontFamily: f.xbold, fontSize: 22, color: K.ink, backgroundColor: K.ok, padding: 18, borderRadius: 22 }}>{msg}</Text>}
    </ScrollView>
  );
}
