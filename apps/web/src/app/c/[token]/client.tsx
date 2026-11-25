"use client";
import { use, useEffect, useState } from "react";
import { Camera, CheckCircle2, MapPin, TriangleAlert } from "lucide-react";
import { api, post } from "@/lib/api";

type View = { task_id: string; job: string; steps: { title: string; status: string }[] };

/** Caregiver portal: one job, one link, no login. Sees only what the job needs. */
export default function CaregiverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => { api<View>(`/caregiver/${token}`).then(setView).catch((e) => setErr(e.message)); }, [token]);

  async function send(status: "arrived" | "done" | "issue") {
    setBusy(true); setErr(null);
    try {
      const full = [note, photo ? `[photo: ${photo}]` : ""].filter(Boolean).join(" ");
      await post(`/caregiver/${token}/checkin`, { status, note: full });
      setSent(status); setNote(""); setPhoto(null);
    }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not send. Try again."); }
    finally { setBusy(false); }
  }

  if (err && !view) return <main className="mx-auto max-w-md p-6"><p role="alert" className="card p-6 text-center font-bold">This job link has expired. Please ask the family for a new one.</p></main>;
  if (!view) return <main className="mx-auto max-w-md p-6"><div className="skeleton h-48" aria-busy="true" /></main>;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <header><p className="text-sm font-bold uppercase tracking-wide text-muted">Your job</p><h1 className="font-serif text-2xl font-bold">{view.job}</h1></header>
      <ol className="card divide-y divide-line">{view.steps.map((s) => <li key={s.title} className="flex gap-2 p-3"><CheckCircle2 className={`h-5 w-5 ${s.status === "done" ? "text-parrot" : "text-line"}`} aria-hidden />{s.title}</li>)}</ol>
      <label className="text-sm font-semibold">Note for the family (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-line bg-transparent p-3" placeholder="e.g. Gate was locked, security let me in" />
      </label>
      <button className="btn btn-teal min-h-16 text-xl" disabled={busy} onClick={() => send("arrived")}><MapPin className="h-6 w-6" aria-hidden /> I&apos;ve arrived</button>
      <label className="btn btn-ghost min-h-14"><Camera className="h-5 w-5" aria-hidden /> {photo ? `Photo selected: ${photo}` : "Add photo proof"}<input type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} /></label>
      {photo && <p className="text-xs text-muted">Demo build: only the file name is sent with your update. Photo upload to secure storage is coming.</p>}
      <button className="btn btn-primary min-h-16 text-xl" disabled={busy} onClick={() => send("done")}><CheckCircle2 className="h-6 w-6" aria-hidden /> Job done</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => send("issue")}><TriangleAlert className="h-5 w-5" aria-hidden /> Report a problem</button>
      {sent && <p role="status" className="rounded-xl bg-parrot/15 p-3 font-bold text-parrot">Sent: {sent}. The family has been told.</p>}
      {err && <p role="alert" className="font-semibold text-terracotta">{err}</p>}
      <p className="text-center text-xs text-muted">You can see only this job. No account needed. This link expires.</p>
    </main>
  );
}
