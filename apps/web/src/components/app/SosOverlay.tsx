"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Ambulance, CheckCircle2, MapPin, Phone, ShieldAlert, X } from "lucide-react";
import { api, post, type Hospital, type Person, type Task } from "@/lib/api";
import { ApprovalCard } from "./ApprovalCard";

/** SOS: calm, no mascot, no jokes. Red appears nowhere else in the app. */
export function SosOverlay({ familyId, person, simulateFailure, contacts, onClose }: {
  familyId: string; person?: Person; simulateFailure: boolean; contacts: Person[]; onClose: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [started] = useState(() => Date.now());
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    if (!person?.id) return;
    api<{ hospitals: Hospital[] }>(`/families/${familyId}/nearby-hospitals?person_id=${person.id}`).then((r) => setHospitals(r.hospitals)).catch(() => setHospitals([]));
  }, [familyId, person?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await post<Task>(`/families/${familyId}/sos`, { person_id: person?.id, simulate_dispatch_failure: simulateFailure });
        if (!cancelled) setTask(t);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not start SOS. Call 112 now.");
      }
    })();
    return () => { cancelled = true; };
  }, [familyId, person?.id, simulateFailure]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!task || task.status === "done" || task.status === "escalated") return;
    const t = setInterval(async () => { try { setTask(await api<Task>(`/tasks/${task.id}`)); } catch {} }, 2000);
    return () => clearInterval(t);
  }, [task]);

  const elapsed = Math.min(30, Math.floor((now - started) / 1000));
  const dispatched = task?.steps.find((s) => s.title.startsWith("Dispatch"))?.status;
  const approval = task?.approvals.find((a) => a.status === "pending");
  const R = 44, C = 2 * Math.PI * R;

  return (
    <div role="dialog" aria-modal="true" aria-label="Emergency" className="fixed inset-0 z-50 overflow-y-auto bg-ivory">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-5 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sos"><ShieldAlert className="h-6 w-6" aria-hidden /><h1 className="text-xl font-extrabold">Emergency</h1></div>
          <button className="btn btn-ghost min-h-10" onClick={onClose} aria-label="Close emergency screen"><X className="h-4 w-4" aria-hidden /> Close</button>
        </header>
        <p className="text-lg">{person ? <>Help for <b>{person.name}</b> in {person.city || "India"}.</> : "Getting help to your family now."}</p>
        {err && <p role="alert" className="rounded-xl bg-sos/10 p-3 font-bold text-sos">{err}</p>}

        <div className="card flex items-center gap-4 p-4">
          <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
            <circle cx="52" cy="52" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
            <motion.circle cx="52" cy="52" r={R} fill="none" strokeWidth="8" strokeLinecap="round" transform="rotate(-90 52 52)"
              stroke={dispatched === "done" ? "var(--parrot)" : "var(--sos)"} strokeDasharray={C}
              animate={{ strokeDashoffset: dispatched === "done" || task?.status === "escalated" ? 0 : C * (elapsed / 30) }} transition={{ duration: 0.5 }} />
            <text x="52" y="58" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--ink)">{dispatched === "done" ? "✓" : task?.status === "escalated" ? "!" : 30 - elapsed}</text>
          </svg>
          <div>
            <p className="font-extrabold">{dispatched === "done" ? "Ambulance confirmed" : task?.status === "escalated" ? "Escalated to humans" : "Confirming ambulance…"}</p>
            <p className="text-sm text-muted">If not confirmed in 30 seconds, our 24×7 command desk and local contacts are alerted automatically.</p>
          </div>
        </div>

        {task && (
          <ol className="card divide-y divide-line">
            {task.steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3 p-3">
                {s.status === "done" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-parrot" aria-hidden /> : s.status === "failed" ? <X className="mt-0.5 h-5 w-5 text-sos" aria-hidden /> : <Ambulance className="mt-0.5 h-5 w-5 text-muted" aria-hidden />}
                <div><p className="font-semibold">{s.title}</p>{s.detail && <p className="text-sm text-muted">{s.detail}</p>}</div>
              </li>
            ))}
          </ol>
        )}

        {task?.status === "escalated" && (
          <p role="alert" className="rounded-xl bg-sos/10 p-3 font-semibold text-sos">{task.escalation_reason}. A human is taking over. Keep this phone nearby.</p>
        )}
        {approval && <ApprovalCard approval={approval} onDone={async () => task && setTask(await api<Task>(`/tasks/${task.id}`))} />}

        {hospitals.length > 0 && (
          <section aria-label="Nearest hospitals" className="card p-4">
            <h2 className="flex items-center gap-2 font-bold"><MapPin className="h-5 w-5 text-teal" aria-hidden /> Nearest hospitals (real map data)</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {hospitals.slice(0, 3).map((h) => (
                <li key={h.name} className="flex items-center justify-between gap-2 py-2">
                  <span><b>{h.name}</b> <span className="text-muted">· {h.distance_km} km</span></span>
                  <a className="font-bold text-teal underline" href={h.maps_url} target="_blank" rel="noopener noreferrer">Map</a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-xs text-muted">Sandbox: the ambulance and hospital connections are simulated. For a real emergency in India call <b>112</b> or <b>108</b>.</p>

        <section aria-label="Call now" className="mt-auto grid gap-2">
          <a className="btn btn-sos text-lg" href="tel:112"><Phone className="h-5 w-5" aria-hidden /> Call 112</a>
          {contacts.slice(0, 2).map((c) => (
            <a key={c.id} className="btn btn-ghost" href={`tel:${c.phone}`}><Phone className="h-4 w-4" aria-hidden /> Call {c.name}</a>
          ))}
        </section>
      </div>
    </div>
  );
}
