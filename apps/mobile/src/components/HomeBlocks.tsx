import { useState } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Finding, Person, Story, Task } from "../api";
import { c, f, isDark } from "../theme";
import { Btn, Card, Chip, ErrorText, Rise, Tap, Txt, useLoop, type IconName } from "../ui";
import { Mitthu, type Mood } from "./Mitthu";
import { Rings } from "./Rings";

export const shortName = (n: string) => n.split(" (")[0].replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(" ")[0] || n;
/** "Sunita (Maa)" reads best as "Maa". */
export const callName = (n: string) => n.match(/\(([^)]+)\)/)?.[1] ?? shortName(n);

const IDEAS: { label: string; icon: IconName; goal: string }[] = [
  { label: "Blood test", icon: "flask", goal: "Book a blood test for Maa" },
  { label: "Power bill", icon: "flash", goal: "Pay the electricity bill" },
  { label: "Plumber", icon: "construct", goal: "Send a plumber to the flat" },
  { label: "Bill ₹9,000", icon: "card", goal: "Pay electricity bill Rs 9,000" },
];
const SAYS: Record<Mood, string> = {
  idle: "What should I take care of?", listening: "I'm listening…", thinking: "On it. Planning the steps…",
  celebrate: "Done! Check the journey below.", sleeping: "All quiet.", alert: "I need you for this one.",
};

