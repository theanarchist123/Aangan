"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { LogOut, Plane } from "lucide-react";
import { Mitthu } from "@/components/Mitthu";
import { post } from "@/lib/api";

/** Shown after sign-in when the account has no family yet. */
export function Onboarding({ onDone, onSignOut, userName }: { onDone: (id: string) => void; onSignOut: () => void; userName?: string }) {
  const [step, setStep] = useState<"welcome" | "form">("welcome");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", sponsor_name: userName?.includes("@") ? "" : userName ?? "", sponsor_city: "", sponsor_timezone: "America/Los_Angeles" });

  async function run(fn: () => Promise<{ id?: string; family_id?: string }>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      onDone((r.id ?? r.family_id)!);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="rangoli mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="relative h-28 w-full" aria-hidden>
        <span className="absolute left-4 top-16 text-xs font-bold text-muted">Seattle</span>
        <span className="absolute right-4 top-16 text-xs font-bold text-muted">Pune</span>
        <motion.div className="absolute left-4 top-6" animate={{ x: [0, 250] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}>
          <Plane className="h-6 w-6 text-teal" />
        </motion.div>
        <svg className="absolute inset-0" viewBox="0 0 300 100" preserveAspectRatio="none">
          <path d="M20 70 Q150 -20 280 70" fill="none" stroke="var(--teal)" strokeWidth="2" strokeDasharray="4 6" opacity="0.5" />
        </svg>
      </div>
      <Mitthu mood={busy ? "thinking" : "idle"} size={110} />
      <div>
        <h1 className="font-serif text-4xl font-bold text-teal">Welcome{userName ? `, ${userName.split(" ")[0].split("@")[0]}` : ""}</h1>
        <p className="mt-2 text-lg text-ink">Let&apos;s set up your family&apos;s courtyard.</p>
      </div>

      {step === "welcome" ? (
        <div className="flex w-full flex-col gap-3">
          <button className="btn btn-primary" onClick={() => setStep("form")}>Set up my family</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => post<{ family_id: string }>("/demo/seed"))}>
            {busy ? "Opening the courtyard…" : "Explore the Sharma family demo"}
          </button>
          <button className="mt-2 inline-flex items-center justify-center gap-2 text-sm font-bold text-muted underline" onClick={onSignOut}><LogOut className="h-4 w-4" aria-hidden /> Sign out</button>
        </div>
      ) : (
        <form className="card flex w-full flex-col gap-3 p-5 text-left" onSubmit={(e) => { e.preventDefault(); void run(() => post<{ id: string }>("/families", form)); }}>
          <p className="font-serif text-xl font-bold">Who are we looking after?</p>
          <label className="text-sm font-semibold">Family name
            <input required className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-3" placeholder="The Sharma Family" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">Your name
            <input required className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-3" placeholder="Rahul" value={form.sponsor_name} onChange={(e) => setForm({ ...form, sponsor_name: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">Where do you live?
            <input className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-3" placeholder="Seattle" value={form.sponsor_city} onChange={(e) => setForm({ ...form, sponsor_city: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">Your time zone
            <select className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-3" value={form.sponsor_timezone} onChange={(e) => setForm({ ...form, sponsor_timezone: e.target.value })}>
              {["America/Los_Angeles", "America/New_York", "America/Chicago", "Europe/London", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create our courtyard"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setStep("welcome")}>Back</button>
        </form>
      )}
      {err && <p role="alert" className="text-sm font-semibold text-terracotta">{err}</p>}
    </main>
  );
}
