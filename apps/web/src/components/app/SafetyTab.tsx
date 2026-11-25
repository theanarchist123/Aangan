"use client";
import { useState } from "react";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { FamilyData } from "@/lib/useFamily";

const RULES = [
  { key: "medical_service", label: "Medical bookings", hint: "Always ask me first" , mode: "always_ask" },
  { key: "home_service", label: "Home services", hint: "Always ask me first", mode: "always_ask" },
  { key: "utility", label: "Utility bills", hint: "Never pay automatically", mode: "never_auto" },
] as const;

export function SafetyTab({ familyId, data, refresh, role }: { familyId: string; data: FamilyData; refresh: () => Promise<void>; role?: string }) {
  const canEdit = role === "sponsor";
  const fam = data.family;
  const [limit, setLimit] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!fam) return null;
  const value = limit ?? fam.auto_approve_limit_inr;

  async function save(body: object) {
    setErr(null); setSaved(false);
    try {
      await api(`/families/${familyId}/limits`, { method: "PATCH", body: JSON.stringify(body) });
      setSaved(true); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-2xl font-bold">Safety &amp; trust</h1>

      <section className="card p-4" aria-labelledby="limit">
        <h2 id="limit" className="font-serif text-lg font-bold">Auto-approve limit</h2>
        <p className="text-sm text-muted">Mitthu can book routine services up to this amount on its own. Anything above needs your biometric approval.</p>
        <p className="my-3 text-4xl font-extrabold text-teal">₹{value.toLocaleString("en-IN")}</p>
        <input type="range" disabled={!canEdit} min={0} max={20000} step={500} value={value} aria-label="Auto-approve limit in rupees"
          onChange={(e) => setLimit(Number(e.target.value))} onPointerUp={() => limit !== null && save({ auto_approve_limit_inr: limit })}
          onKeyUp={() => limit !== null && save({ auto_approve_limit_inr: limit })} className="w-full accent-[var(--marigold)]" />
        <div className="flex justify-between text-xs text-muted"><span>₹0</span><span>₹20,000</span></div>
        {saved && <p role="status" className="mt-2 text-sm font-semibold text-parrot">Saved.</p>}
        {!canEdit && <p className="mt-2 text-sm text-muted">Only the family sponsor can change limits and rules.</p>}
      </section>

      <section className="card p-4" aria-labelledby="rules">
        <h2 id="rules" className="font-serif text-lg font-bold">Rules by category</h2>
        <ul className="mt-2 divide-y divide-line">
          {RULES.map((r) => {
            const on = fam.category_rules[r.key] === r.mode;
            return (
              <li key={r.key} className="flex items-center justify-between gap-3 py-3">
                <span><b>{r.label}</b><br /><span className="text-sm text-muted">{r.hint}</span></span>
                <button role="switch" disabled={!canEdit} aria-checked={on} aria-label={`${r.label}: ${r.hint}`}
                  onClick={() => { const next = { ...fam.category_rules }; if (on) delete next[r.key]; else next[r.key] = r.mode; void save({ category_rules: next }); }}
                  className={`h-8 w-14 rounded-full p-1 transition-colors ${on ? "bg-teal" : "bg-line"}`}>
                  <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${on ? "translate-x-6" : ""}`} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">Medical consent, sharing documents and legal actions always need your approval.</p>
      </section>

      <section className="card p-4" aria-labelledby="audit">
        <div className="flex items-center justify-between gap-2">
          <h2 id="audit" className="font-serif text-lg font-bold">Audit trail</h2>
          {data.audit && (data.audit.intact
            ? <span className="flex items-center gap-1 text-sm font-bold text-parrot"><BadgeCheck className="h-4 w-4" aria-hidden /> Tamper-proof ✓</span>
            : <span className="flex items-center gap-1 text-sm font-bold text-sos"><ShieldAlert className="h-4 w-4" aria-hidden /> Chain broken!</span>)}
        </div>
        <p className="text-sm text-muted">Every agent action is recorded and chained with a hash, so edits would show.</p>
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto text-sm">
          {data.audit?.entries.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 py-2"><span className="min-w-0"><b>{e.action}</b> <span className="text-muted">by {e.actor}</span></span><code className="shrink-0 text-xs text-muted">{e.hash}</code></li>
          ))}
        </ul>
      </section>

      <section className="card p-4" aria-labelledby="notes">
        <h2 id="notes" className="font-serif text-lg font-bold">Notifications sent</h2>
        {data.notices.length === 0 && <p className="text-sm text-muted">Nothing sent yet.</p>}
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto text-sm">
          {data.notices.map((n) => (
            <li key={n.id} className="py-2"><span className={`mr-2 rounded px-1.5 text-xs font-bold ${n.urgent ? "bg-sos/15 text-sos" : "bg-line"}`}>{n.channel}</span><b>{n.to}</b>: {n.message}
              <span className={`ml-2 rounded px-1.5 text-xs font-bold ${n.delivery === "sent" ? "bg-parrot/15 text-parrot" : n.delivery.startsWith("failed") ? "bg-sos/15 text-sos" : "bg-line text-muted"}`}>
                {n.delivery === "sent" ? "delivered on WhatsApp" : n.delivery.startsWith("failed") ? "not delivered" : n.delivery === "not_configured" ? "in-app only" : "in-app"}
              </span>
              {n.delivery.startsWith("failed") && <span className="block text-xs text-muted">{n.delivery.replace("failed: ", "")}</span>}
            </li>
          ))}
        </ul>
      </section>
      {err && <p role="alert" className="text-sm font-semibold text-terracotta">{err}</p>}
    </div>
  );
}
