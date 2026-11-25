"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Mic, PhoneCall, Pill, Siren, Sun } from "lucide-react";
import { Mitthu } from "@/components/Mitthu";
import { SosOverlay } from "@/components/app/SosOverlay";
import { useRouter } from "next/navigation";
import { api, getFamilyId, post, type MyFamily, type Person } from "@/lib/api";
import { getSession } from "@/lib/auth";

/** Senior Mode: 4 huge buttons, 7:1+ contrast, 64px+ targets, a garland that grows with the streak. */
export default function SeniorPage() {
  const router = useRouter();
  const [fid, setFid] = useState<string | null | undefined>(undefined);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sos, setSos] = useState(false);
  const [taken, setTaken] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getSession()) { router.replace("/login"); return; }
    // Use the saved family, or fall back to the first family this account belongs to.
    const saved = getFamilyId();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved family lives in localStorage, readable only on the client
    if (saved) { setFid(saved); return; }
    api<MyFamily[]>("/me/families").then((l) => setFid(l[0]?.id ?? null)).catch((e) => { setFid(null); setErr(e.message); });
  }, [router]);
  useEffect(() => {
    if (!fid) return;
    api<Person[]>(`/families/${fid}/people`).then((p) => { setPeople(p); setMe((m) => m || p.find((x) => x.role === "parent")?.id || ""); }).catch((e) => setErr(e.message));
  }, [fid]);

  const person = people.find((p) => p.id === me);
  const kids = people.filter((p) => p.role === "sponsor" || p.role === "relative");

  async function checkIn() {
    setErr(null);
    try { await post(`/people/${me}/checkin`); setChecked(true); setMsg("Thank you! Your family knows you are well. 🦜"); } catch (e) { setErr(e instanceof Error ? e.message : "Could not check in"); }
  }
  async function tookMed(name: string) {
    setErr(null);
    try { await post(`/people/${me}/medication-taken?name=${encodeURIComponent(name)}`); setTaken((t) => [...t, name]); } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  }

  if (fid === undefined) return null;
  if (!fid) return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Mitthu size={110} />
      <p className="text-2xl font-bold">Ask your son or daughter to set up Aangan first.</p>
      <Link href="/app" className="btn btn-primary text-xl">Set up now</Link>
    </main>
  );

  const meds = person?.medications ?? [];
  const flowers = taken.length + (checked ? 1 : 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-[#FFFDF8] p-5 text-[#111]" style={{ ["--ink" as string]: "#111" }}>
      <header className="flex items-center gap-3">
        <Mitthu size={72} mood={checked ? "celebrate" : "idle"} />
        <div>
          <h1 className="font-serif text-3xl font-extrabold">Namaste{person ? `, ${person.name.split(" ")[0]}` : ""}</h1>
          <p className="text-xl">How are you today?</p>
        </div>
      </header>

      {people.filter((p) => p.role === "parent").length > 1 && (
        <label className="text-lg font-bold">I am
          <select value={me} onChange={(e) => { setMe(e.target.value); setTaken([]); setChecked(false); setMsg(null); }} className="mt-1 w-full rounded-2xl border-2 border-[#111] bg-white p-4 text-xl">
            {people.filter((p) => p.role === "parent").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <button onClick={() => setSos(true)} className="flex min-h-28 items-center justify-center gap-4 rounded-3xl bg-[#B00020] text-3xl font-extrabold text-white shadow-lg active:scale-[0.98]">
        <Siren className="h-10 w-10" aria-hidden /> I NEED HELP
      </button>

      <button onClick={checkIn} disabled={!me} className="flex min-h-24 items-center justify-center gap-4 rounded-3xl bg-[#0B4F5E] text-2xl font-extrabold text-white active:scale-[0.98] disabled:opacity-60">
        <Sun className="h-9 w-9" aria-hidden /> {me ? "I am fine today" : "Loading…"}
      </button>

      <section aria-label="My medicines" className="rounded-3xl border-4 border-[#111] bg-white p-4">
        <h2 className="mb-2 flex items-center gap-2 text-2xl font-extrabold"><Pill className="h-7 w-7" aria-hidden /> My medicines</h2>
        {meds.length === 0 && <p className="text-xl">No medicines are listed.</p>}
        <ul className="grid gap-3">
          {meds.map((m) => {
            const done = taken.includes(m.name);
            return (
              <li key={m.name}>
                <button disabled={done || !me} onClick={() => tookMed(m.name)} className={`flex min-h-20 w-full items-center justify-between gap-3 rounded-2xl p-4 text-left text-xl font-bold ${done ? "bg-[#1E6B2B] text-white" : "bg-[#FFE6A6]"}`}>
                  <span>{m.name}<br /><span className="text-base font-semibold">{m.times?.join(", ")}</span></span>
                  {done ? <Check className="h-8 w-8" aria-label="Taken" /> : <span className="rounded-full bg-white px-4 py-2 text-lg">I took it</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Call my family" className="grid gap-3">
        {kids.map((k) => (
          <a key={k.id} href={`tel:${k.phone}`} className="flex min-h-20 items-center gap-4 rounded-3xl bg-white p-4 text-2xl font-extrabold ring-4 ring-[#0B4F5E]">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0B4F5E] text-2xl text-white" aria-hidden>{k.name[0]}</span>
            <span className="flex-1">Call {k.name.split(" ")[0]}</span><PhoneCall className="h-8 w-8" aria-hidden />
          </a>
        ))}
        <p className="flex items-center gap-2 text-lg font-semibold"><Mic className="h-6 w-6" aria-hidden /> Tip: send a voice note to Aangan on WhatsApp in your language.</p>
      </section>

      <div className="rounded-3xl bg-[#FFF1CC] p-4 text-center" aria-label={`Garland with ${flowers} flowers`}>
        <p className="text-xl font-bold">Today&apos;s garland</p>
        <p className="mt-1 text-4xl" aria-hidden>{flowers ? "🌼".repeat(flowers) : "🌱"}</p>
      </div>

      {msg && <p role="status" className="rounded-2xl bg-[#DFF3E1] p-4 text-xl font-bold">{msg}</p>}
      {err && <p role="alert" className="rounded-2xl bg-[#FFE0E0] p-4 text-xl font-bold text-[#8A0017]">{err}</p>}

      {sos && fid && <SosOverlay familyId={fid} person={person} simulateFailure={false} contacts={people.filter((p) => p.is_emergency_contact)} onClose={() => setSos(false)} />}
    </main>
  );
}
