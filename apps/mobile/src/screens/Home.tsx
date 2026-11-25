import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { call, uploadFile, type Finding, type Session, type Weather } from "../api";
import { useTheme } from "../ThemeContext";
import { ApprovalCard } from "../components/ApprovalCard";
import { Mitthu, type Mood } from "../components/Mitthu";
import { Rings } from "../components/Rings";
import { hourIn, SkyClock } from "../components/SkyClock";
import { Stories } from "../components/Stories";
import { TaskTimeline } from "../components/TaskTimeline";
import { c, f } from "../theme";
import { Btn, Card, Empty, ErrorText, Txt, useApp } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

const CHIPS = ["Book a blood test for Maa", "Pay the electricity bill", "Send a plumber to the flat", "Pay electricity bill Rs 9,000"];

export function Home({ sess, data, refresh }: { sess: Session; data: FamilyData; refresh: () => Promise<void> }) {
  const { openSos, senior } = useApp();
  const sponsor = data.people.find((p) => p.role === "sponsor");
  const parents = data.people.filter((p) => p.role === "parent");
  const pending = data.approvals.filter((a) => a.status === "pending");
  const [goal, setGoal] = useState("");
  const [mood, setMood] = useState<Mood>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [stories, setStories] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [sosWho, setSosWho] = useState<string | undefined>(undefined);
  const [sosFail, setSosFail] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pref, setPref, scheme } = useTheme();
  const firstParent = parents[0]?.id;

  useEffect(() => {
    if (!firstParent) return;
    call<{ weather: Weather | null }>(sess, `/families/${sess.familyId}/weather?person_id=${firstParent}`).then((r) => setWeather(r.weather)).catch(() => setWeather(null));
  }, [sess, firstParent]);

  /** Record, then the server transcribes with Sarvam (Hindi, Marathi, Tamil... and mixed speech). */
  async function toggleMic() {
    setErr(null);
    try {
      if (recording) {
        if (stopTimer.current) clearTimeout(stopTimer.current);
        await recorder.stop();
        setRecording(false);
        const uri = recorder.uri;
        if (!uri) return;
        setMood("thinking");
        const r = await uploadFile<{ transcript: string }>(`/families/${sess.familyId}/voice/transcribe-b64`, { uri, name: "voice.m4a", type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4" });
        setGoal(r.transcript);
        setMood("idle");
        return;
      }
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setErr("Microphone permission is off. Allow it in phone settings, or type your request."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true); setMood("listening");
      stopTimer.current = setTimeout(() => { void toggleMic(); }, 30_000); // 30 s cap
    } catch (e) {
      setRecording(false); setMood("idle");
      setErr(e instanceof Error ? e.message : "Couldn't record. Please type your request.");
    }
  }

  async function submit(text: string) {
    if (!text.trim()) return;
    setErr(null); setMood("thinking");
    try {
      await call(sess, `/families/${sess.familyId}/tasks`, "POST", { goal: text });
      setGoal(""); await refresh();
      setMood("celebrate"); setTimeout(() => setMood("idle"), 2200);
    } catch (e) { setMood("idle"); setErr(e instanceof Error ? e.message : "Mitthu couldn't do that"); }
  }
  async function guardian() {
    try { setFindings((await call<{ findings: Finding[] }>(sess, `/families/${sess.familyId}/guardian/run`, "POST")).findings); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Guardian check failed"); }
  }

  const hour = hourIn(sponsor?.timezone, new Date());
  const hello = hour < 5 || hour >= 22 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const summary = pending.length ? `${pending.length} thing${pending.length > 1 ? "s" : ""} need your OK`
    : data.tasks.some((t) => t.status === "escalated") ? "A task was escalated, see Tasks" : "All quiet in the courtyard";

  return (
    <Screen onRefresh={refresh}>
      {sponsor && parents[0] && (
        <SkyClock themWeather={weather ? `${weather.temp_c}°C · ${weather.summary}` : undefined} you={sponsor.timezone} them={parents[0].timezone} youLabel={`You · ${sponsor.city || "Home"}`} themLabel={`${parents[0].name.split(" ")[0]} · ${parents[0].city || "India"}`} />
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mitthu mood={mood} size={74} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: f.serif, fontSize: 25, color: c.ink }}>{hello}{sponsor ? `, ${sponsor.name.split(" ")[0]}` : ""}</Text>
          <Txt variant="muted" style={{ fontSize: 15 }}>{summary}</Txt>
        </View>
        <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Senior Mode" onPress={senior} style={{ padding: 10, borderRadius: 14, backgroundColor: c.tealSoft }}>
            <Ionicons name="accessibility" size={22} color={c.teal} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Theme: ${pref}. Tap to change.`} onPress={() => setPref(pref === "system" ? "light" : pref === "light" ? "dark" : "system")} style={{ padding: 10, borderRadius: 14, backgroundColor: c.tealSoft, alignItems: "center" }}>
            <Ionicons name={pref === "system" ? "phone-portrait-outline" : scheme === "dark" ? "moon" : "sunny"} size={22} color={c.teal} />
          </Pressable>
        </View>
      </View>

      {pending.map((a) => <ApprovalCard key={a.id} a={a} sess={sess} onDone={refresh} />)}

      <Card>
        <Txt variant="h2">Tell Mitthu what you need</Txt>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TextInput accessibilityLabel="What do you need done?" value={goal} onChangeText={setGoal} placeholder="e.g. Get Maa's sugar test done this week"
            placeholderTextColor={c.placeholder} returnKeyType="send" onSubmitEditing={() => submit(goal)}
            style={{ flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, fontFamily: f.reg, fontSize: 15, color: c.ink, backgroundColor: c.inputBg }} />
          <Pressable accessibilityRole="button" accessibilityLabel={recording ? "Stop recording" : "Speak your request"} accessibilityState={{ selected: recording }} onPress={toggleMic}
            style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: recording ? c.sos : c.line, backgroundColor: recording ? "rgba(214,40,40,0.12)" : "transparent", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={recording ? "stop" : "mic"} size={22} color={recording ? c.sos : c.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!goal.trim() || mood === "thinking"} onPress={() => submit(goal)}
            style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.marigold, alignItems: "center", justifyContent: "center", opacity: !goal.trim() ? 0.45 : 1 }}>
            <Ionicons name="send" size={20} color="#2a1c00" />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {CHIPS.map((t) => (
            <Pressable key={t} accessibilityRole="button" onPress={() => submit(t)} disabled={mood === "thinking"} style={{ backgroundColor: c.tealSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }}>
              <Text style={{ fontFamily: f.semi, color: c.teal, fontSize: 13 }}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <ErrorText>{err}</ErrorText>
      </Card>

      {data.tasks[0] && (<View style={{ gap: 8 }}><Txt variant="h2">Latest</Txt><TaskTimeline task={data.tasks[0]} sess={sess} /></View>)}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt variant="h2">Your parents</Txt>
          <Btn label="Today's stories" kind="ghost" small disabled={!data.stories.length} onPress={() => setStories(true)} icon={<Ionicons name="albums" size={16} color={c.ink} />} />
        </View>
        {parents.length === 0 && <Empty emoji="🏡" title="No parents added yet" hint="Add them in the Family tab and Mitthu starts looking after them." />}
        {parents.map((p) => {
          const med = data.stories.find((s) => s.person_id === p.id && s.kind === "medicines");
          const chk = data.stories.find((s) => s.person_id === p.id && s.kind === "checkin");
          return (
            <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Rings size={86} rings={[{ label: "Medicines", value: med?.value ?? 0, color: c.parrot }, { label: "Check-in", value: chk?.value ?? 0, color: c.marigold }]} />
              <View style={{ flex: 1 }}>
                <Txt variant="h2">{p.name}</Txt>
                <Txt variant="muted">{p.city}{p.conditions.length ? ` · ${p.conditions.join(", ")}` : ""}</Txt>
                <Txt style={{ marginTop: 4, fontSize: 14 }}>{med?.title}</Txt>
                <Txt style={{ fontSize: 14 }}>{chk?.title}</Txt>
              </View>
            </Card>
          );
        })}
      </View>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons name="shield-checkmark" size={20} color={c.teal} /><Txt variant="h2">Guardian</Txt></View>
          <Btn label="Run check" kind="teal" small onPress={guardian} />
        </View>
        {findings === null ? <Txt variant="muted" style={{ marginTop: 8 }}>Mitthu watches for missed check-ins, expiring policies and bills due.</Txt>
          : findings.length === 0 ? <Text style={{ marginTop: 8, fontFamily: f.bold, color: c.parrot }}>Nothing needs attention right now.</Text>
          : findings.map((x, i) => <Txt key={i} style={{ marginTop: 6 }}>{x.severity === "high" ? "🔴" : "🟡"} {x.message}</Txt>)}
      </Card>

      <Card>
        <Txt variant="h2">Emergency drill</Txt>
        <Txt variant="muted" style={{ marginTop: 2 }}>Try the SOS flow with mock hospital and ambulance connectors. No real calls are made.</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {parents.map((p) => {
            const on = (sosWho ?? parents[0]?.id) === p.id;
            return <Pressable key={p.id} onPress={() => setSosWho(p.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? c.teal : c.tealSoft }}><Text style={{ fontFamily: f.semi, color: on ? "#fff" : c.teal, fontSize: 13 }}>{p.name.split(" (")[0]}</Text></Pressable>;
          })}
        </View>
        <Pressable onPress={() => setSosFail(!sosFail)} accessibilityRole="checkbox" accessibilityState={{ checked: sosFail }} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 }}>
          <Ionicons name={sosFail ? "checkbox" : "square-outline"} size={22} color={c.teal} /><Txt>Simulate ambulance failure</Txt>
        </Pressable>
        <Btn label="Start SOS drill" kind="sos" disabled={!parents.length} onPress={() => openSos(sosWho ?? parents[0]?.id, sosFail)} icon={<Ionicons name="alert-circle" size={20} color="#fff" />} />
      </Card>

      {stories && <Stories stories={data.stories} onClose={() => setStories(false)} />}
    </Screen>
  );
}
