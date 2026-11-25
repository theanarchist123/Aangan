"use client";
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, IdCard, Phone, QrCode } from "lucide-react";
import { api, post, type Member, type Person } from "@/lib/api";
import type { FamilyData } from "@/lib/useFamily";

const ROLE_LABEL: Record<string, string> = { sponsor: "You", parent: "Parent", relative: "Relative", neighbour: "Neighbour", secretary: "Building secretary", poa: "Power of attorney", caregiver: "Caregiver" };

function PersonCard({ p, familyId, refresh }: { p: Person; familyId: string; refresh: () => Promise<void> }) {
  const [shown, setShown] = useState<{ aadhaar: string; pan: string } | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggleReveal() {
    if (shown) return setShown(null);
    setErr(null);
    try {
      // Scoped, time-limited consent (1 hour) recorded in the audit trail, then unmask.
      await post(`/families/${familyId}/consents`, { grantee: "sponsor", scope: "id.unmask", ttl_hours: 1 });
      const r = await api<Person>(`/people/${p.id}/health?unmask=true`);
      setShown({ aadhaar: r.aadhaar, pan: r.pan });
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not reveal"); }
  }
  async function makeCard() {
    try {
      const r = await post<{ url: string }>(`/people/${p.id}/emergency-card`);
      setCard(`${window.location.origin}${r.url}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create card"); }
  }

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-serif text-lg font-bold">{p.name}</p>
          <p className="text-sm text-muted">{ROLE_LABEL[p.role] ?? p.role}{p.city ? ` · ${p.city}` : ""}{p.is_emergency_contact ? " · Emergency contact" : ""}</p>
        </div>
        {p.phone && <a className="btn btn-ghost min-h-9 px-3" href={`tel:${p.phone}`} aria-label={`Call ${p.name}`}><Phone className="h-4 w-4" /></a>}
      </div>
      {p.role === "parent" && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {p.blood_group && <span className="rounded-full bg-sos/10 px-2.5 py-0.5 font-bold text-sos">{p.blood_group}</span>}
            {p.allergies.map((a) => <span key={a} className="rounded-full bg-marigold-soft px-2.5 py-0.5 font-semibold">Allergy: {a}</span>)}
            {p.conditions.map((c) => <span key={c} className="rounded-full bg-teal-soft px-2.5 py-0.5 font-semibold text-teal">{c}</span>)}
          </div>
          {p.medications.length > 0 && <p><b>Medicines:</b> {p.medications.map((m) => `${m.name}${m.times ? ` (${m.times.join(", ")})` : ""}`).join(" · ")}</p>}
          {(p.aadhaar || p.pan) && (
            <p className="flex flex-wrap items-center gap-2"><IdCard className="h-4 w-4" aria-hidden />
              <span className="font-mono">Aadhaar {shown?.aadhaar ?? p.aadhaar}</span><span className="font-mono">PAN {shown?.pan ?? p.pan}</span>
              <button className="btn btn-ghost min-h-8 px-3 text-xs" onClick={toggleReveal} aria-pressed={!!shown}>{shown ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Reveal for 1 hour</>}</button>
            </p>
          )}
          <div>
            {card ? <p className="break-all">Fridge QR link: <a className="font-bold text-teal underline" href={card}>{card}</a></p>
              : <button className="btn btn-ghost min-h-9 text-sm" onClick={makeCard}><QrCode className="h-4 w-4" aria-hidden /> Emergency medical card</button>}
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-terracotta">{err}</p>}
    </li>
  );
}

function Members({ familyId, canInvite }: { familyId: string; canInvite: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("relative");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => api<Member[]>(`/families/${familyId}/members`).then(setMembers).catch((e) => setErr(e.message)), [familyId]);
  useEffect(() => { void load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setNote(null);
    try { const r = await post<{ note: string }>(`/families/${familyId}/members`, { email, role }); setNote(r.note); setEmail(""); await load(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not invite"); }
  }
  async function remove(id: string) {
    try { await api(`/families/${familyId}/members/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); }
  }

  return (
    <section aria-labelledby="members" className="card p-4">
      <h2 id="members" className="font-serif text-lg font-bold">People with app access</h2>
      <p className="text-sm text-muted">Relatives can help and view. Only you, the sponsor, can approve money, change limits, or share data.</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0"><b className="break-all">{m.email}</b> <span className="text-muted">· {m.role}{m.joined ? "" : " · invited"}</span></span>
            {canInvite && m.role !== "sponsor" && <button className="btn btn-ghost min-h-8 px-3 text-xs" onClick={() => void remove(m.id)}>Remove</button>}
          </li>
        ))}
      </ul>
      {canInvite && (
        <form onSubmit={invite} className="mt-3 flex flex-wrap gap-2">
          <input required type="email" aria-label="Email to invite" placeholder="sibling@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-2.5" />
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-line bg-card px-3 py-2.5"><option value="relative">relative</option><option value="parent">parent</option></select>
          <button className="btn btn-teal min-h-11">Invite</button>
        </form>
      )}
      {note && <p role="status" className="mt-2 text-sm font-semibold text-parrot">{note}</p>}
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-terracotta">{err}</p>}
    </section>
  );
}