/** Ask Mitthu: type or speak. While the mic is open, a live equaliser dances. */
export function Composer({ goal, setGoal, mood, recording, onMic, onSend, error }: {
  goal: string; setGoal: (v: string) => void; mood: Mood; recording: boolean; onMic: () => void; onSend: (t: string) => void; error: string | null;
}) {
  const wave = useLoop(420, true, recording);
  const busy = mood === "thinking";
  const dk = isDark();
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Mitthu mood={mood} size={62} />
        <View style={{ flex: 1, backgroundColor: c.tealSoft, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 11 }}>
          <Text style={{ fontFamily: f.italic, fontSize: 17, lineHeight: 22, color: c.ink }}>{SAYS[mood]}</Text>
          {recording && (
            <View style={{ flexDirection: "row", gap: 4, height: 18, alignItems: "center", marginTop: 6 }}>
              {Array.from({ length: 16 }, (_, i) => (
                <Animated.View key={i} style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: c.teal, transform: [{ scaleY: wave.interpolate({ inputRange: [0, 1], outputRange: i % 3 === 0 ? [0.25, 1] : i % 3 === 1 ? [0.9, 0.35] : [0.45, 0.7] }) }] }} />
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.inputBg, borderRadius: dk ? 18 : 999, borderWidth: 1, borderColor: recording ? c.sos : c.line, paddingLeft: 15, padding: 5 }}>
        <TextInput accessibilityLabel="What do you need done?" value={goal} onChangeText={setGoal} placeholder="Get Maa's sugar test done" placeholderTextColor={c.placeholder}
          returnKeyType="send" onSubmitEditing={() => onSend(goal)} style={{ flex: 1, paddingVertical: 9, fontFamily: f.reg, fontSize: 15, color: c.ink, minWidth: 0 }} />
        <Tap accessibilityLabel={recording ? "Stop recording" : "Speak your request in any language"} accessibilityState={{ selected: recording }} onPress={onMic}
          style={{ width: 44, height: 44, borderRadius: dk ? 14 : 22, backgroundColor: recording ? c.sos : c.tealSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={recording ? "stop" : "mic"} size={21} color={recording ? "#fff" : c.teal} />
        </Tap>
        <Tap accessibilityLabel="Send" disabled={!goal.trim() || busy} onPress={() => onSend(goal)}
          style={{ width: 44, height: 44, borderRadius: dk ? 14 : 22, backgroundColor: dk ? c.teal : c.ink, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-up" size={22} color={c.onTeal} />
        </Tap>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {IDEAS.map((i) => <Chip key={i.label} label={i.label} icon={i.icon} disabled={busy} onPress={() => onSend(i.goal)} />)}
      </View>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

export function Guardian({ findings, onRun, running }: { findings: Finding[] | null; onRun: () => void; running: boolean }) {
  const scan = useLoop(1300, false, running);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          {running && <Animated.View style={{ position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: c.parrot, opacity: scan.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: scan.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }] }} />}
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.parrotSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="shield-checkmark" size={21} color={c.parrot} /></View>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h2">Guardian</Txt>
          <Txt variant="muted">{running ? "Looking around the courtyard…" : "Watches check-ins, policies and bills."}</Txt>
        </View>
        <Btn label="Look now" kind="ghost" small disabled={running} onPress={onRun} />
      </View>
      {findings?.length === 0 && <Text style={{ fontFamily: f.bold, color: c.parrot }}>Nothing needs attention right now.</Text>}
      {findings?.map((x, i) => (
        <Rise key={i} delay={i * 90} from={10}>
          <View style={{ flexDirection: "row", gap: 10, backgroundColor: c.ivory, borderRadius: 14, padding: 11 }}>
            <Ionicons name={x.severity === "high" ? "alert-circle" : "time"} size={19} color={x.severity === "high" ? c.sos : c.marigold} />
            <Txt style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>{x.message}</Txt>
          </View>
        </Rise>
      ))}
    </Card>
  );
}

export function Drill({ parents, onStart }: { parents: Person[]; onStart: (personId: string | undefined, fail: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string | undefined>();
  const [fail, setFail] = useState(false);
  const chosen = who ?? parents[0]?.id;
  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(214,40,40,0.12)", alignItems: "center", justifyContent: "center" }}><Ionicons name="pulse" size={21} color={c.sos} /></View>
        <View style={{ flex: 1 }}><Txt variant="h2">Emergency drill</Txt><Txt variant="muted">Practise the SOS flow. No real calls are made.</Txt></View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
      </Pressable>
      {open && (
        <Rise from={8} style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {parents.map((p) => <Chip key={p.id} label={callName(p.name)} on={chosen === p.id} onPress={() => setWho(p.id)} />)}
          </View>
          <Pressable onPress={() => setFail(!fail)} accessibilityRole="checkbox" accessibilityState={{ checked: fail }} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={fail ? "checkbox" : "square-outline"} size={22} color={c.teal} /><Txt>Pretend the ambulance fails</Txt>
          </Pressable>
          <Btn label="Start SOS drill" kind="sos" disabled={!parents.length} onPress={() => onStart(chosen, fail)} />
        </Rise>
      )}
    </Card>
  );
}

const pick = (stories: Story[], id: string, kind: string) => stories.find((s) => s.person_id === id && s.kind === kind);

/** Dusk: one tile per parent with their rings. */
export function ParentTiles({ parents, stories, onPress }: { parents: Person[]; stories: Story[]; onPress: () => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {parents.map((p) => {
        const med = pick(stories, p.id, "medicines"), chk = pick(stories, p.id, "checkin");
        const todo = [med, chk].filter((s) => s && !s.ok).length;
        const has = !!(med || chk);
        return (
          <Tap key={p.id} accessibilityLabel={`${p.name}. ${med?.title ?? ""} ${chk?.title ?? ""}. Open today's stories`} onPress={onPress} wrap={{ flexBasis: "47%", flexGrow: 1 }}
            style={{ minHeight: 172, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, padding: 14, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: f.xbold, fontSize: 15.5, color: c.ink }}>{callName(p.name)}</Text>
              {has && <View style={{ backgroundColor: todo ? c.marigoldSoft : c.parrotSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}><Text style={{ fontFamily: f.bold, fontSize: 10.5, color: todo ? c.marigold : c.parrot }}>{todo ? `${todo} to do` : "All good"}</Text></View>}
            </View>
            <Rings size={66} rings={[{ label: "Medicines", value: med?.value ?? 0, color: c.marigold }, { label: "Check-in", value: chk?.value ?? 0, color: c.parrot }]} />
            <View style={{ gap: 2 }}>
              <Text numberOfLines={2} style={{ fontFamily: f.semi, fontSize: 12, lineHeight: 16, color: c.ink }}>{med?.title ?? p.city}</Text>
              <Text numberOfLines={2} style={{ fontFamily: f.reg, fontSize: 11.5, lineHeight: 15, color: c.muted }}>{chk?.title ?? ""}</Text>
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

const TINTS = [["#F3D9B5", "#7A3E12"], ["#D7E6DB", "#1F5A3D"], ["#E6E0F2", "#4B3D78"], ["#F6D8D2", "#8A2D1E"]];

/** Sunlit: the family as story rings. Green = all well, amber = something pending. */
export function FamilyRings({ people, stories, onStories, onInvite }: { people: Person[]; stories: Story[]; onStories: () => void; onInvite: () => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
      {people.map((p, i) => {
        const mine = stories.filter((s) => s.person_id === p.id);
        const ring = !mine.length ? c.line : mine.every((s) => s.ok) ? c.parrot : c.marigold;
        const [bg, fg] = TINTS[i % TINTS.length];
        return (
          <Rise key={p.id} delay={100 + i * 70}>
            <Tap accessibilityLabel={`${p.name}. Open today's stories`} onPress={onStories} style={{ alignItems: "center", gap: 6, width: 64 }}>
              <View style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: ring, padding: 3 }}>
                <View style={{ flex: 1, borderRadius: 30, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: f.serif, fontSize: 20, color: fg }}>{callName(p.name)[0]}</Text></View>
              </View>
              <Text numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 12.5, color: c.ink }}>{callName(p.name)}</Text>
            </Tap>
          </Rise>
        );
      })}
      <Rise delay={450}>
        <Tap accessibilityLabel="Add a family member" onPress={onInvite} style={{ alignItems: "center", gap: 6, width: 64 }}>
          <View style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#C9B596", alignItems: "center", justifyContent: "center" }}><Ionicons name="add" size={24} color={c.muted} /></View>
          <Text style={{ fontFamily: f.semi, fontSize: 12.5, color: c.muted }}>Invite</Text>
        </Tap>
      </Rise>
    </ScrollView>
  );
}

/** Sunlit: the day at home as a hand-drawn timeline. */
export function TodayAtHome({ stories, tasks, onTasks }: { stories: Story[]; tasks: Task[]; onTasks: () => void }) {
  const active = tasks.filter((t) => t.status !== "done").slice(0, 2);
  const items = [
    ...stories.map((s, i) => ({ key: `s${i}`, done: s.ok, title: s.title })),
    ...active.map((t) => ({ key: t.id, done: false, title: t.goal })),
  ].sort((a, b) => Number(b.done) - Number(a.done));
  const done = items.filter((i) => i.done).length;
  return (
    <Card style={{ paddingHorizontal: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <Txt variant="h2">Today at home</Txt>
        {items.length > 0 && <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.muted }}>{done} of {items.length} done</Text>}
      </View>
      {!items.length && <Txt variant="muted">Add your parents and their day appears here.</Txt>}
      {items.map((it, i) => (
        <Rise key={it.key} delay={180 + i * 60} from={8}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: it.done ? c.parrot : c.marigoldSoft, borderWidth: it.done ? 0 : 2, borderColor: c.marigold, alignItems: "center", justifyContent: "center" }}>
                {it.done && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              {i < items.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: c.line }} />}
            </View>
            <Text style={{ flex: 1, paddingBottom: i < items.length - 1 ? 14 : 0, fontFamily: it.done ? f.reg : f.bold, fontSize: 14, lineHeight: 20, color: c.ink }}>{it.title}</Text>
          </View>
        </Rise>
      ))}
      <Pressable accessibilityRole="button" onPress={onTasks} style={{ flexDirection: "row", gap: 4, alignItems: "center", paddingTop: 12 }}>
        <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.teal }}>See every journey</Text><Ionicons name="arrow-forward" size={14} color={c.teal} />
      </Pressable>
    </Card>
  );
}
