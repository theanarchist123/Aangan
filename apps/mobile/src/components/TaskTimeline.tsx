import { useState } from "react";
import { Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { call, webBase, type Session, type Step, type Task } from "../api";
import { c, f } from "../theme";
import { Btn, Card, ErrorText, Txt } from "../ui";

const colorOf = (st: string) => ({ done: c.parrot, running: c.teal, blocked: c.marigold, failed: c.terracotta, pending: c.line } as Record<string, string>)[st] ?? c.line;
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { done: "checkmark", running: "sync", blocked: "time", failed: "close", pending: "ellipse-outline" };
const LABEL: Record<string, string> = { running: "In progress", awaiting_approval: "Waiting for you", escalated: "Escalated to humans", done: "Done", failed: "Needs attention", planning: "Planning" };

function StepRow({ s, last }: { s: Step; last: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colorOf(s.status), alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={ICON[s.status] ?? "ellipse-outline"} size={16} color={s.status === "pending" ? c.muted : "#fff"} />
        </View>
        {!last && <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: c.line, marginVertical: 2 }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: 14 }}>
        <Text style={{ fontFamily: f.bold, fontSize: 15, color: c.ink }}>{s.title}</Text>
        <Txt variant="muted" style={{ fontSize: 12 }}>{s.agent}</Txt>
        {!!s.detail && <Txt style={{ marginTop: 2 }}>{s.detail}</Txt>}
      </View>
    </View>
  );
}

/** Swiggy-style live tracker for one agent task. */
export function TaskTimeline({ task, sess }: { task: Task; sess: Session }) {
  const [err, setErr] = useState<string | null>(null);
  const done = task.status === "done", esc = task.status === "escalated";

  async function share() {
    try {
      const r = await call<{ url: string }>(sess, `/tasks/${task.id}/caregiver-link`, "POST");
      await Share.share({ message: `Aangan job link (expires in 12h): ${webBase()}${r.url}` });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create link"); }
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <Txt variant="h2" style={{ flex: 1 }}>{task.goal}</Txt>
        <View style={{ alignSelf: "flex-start", backgroundColor: done ? "rgba(63,163,77,0.15)" : esc ? "rgba(214,40,40,0.12)" : c.marigoldSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ fontFamily: f.bold, fontSize: 12, color: done ? c.parrot : esc ? c.sos : c.ink }}>{LABEL[task.status] ?? task.status}</Text>
        </View>
      </View>
      {esc && (
        <View accessibilityRole="alert" style={{ backgroundColor: "rgba(214,40,40,0.1)", borderRadius: 14, padding: 12, marginBottom: 12, flexDirection: "row", gap: 8 }}>
          <Ionicons name="warning" size={20} color={c.sos} />
          <Text style={{ flex: 1, fontFamily: f.semi, color: c.sos }}>{task.escalation_reason}. The 24×7 command desk and your local emergency contacts were alerted.</Text>
        </View>
      )}
      {task.steps.map((s, i) => <StepRow key={s.id} s={s} last={i === task.steps.length - 1} />)}
      {task.kind !== "sos" && <View style={{ alignItems: "flex-start", marginTop: 2 }}><Btn label="Send caregiver link" kind="ghost" small onPress={share} icon={<Ionicons name="link" size={16} color={c.ink} />} /></View>}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