export function FamilyTab({ familyId, data, refresh, role }: { familyId: string; data: FamilyData; refresh: () => Promise<void>; role?: string }) {
  const [form, setForm] = useState({ name: "", role: "parent", city: "", phone: "", blood_group: "", language: "hi", is_emergency_contact: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await post(`/families/${familyId}/people`, form);
      setForm({ ...form, name: "", city: "", phone: "", blood_group: "" });
      await refresh();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not add"); } finally { setBusy(false); }
  }
  async function revoke(grantee: string, scope: string) {
    try { await post(`/families/${familyId}/consents`, { grantee, scope, granted: false }); await refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not revoke"); }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-2xl font-bold">Family circle</h1>
      <ul className="grid gap-3">{data.people.map((p) => <PersonCard key={p.id} p={p} familyId={familyId} refresh={refresh} />)}</ul>

      <form onSubmit={add} className="card grid gap-3 p-4">
        <h2 className="font-serif text-lg font-bold">Add someone</h2>
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl border border-line bg-transparent px-3 py-3" />
        <div className="grid grid-cols-2 gap-3">
          <select aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-xl border border-line bg-card px-3 py-3">
            {["parent", "relative", "neighbour", "secretary", "poa", "caregiver"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="rounded-xl border border-line bg-transparent px-3 py-3" />
          <input placeholder="Phone (+91…)" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl border border-line bg-transparent px-3 py-3" />
          <input placeholder="Blood group" value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} className="rounded-xl border border-line bg-transparent px-3 py-3" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_emergency_contact} onChange={(e) => setForm({ ...form, is_emergency_contact: e.target.checked })} /> Alert this person first in an emergency</label>
        <button className="btn btn-teal" disabled={busy}>{busy ? "Adding…" : "Add to circle"}</button>
        {err && <p role="alert" className="text-sm font-semibold text-terracotta">{err}</p>}
      </form>

      <Members familyId={familyId} canInvite={role === "sponsor"} />

      <section aria-labelledby="consents">
        <h2 id="consents" className="mb-2 font-serif text-lg font-bold">Who can see what</h2>
        {data.consents.filter((c) => c.granted).length === 0 && <p className="card p-4 text-sm text-muted">No active permissions. Nobody but you can see sensitive data.</p>}
        <ul className="grid gap-2">
          {data.consents.filter((c) => c.granted).map((c) => (
            <li key={c.grantee + c.scope} className="card flex items-center justify-between gap-3 p-3 text-sm">
              <span><b>{c.grantee}</b> can <code>{c.scope}</code>{c.expires_at ? ` until ${new Date(c.expires_at).toLocaleTimeString()}` : ""}</span>
              <button className="btn btn-ghost min-h-8 px-3 text-xs" onClick={() => revoke(c.grantee, c.scope)}>Revoke</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
