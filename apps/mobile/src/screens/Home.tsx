import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { call, uploadFile, type Finding, type Session, type Weather } from "../api";
import { getUser } from "../auth";
import { ApprovalCard } from "../components/ApprovalCard";
import { callName, Composer, Drill, FamilyRings, Guardian, ParentTiles, shortName, TodayAtHome } from "../components/HomeBlocks";
import type { Mood } from "../components/Mitthu";
import { dayIn, hourIn, SkyClock, timeIn, useNow } from "../components/SkyClock";
import { Stories } from "../components/Stories";
import { TaskTimeline } from "../components/TaskTimeline";
import { c, f, isDark } from "../theme";
import { Btn, IconBtn, Rise, Tap, ThemeToggle, Txt, useApp } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

export function Home({ sess, data, refresh }: { sess: Session; data: FamilyData; refresh: () => Promise<void> }) {
  const { openSos, senior, go } = useApp();
  const sponsor = data.people.find((p) => p.role === "sponsor");
  const parents = data.people.filter((p) => p.role === "parent");
  const pending = data.approvals.filter((a) => a.status === "pending");
  const [goal, setGoal] = useState("");
  const [mood, setMood] = useState<Mood>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [stories, setStories] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstParent = parents[0]?.id;
  const now = useNow();
  const dk = isDark();

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
        if (!uri) { setMood("idle"); return; }
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
      setMood("celebrate"); setTimeout(() => setMood("idle"), 2600);
    } catch (e) { setMood("idle"); setErr(e instanceof Error ? e.message : "Mitthu couldn't do that"); }
  }
  async function guardian() {
    setLooking(true); setErr(null);
    try { setFindings((await call<{ findings: Finding[] }>(sess, `/families/${sess.familyId}/guardian/run`, "POST")).findings); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Guardian check failed"); }
    finally { setLooking(false); }
  }

  const me = getUser()?.name || sponsor?.name || getUser()?.email || "You";
  const initials = me.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const homeTz = parents[0]?.timezone || "Asia/Kolkata";
  const homeCity = parents[0]?.city || "India";
  const escalated = data.tasks.some((t) => t.status === "escalated");
  const shown = data.stories.map((s) => ({ ...s, title: data.people.reduce((t, p) => t.split(p.name).join(callName(p.name)), s.title) }));
  const names = parents.length ? parents.slice(0, 2).map((p) => callName(p.name)).join(" & ") : "";
  const [line1, line2] = escalated ? ["Something at home", "needs you now."]
    : pending.length ? [`${pending.length === 1 ? "One thing is" : `${pending.length} things are`}`, "waiting for you."]
      : !parents.length ? ["Your courtyard", "is ready."]
        : [`${names} ${parents.length > 1 ? "are" : "is"}`, "having a calm day."];
  const hour = hourIn(homeTz, now);
  const greet = hour < 5 || hour >= 21 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const profile = (
    <Tap accessibilityLabel="Safety, trust and settings" onPress={() => go("safety")}
      style={{ width: 44, height: 44, borderRadius: dk ? 15 : 22, backgroundColor: dk ? c.raised : c.ink, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: f.xbold, fontSize: 14, color: dk ? c.teal : c.onTeal }}>{initials}</Text>
    </Tap>
  );
  const tools = (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <IconBtn icon="accessibility-outline" label="Open Senior Mode" onPress={senior} />
      <ThemeToggle />
    </View>
  );

  return (
    <Screen onRefresh={refresh}>
      {dk ? (
        <View key="dusk" style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {profile}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: f.semi, fontSize: 11, letterSpacing: 0.6, color: c.muted, textTransform: "uppercase" }}>{dayIn(sponsor?.timezone, now, { weekday: "long" })}{sponsor?.city ? ` · ${sponsor.city}` : ""}</Text>
              <Text numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 14, color: c.ink }}>{shortName(me)}&apos;s courtyard</Text>
            </View>
            {tools}
          </View>
          <Rise delay={40}>
            <Text accessibilityRole="header" style={{ fontFamily: f.display, fontSize: 39, lineHeight: 42, color: c.ink }}>{line1}{"\n"}<Text style={{ fontFamily: f.italic, color: escalated ? c.sos : c.teal }}>{line2}</Text></Text>
          </Rise>
          {parents[0] && (
            <Rise delay={110}>
              <SkyClock themWeather={weather ? `${weather.temp_c}° · ${weather.summary}` : undefined} you={sponsor?.timezone ?? homeTz} them={homeTz} youLabel={`You · ${sponsor?.city || "Here"}`} themLabel={`Home · ${homeCity}`} />
            </Rise>
          )}
          {parents.length > 0 && <Rise delay={170}><ParentTiles parents={parents} stories={shown} onPress={() => data.stories.length && setStories(true)} /></Rise>}
        </View>
      ) : (
        <View key="sunlit" style={{ gap: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {profile}
            <View style={{ flex: 1 }} />
            {tools}
          </View>
          <Rise delay={40}>
            <Text style={{ fontFamily: f.bold, fontSize: 11.5, letterSpacing: 1.2, color: c.muted, textTransform: "uppercase", marginBottom: 8 }}>
              {dayIn(homeTz, now, { weekday: "short", day: "numeric", month: "short" })} · {homeCity} {timeIn(homeTz, now)}{weather ? ` · ${weather.temp_c}°` : ""}
            </Text>
            <Text accessibilityRole="header" style={{ fontFamily: f.display, fontSize: 42, lineHeight: 45, letterSpacing: -0.8, color: c.ink }}>{greet}{"\n"}from <Text style={{ fontFamily: f.italic, color: c.teal }}>{homeCity}.</Text></Text>
            <Text style={{ fontFamily: f.reg, fontSize: 15, color: c.muted, marginTop: 8 }}>{line1} {line2}</Text>
          </Rise>
          <FamilyRings people={data.people.filter((p) => p.role !== "sponsor")} stories={shown} onStories={() => data.stories.length && setStories(true)} onInvite={() => go("family")} />
        </View>
      )}

      {!dk && <Rise delay={200}><TodayAtHome stories={shown} tasks={data.tasks} onTasks={() => go("tasks")} /></Rise>}

      {pending.map((a) => <Rise key={a.id} delay={240}><ApprovalCard a={a} sess={sess} onDone={refresh} /></Rise>)}

      <Rise delay={260}><Composer goal={goal} setGoal={setGoal} mood={mood} recording={recording} onMic={toggleMic} onSend={submit} error={err} /></Rise>

      {data.stories.length > 0 && (
        <Rise delay={300}>
          <Btn label={`Watch ${parents[0] ? callName(parents[0].name) : "their"}'s day`} kind="ghost" onPress={() => setStories(true)} />
        </Rise>
      )}

      <Rise delay={320}><Guardian findings={findings} onRun={guardian} running={looking} /></Rise>

      {data.tasks[0] && (
        <View style={{ gap: 10 }}>
          <Txt variant="h2">Latest journey</Txt>
          <TaskTimeline key={data.tasks[0].id} task={data.tasks[0]} sess={sess} startOpen={data.tasks[0].status !== "done"} />
        </View>
      )}

      <Drill parents={parents} onStart={(id, fail) => openSos(id, fail)} />

      {stories && <Stories stories={shown} onClose={() => setStories(false)} />}
    </Screen>
  );
}
