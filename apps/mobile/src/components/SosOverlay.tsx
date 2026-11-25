import { useEffect, useState } from "react";
import { Linking, Modal, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { call, type Hospital, type Person, type Session, type Task } from "../api";
import { c, f } from "../theme";
import { Btn, Card, ErrorText, Txt } from "../ui";
import { ApprovalCard } from "./ApprovalCard";

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
  const R = 44, C = 2 * Math.PI * R;
  const frac = dispatched === "done" || escalated ? 1 : elapsed / 30;

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.ivory }}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18, gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-half" size={26} color={c.sos} />
              <Text style={{ fontFamily: f.xbold, fontSize: 24, color: c.sos }}>Emergency</Text>
            </View>
            <Btn label="Close" kind="ghost" small onPress={onClose} />
          </View>
          <Txt style={{ fontSize: 17 }}>{person ? `Help for ${person.name}${person.city ? ` in ${person.city}` : ""}.` : "Getting help to your family now."}</Txt>
          <ErrorText>{err}</ErrorText>

          <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Svg width={104} height={104}>
              <Circle cx={52} cy={52} r={R} stroke={c.line} strokeWidth={8} fill="none" />
              <Circle cx={52} cy={52} r={R} stroke={dispatched === "done" ? c.parrot : c.sos} strokeWidth={8} strokeLinecap="round" fill="none"
                strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - frac)} rotation={-90} origin="52, 52" />
            </Svg>
            <Text style={{ position: "absolute", left: 16 + 52 - 20, width: 40, textAlign: "center", fontFamily: f.xbold, fontSize: 24, color: c.ink }}>
              {dispatched === "done" ? "✓" : escalated ? "!" : 30 - elapsed}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: f.xbold, fontSize: 17, color: c.ink }}>{dispatched === "done" ? "Ambulance confirmed" : escalated ? "Escalated to humans" : "Confirming ambulance…"}</Text>
              <Txt variant="muted">If not confirmed in 30 seconds, our 24×7 command desk and local contacts are alerted automatically.</Txt>
            </View>
          </Card>

          {task && (
            <Card style={{ padding: 4 }}>
              {task.steps.map((s, i) => (
                <View key={s.id} style={{ flexDirection: "row", gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                  <Ionicons name={s.status === "done" ? "checkmark-circle" : s.status === "failed" ? "close-circle" : "ellipse-outline"} size={24}
                    color={s.status === "done" ? c.parrot : s.status === "failed" ? c.sos : c.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{s.title}</Text>
                    {!!s.detail && <Txt variant="muted">{s.detail}</Txt>}
                  </View>
                </View>
              ))}
            </Card>
          )}
          {escalated && <Text accessibilityRole="alert" style={{ backgroundColor: "rgba(214,40,40,0.1)", color: c.sos, fontFamily: f.bold, padding: 14, borderRadius: 14 }}>{task?.escalation_reason}. A human is taking over. Keep this phone nearby.</Text>}
          {approval && task && <ApprovalCard a={approval} sess={sess} onDone={async () => setTask(await call<Task>(sess, `/tasks/${task.id}`))} />}

          {hospitals.length > 0 && (
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Ionicons name="location" size={18} color={c.teal} /><Text style={{ fontFamily: f.bold, color: c.ink }}>Nearest hospitals (real map data)</Text></View>
              {hospitals.slice(0, 3).map((h) => (
                <View key={h.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.line }}>
                  <Txt style={{ flex: 1 }}><Text style={{ fontFamily: f.bold }}>{h.name}</Text>  {h.distance_km} km</Txt>
                  <Btn small kind="ghost" label="Map" onPress={() => Linking.openURL(h.maps_url)} />
                </View>))}
            </Card>)}
          <Txt variant="muted" style={{ fontSize: 12 }}>Sandbox: the ambulance and hospital connections are simulated. For a real emergency in India call 112 or 108.</Txt>

          <View style={{ gap: 10, marginTop: 6 }}>
            <Btn label="Call 112" kind="sos" onPress={() => Linking.openURL("tel:112")} icon={<Ionicons name="call" size={20} color="#fff" />} />
            {contacts.slice(0, 2).map((p) => <Btn key={p.id} label={`Call ${p.name}`} kind="ghost" onPress={() => Linking.openURL(`tel:${p.phone}`)} />)}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
