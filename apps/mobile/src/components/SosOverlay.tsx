import { useEffect, useState } from "react";
import { Animated, Linking, Modal, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { call, type Hospital, type Person, type Session, type Task } from "../api";
import { f } from "../theme";
import { Rise, Tap, useLoop } from "../ui";
import { ApprovalCard } from "./ApprovalCard";

// The emergency screen looks the same in both themes: a calm, deep red night.
const W = "#FFF1F2", SUB = "#C9A4AC", PANEL = "#26101A";

/** SOS: calm, no mascot, no jokes. Red appears nowhere else in the app. */
export function SosOverlay({ sess, person, simulateFailure, contacts, onClose }: {
  sess: Session; person?: Person; simulateFailure: boolean; contacts: Person[]; onClose: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [started] = useState(() => Date.now());
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    if (!person?.id) return;
    call<{ hospitals: Hospital[] }>(sess, `/families/${sess.familyId}/nearby-hospitals?person_id=${person.id}`).then((r) => setHospitals(r.hospitals)).catch(() => setHospitals([]));
  }, [sess, person?.id]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const t = await call<Task>(sess, `/families/${sess.familyId}/sos`, "POST", { person_id: person?.id, simulate_dispatch_failure: simulateFailure });
        if (!off) { setTask(t); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); }
      } catch (e) { if (!off) setErr(`${e instanceof Error ? e.message : "Could not start SOS."} Call 112 now.`); }
    })();
    return () => { off = true; };
  }, [sess, person?.id, simulateFailure]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!task || task.status === "done" || task.status === "escalated") return;
    const t = setInterval(async () => { try { setTask(await call<Task>(sess, `/tasks/${task.id}`)); } catch {} }, 2000);
    return () => clearInterval(t);
  }, [task, sess]);

  const elapsed = Math.min(30, Math.floor((now - started) / 1000));
  const dispatched = task?.steps.find((s) => s.title.startsWith("Dispatch"))?.status;
  const escalated = task?.status === "escalated";
  const approval = task?.approvals.find((a) => a.status === "pending");
  const ok = dispatched === "done";
  const R = 78, C = 2 * Math.PI * R;
  const frac = ok || escalated ? 1 : elapsed / 30;
  const radar = useLoop(2600);
  const accent = ok ? "#7EE0B5" : "#FF5C6C";
  const outline = { borderWidth: 1.5, borderColor: "#7A3A46", alignItems: "center", justifyContent: "center" } as const;

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#17080D" }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18, gap: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-half" size={24} color="#FF5C6C" />
              <Text style={{ fontFamily: f.xbold, fontSize: 13, letterSpacing: 1.6, color: "#FF8C97" }}>EMERGENCY</Text>
            </View>
            <Tap accessibilityLabel="Close" onPress={onClose} style={[outline, { paddingHorizontal: 16, minHeight: 40, borderRadius: 999 }]}><Text style={{ fontFamily: f.bold, color: W }}>Close</Text></Tap>
          </View>

          <View style={{ height: 230, alignItems: "center", justifyContent: "center" }}>
            {[0, 0.33, 0.66].map((o) => {
              const v = Animated.modulo(Animated.add(radar, o), 1);
              return <Animated.View key={o} style={{ position: "absolute", width: 170, height: 170, borderRadius: 85, borderWidth: 1.5, borderColor: accent, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }] }} />;
            })}
            <Svg width={180} height={180}>
              <Circle cx={90} cy={90} r={R} stroke="#3C1720" strokeWidth={12} fill="#220C13" />
              <Circle cx={90} cy={90} r={R} stroke={accent} strokeWidth={12} strokeLinecap="round" fill="none" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - frac)} rotation={-90} origin="90, 90" />
            </Svg>
            <View style={{ position: "absolute", alignItems: "center" }}>
              {ok ? <Ionicons name="checkmark" size={58} color={accent} /> : <Text style={{ fontFamily: f.display, fontSize: 62, color: W }}>{escalated ? "!" : 30 - elapsed}</Text>}
              {!ok && !escalated && <Text style={{ fontFamily: f.semi, fontSize: 12, color: SUB }}>seconds</Text>}
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: f.display, fontSize: 31, color: W, textAlign: "center" }}>{ok ? "Ambulance confirmed" : escalated ? "Humans are taking over" : "Confirming ambulance"}</Text>
            <Text style={{ fontFamily: f.reg, fontSize: 14, lineHeight: 20, color: SUB, textAlign: "center" }}>{person ? `Help for ${person.name}${person.city ? ` in ${person.city}` : ""}. ` : ""}If nothing is confirmed in 30 seconds, our 24×7 desk and local contacts are alerted automatically.</Text>
          </View>
          {!!err && <Text accessibilityRole="alert" style={{ fontFamily: f.xbold, color: "#FF8C97", textAlign: "center" }}>{err}</Text>}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Tap accessibilityLabel="Call 112" onPress={() => Linking.openURL("tel:112")} wrap={{ flex: 1.2 }} style={{ height: 58, borderRadius: 20, backgroundColor: "#E5384D", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="call" size={21} color="#fff" /><Text style={{ fontFamily: f.xbold, fontSize: 18, color: "#fff" }}>Call 112</Text>
            </Tap>
            {contacts.slice(0, 1).map((p) => (
              <Tap key={p.id} accessibilityLabel={`Call ${p.name}`} onPress={() => Linking.openURL(`tel:${p.phone}`)} wrap={{ flex: 1 }} style={[outline, { height: 58, borderRadius: 20, paddingHorizontal: 8 }]}>
                <Text numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 14.5, color: W }}>Call {p.name.split(" (")[0]}</Text>
              </Tap>
            ))}
          </View>

          {task && (
            <View style={{ backgroundColor: PANEL, borderRadius: 24, padding: 8 }}>
              {task.steps.map((s, i) => (
                <Rise key={s.id} delay={i * 130} from={12}>
                  <View style={{ flexDirection: "row", gap: 12, padding: 11 }}>
                    <Ionicons name={s.status === "done" ? "checkmark-circle" : s.status === "failed" ? "close-circle" : "ellipse-outline"} size={24} color={s.status === "done" ? "#7EE0B5" : s.status === "failed" ? "#FF5C6C" : "#A98891"} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: f.bold, fontSize: 14.5, color: W }}>{s.title}</Text>
                      {!!s.detail && <Text style={{ fontFamily: f.reg, fontSize: 13, lineHeight: 18, color: SUB, marginTop: 2 }}>{s.detail}</Text>}
                    </View>
                  </View>
                </Rise>
              ))}
            </View>
          )}
          {escalated && <Text accessibilityRole="alert" style={{ backgroundColor: "rgba(255,92,108,0.16)", color: "#FF9AA4", fontFamily: f.bold, padding: 14, borderRadius: 16, overflow: "hidden" }}>{task?.escalation_reason}. A human is taking over. Keep this phone nearby.</Text>}
          {approval && task && <ApprovalCard a={approval} sess={sess} onDone={async () => setTask(await call<Task>(sess, `/tasks/${task.id}`))} />}

          {hospitals.length > 0 && (
            <Rise>
              <View style={{ gap: 9 }}>
                <Text style={{ fontFamily: f.xbold, fontSize: 11.5, letterSpacing: 1.2, color: SUB }}>NEAREST HOSPITALS · REAL MAP DATA</Text>
                {hospitals.slice(0, 3).map((h) => (
                  <Tap key={h.name} accessibilityLabel={`Open map to ${h.name}, ${h.distance_km} kilometres`} onPress={() => Linking.openURL(h.maps_url)} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: PANEL, borderRadius: 18, padding: 13 }}>
                    <View style={{ width: 46, alignItems: "center" }}><Text style={{ fontFamily: f.display, fontSize: 22, color: "#FFC861" }}>{h.distance_km}</Text><Text style={{ fontFamily: f.semi, fontSize: 10, color: SUB }}>km</Text></View>
                    <Text style={{ flex: 1, fontFamily: f.bold, fontSize: 14, color: W }}>{h.name}</Text>
                    <Ionicons name="navigate-circle" size={28} color="#FFC861" />
                  </Tap>
                ))}
              </View>
            </Rise>
          )}
          <Text style={{ fontFamily: f.reg, fontSize: 12, lineHeight: 17, color: SUB, textAlign: "center" }}>Sandbox: the ambulance and hospital connections are simulated. For a real emergency in India call 112 or 108.</Text>
          {contacts.slice(1, 2).map((p) => <Tap key={p.id} accessibilityLabel={`Call ${p.name}`} onPress={() => Linking.openURL(`tel:${p.phone}`)} style={[outline, { height: 50, borderRadius: 18 }]}><Text style={{ fontFamily: f.bold, color: W }}>Call {p.name}</Text></Tap>)}
        </ScrollView>
      </View>
    </Modal>
  );
}
