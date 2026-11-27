import { useState } from "react";
import { Animated, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { call, webBase, type Session, type Step, type Task } from "../api";
import { c, f, isDark } from "../theme";
import { Btn, Card, ErrorText, Rise, Tap, Txt, useLoop, type IconName } from "../ui";

const stopColor = (st: string) => ({ done: c.parrot, running: c.teal, blocked: c.marigold, failed: c.sos, pending: c.line } as Record<string, string>)[st] ?? c.line;
const ICON: Record<string, IconName> = { done: "checkmark", running: "navigate", blocked: "hand-left", failed: "close", pending: "ellipse" };
const LABEL: Record<string, string> = { running: "On the way", awaiting_approval: "Waiting for you", escalated: "Humans took over", done: "Arrived", failed: "Needs attention", planning: "Planning" };
const KIND: Record<string, IconName> = { sos: "medkit", bill: "flash", diagnostics: "flask", home_service: "construct", medical: "medkit" };

/** One stop on the route. The stop in progress sends out a pulse. */
function Stop({ s, last }: { s: Step; last: boolean }) {
  const live = s.status === "running" || s.status === "blocked";
  const pulse = useLoop(1600, false, live);
  const col = stopColor(s.status);
  return (
    <View style={{ flexDirection: "row", gap: 13 }}>
      <View style={{ alignItems: "center", width: 30 }}>
        <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
          {live && <Animated.View style={{ position: "absolute", width: 30, height: 30, borderRadius: 15, backgroundColor: col, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }] }} />}
          <View style={{ width: s.status === "pending" ? 16 : 28, height: s.status === "pending" ? 16 : 28, borderRadius: 14, backgroundColor: s.status === "pending" ? "transparent" : col, borderWidth: s.status === "pending" ? 2.5 : 0, borderColor: col, alignItems: "center", justifyContent: "center" }}>
            {s.status !== "pending" && <Ionicons name={ICON[s.status] ?? "ellipse"} size={15} color={isDark() ? "#1E1626" : "#fff"} />}
          </View>
        </View>
        {!last && <View style={{ width: 3, flex: 1, minHeight: 16, borderRadius: 2, backgroundColor: s.status === "done" ? c.parrot : c.line, marginVertical: 2 }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 2 : 15, paddingTop: 3 }}>
        <Text style={{ fontFamily: f.bold, fontSize: 14.5, color: s.status === "pending" ? c.muted : c.ink }}>{s.title}</Text>
        {!!s.detail && <Txt variant="muted" style={{ marginTop: 2, fontSize: 13 }}>{s.detail}</Txt>}
        <Text style={{ fontFamily: f.semi, fontSize: 11, color: c.muted, marginTop: 3, opacity: 0.8 }}>{s.agent}</Text>
      </View>
    </View>
  );
}

/** Each agent task is a journey: a ticket with a progress track, a tear line, and the route underneath. */
export function TaskTimeline({ task, sess, startOpen = true }: { task: Task; sess: Session; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [err, setErr] = useState<string | null>(null);
  const done = task.status === "done", esc = task.status === "escalated", waiting = task.status === "awaiting_approval";
  const finished = task.steps.filter((s) => s.status === "done").length;
  const tone = done ? c.parrot : esc || task.status === "failed" ? c.sos : waiting ? c.marigold : c.teal;

  async function share() {
    try {
      const r = await call<{ url: string }>(sess, `/tasks/${task.id}/caregiver-link`, "POST");
      await Share.share({ message: `Aangan job link (expires in 12h): ${webBase()}${r.url}` });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create link"); }
  }
  const notch = (side: "left" | "right") => <View style={{ position: "absolute", [side]: -10, top: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: c.ivory, borderWidth: 1, borderColor: c.line }} />;

  return (
    <Card style={{ padding: 0 }}>
      <Tap accessibilityLabel={`${task.goal}. ${LABEL[task.status] ?? task.status}. ${open ? "Collapse" : "Expand"}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} scaleTo={0.985} style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: c.tealSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={KIND[task.kind] ?? "paper-plane"} size={21} color={task.kind === "sos" ? c.sos : c.teal} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={open ? 3 : 1} style={{ fontFamily: f.serif, fontSize: isDark() ? 21 : 17.5, color: c.ink }}>{task.goal}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
              <Text style={{ fontFamily: f.bold, fontSize: 12.5, color: c.muted }}>{LABEL[task.status] ?? task.status} · {finished} of {task.steps.length} stops</Text>
            </View>
          </View>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {task.steps.map((s) => <View key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: stopColor(s.status) }} />)}
        </View>
      </Tap>
      {open && (
        <Rise from={8}>
          <View style={{ height: 1 }}>
            <View style={{ borderTopWidth: 1.5, borderStyle: "dashed", borderColor: c.line, marginHorizontal: 14 }} />
            {notch("left")}{notch("right")}
          </View>
          <View style={{ padding: 16, paddingTop: 18 }}>
            {esc && (
              <View accessibilityRole="alert" style={{ backgroundColor: "rgba(214,40,40,0.1)", borderRadius: 14, padding: 12, marginBottom: 14, flexDirection: "row", gap: 8 }}>
                <Ionicons name="warning" size={20} color={c.sos} />
                <Text style={{ flex: 1, fontFamily: f.semi, color: c.sos }}>{task.escalation_reason}. The 24×7 command desk and your local emergency contacts were alerted.</Text>
              </View>
            )}
            {task.steps.map((s, i) => <Stop key={s.id} s={s} last={i === task.steps.length - 1} />)}
            {task.kind !== "sos" && <View style={{ alignItems: "flex-start", marginTop: 12 }}><Btn label="Send caregiver link" kind="ghost" small onPress={share} icon={<Ionicons name="link" size={16} color={c.ink} />} /></View>}
            <ErrorText>{err}</ErrorText>
          </View>
        </Rise>
      )}
    </Card>
  );
}
