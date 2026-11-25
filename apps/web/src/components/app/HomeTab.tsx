"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { BookOpen, Mic, Send, ShieldCheck, Siren } from "lucide-react";
import { Mitthu, type MitthuMood } from "@/components/Mitthu";
import { Rings } from "@/components/Rings";
import { SkyClock } from "@/components/SkyClock";
import { api, post, upload, type Person, type Weather } from "@/lib/api";
import type { FamilyData, Finding } from "@/lib/useFamily";
import { ApprovalCard } from "./ApprovalCard";
import { Stories } from "./Stories";
import { TaskTimeline } from "./TaskTimeline";

const CHIPS = ["Book a blood test for Maa", "Pay the electricity bill", "Send a plumber to the flat", "Pay electricity bill Rs 9,000"];

export function HomeTab({ familyId, data, refresh, onSos }: {
  familyId: string; data: FamilyData; refresh: () => Promise<void>; onSos: (p: Person | undefined, fail: boolean) => void;
}) {
  const sponsor = data.people.find((p) => p.role === "sponsor");
  const parents = data.people.filter((p) => p.role === "parent");
  const pending = data.approvals.filter((a) => a.status === "pending");
  const [goal, setGoal] = useState("");
  const [mood, setMood] = useState<MitthuMood>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [stories, setStories] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [sosWho, setSosWho] = useState("");
  const [sosFail, setSosFail] = useState(false);
  const [listening, setListening] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const firstParent = parents[0]?.id;

  useEffect(() => {
    if (!firstParent) return;
    api<{ weather: Weather | null }>(`/families/${familyId}/weather?person_id=${firstParent}`).then((r) => setWeather(r.weather)).catch(() => setWeather(null));
  }, [familyId, firstParent]);

  async function submit(text: string) {
    if (!text.trim()) return;
    setErr(null);
    setMood("thinking");
    try {
      await post(`/families/${familyId}/tasks`, { goal: text });
      setGoal("");
      await refresh();
      setMood("celebrate");
      setTimeout(() => setMood("idle"), 2200);
    } catch (e) {
      setMood("idle");
      setErr(e instanceof Error ? e.message : "Mitthu couldn't do that");
    }
  }

  /** Record from the microphone; the server transcribes it with Sarvam (Hindi, Marathi, Tamil... and mixed speech). */
  async function listen() {
    if (recorder.current) { recorder.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErr("Voice recording isn't supported in this browser. Type your request instead.");
      return;
    }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setErr("Microphone permission was denied. Allow it in the browser, or type your request."); return; }
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setListening(false);
      setMood("thinking");
      try {
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const r = await upload<{ transcript: string }>(`/families/${familyId}/voice/transcribe`, blob, "voice.webm");
        setGoal(r.transcript);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't hear that. Try again or type it.");
      } finally { setMood("idle"); }
    };
    recorder.current = mr;
    mr.start();
    setListening(true);
    setMood("listening");
    setTimeout(() => { if (recorder.current === mr && mr.state === "recording") mr.stop(); }, 30_000); // 30 s cap
  }

  async function runGuardian() {
    try {
      const r = await post<{ findings: Finding[] }>(`/families/${familyId}/guardian/run`);
      setFindings(r.findings);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Guardian check failed");
    }
  }

  // Greet by the *sponsor's* local time, not the server/browser machine's.
  let hour = new Date().getHours();
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: sponsor?.timezone, hour: "numeric", hour12: false }).format(new Date())) % 24;
  } catch {}
  const hello = hour < 5 || hour >= 22 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const latest = data.tasks[0];
  const summary = pending.length
    ? `${pending.length} thing${pending.length > 1 ? "s" : ""} need your OK`
    : data.tasks.some((t) => t.status === "escalated") ? "A task was escalated, check Tasks" : "All quiet in the courtyard";

  return (
    <div className="flex flex-col gap-5">
      {sponsor && parents[0] && (
        <SkyClock themWeather={weather ? `${weather.temp_c}°C · ${weather.summary}` : undefined} you={sponsor.timezone} them={parents[0].timezone} youLabel={`You · ${sponsor.city || "Home"}`} themLabel={`${parents[0].name.split(" ")[0]} · ${parents[0].city || "India"}`} />
      )}

      <section className="flex items-center gap-3">
        <Mitthu mood={mood} size={72} />
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-bold leading-tight">{hello}{sponsor ? `, ${sponsor.name.split(" ")[0]}` : ""}</h1>
          <p className="text-muted">{summary}</p>
        </div>
      </section>

      {pending.map((a) => <ApprovalCard key={a.id} approval={a} onDone={refresh} />)}

      <section className="card p-4" aria-labelledby="tell">
        <h2 id="tell" className="font-serif text-lg font-bold">Tell Mitthu what you need</h2>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(goal); }}>
          <input aria-label="What do you need done?" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Get Maa's sugar test done this week"
            className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-3" />
          <button type="button" onClick={listen} aria-label={listening ? "Stop recording" : "Speak your request"} aria-pressed={listening} className={`btn btn-ghost px-3 ${listening ? "border-marigold" : ""}`}><Mic className="h-5 w-5" /></button>
          <button className="btn btn-primary px-4" aria-label="Send" disabled={mood === "thinking" || !goal.trim()}><Send className="h-5 w-5" /></button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button key={c} className="rounded-full bg-teal-soft px-3 py-1.5 text-sm font-semibold text-teal" onClick={() => submit(c)} disabled={mood === "thinking"}>{c}</button>
          ))}
        </div>
        {err && <p role="alert" className="mt-2 text-sm font-semibold text-terracotta">{err}</p>}
      </section>

      {latest && (
        <section aria-label="Latest task">
          <h2 className="mb-2 font-serif text-lg font-bold">Latest</h2>
          <TaskTimeline task={latest} />
        </section>
      )}

      <section aria-label="Parents">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">Your parents</h2>
          <button className="btn btn-ghost min-h-9 text-sm" disabled={!data.stories.length} onClick={() => setStories(true)}><BookOpen className="h-4 w-4" aria-hidden /> Today&apos;s stories</button>
        </div>
        {parents.length === 0 && (
          <div className="card rangoli p-6 text-center"><p className="font-semibold">No parents added yet.</p><p className="text-sm text-muted">Add them in the Family tab and Mitthu will start looking after them.</p></div>
        )}
        <div className="grid gap-3">
          {parents.map((p) => {
            const med = data.stories.find((s) => s.person_id === p.id && s.kind === "medicines");
            const chk = data.stories.find((s) => s.person_id === p.id && s.kind === "checkin");
            return (
              <motion.div key={p.id} layout className="card flex items-center gap-4 p-4">
                <Rings size={84} rings={[{ label: "Medicines", value: med?.value ?? 0, color: "#3FA34D" }, { label: "Check-in", value: chk?.value ?? 0, color: "#F4A300" }]} />
                <div className="min-w-0">
                  <p className="font-serif text-lg font-bold">{p.name}</p>
                  <p className="text-sm text-muted">{p.city}{p.conditions.length ? ` · ${p.conditions.join(", ")}` : ""}</p>
                  <p className="mt-1 text-sm">{med?.title}</p>
                  <p className="text-sm">{chk?.title}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="card p-4" aria-labelledby="guardian">
        <div className="flex items-center justify-between gap-2">
          <h2 id="guardian" className="flex items-center gap-2 font-serif text-lg font-bold"><ShieldCheck className="h-5 w-5 text-teal" aria-hidden /> Guardian</h2>
          <button className="btn btn-teal min-h-9 text-sm" onClick={runGuardian}>Run check</button>
        </div>
        {findings === null ? <p className="mt-2 text-sm text-muted">Mitthu watches for missed check-ins, expiring policies and bills due.</p>
          : findings.length === 0 ? <p className="mt-2 text-sm font-semibold text-parrot">Nothing needs attention right now.</p>
          : <ul className="mt-2 space-y-1.5">{findings.map((f, i) => <li key={i} className="flex gap-2 text-sm"><span aria-hidden>{f.severity === "high" ? "🔴" : "🟡"}</span>{f.message}</li>)}</ul>}
      </section>

      <section className="card p-4" aria-labelledby="sosdemo">
        <h2 id="sosdemo" className="font-serif text-lg font-bold">Emergency drill</h2>
        <p className="text-sm text-muted">Try the SOS flow with mock hospital and ambulance connectors. No real calls are made.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select aria-label="Who needs help" className="rounded-full border border-line bg-card px-3 py-2" value={sosWho} onChange={(e) => setSosWho(e.target.value)}>
            <option value="">Select a parent</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sosFail} onChange={(e) => setSosFail(e.target.checked)} /> Simulate ambulance failure</label>
          <button className="btn btn-sos" disabled={!parents.length} onClick={() => onSos(parents.find((p) => p.id === sosWho) ?? parents[0], sosFail)}><Siren className="h-5 w-5" aria-hidden /> Start SOS drill</button>
        </div>
      </section>

      {stories && <Stories stories={data.stories} onClose={() => setStories(false)} />}
    </div>
  );
}
