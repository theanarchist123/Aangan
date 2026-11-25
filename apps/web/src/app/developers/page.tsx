"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Play } from "lucide-react";
import { API, ApiError, getFamilyId, post } from "@/lib/api";
import { getSession } from "@/lib/auth";

const ENDPOINTS = [
  { m: "GET", p: "/partner/v1/me", d: "Your identity, rate limit and usage count.", who: "all" },
  { m: "GET", p: "/partner/v1/families/{fid}/emergency-packet?person_id=", d: "Pre-arrival emergency patient packet (needs health.read).", who: "hospital" },
  { m: "GET", p: "/partner/v1/families/{fid}/fhir/Patient/{id}", d: "HL7 FHIR R4 bundle: Patient, Allergy, Medication, Condition.", who: "hospital" },
  { m: "POST", p: "/partner/v1/families/{fid}/discharge-summaries", d: "Push a discharge summary into the vault; optionally trigger home nursing (needs health.write).", who: "hospital" },
  { m: "POST", p: "/partner/v1/insurance/eligibility?fid=", d: "Real-time policy eligibility check (needs insurance.read).", who: "insurer" },
  { m: "POST", p: "/partner/v1/webhooks", d: "Subscribe to events like task.escalated. Deliveries are signed with HMAC-SHA256.", who: "all" },
];

export default function Developers() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("hospital");
  const [key, setKey] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  const [path, setPath] = useState("/partner/v1/me");
  const fid = typeof window === "undefined" || !getSession() ? null : getFamilyId();

  async function signup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const r = await post<{ api_key: string; partner_id: string }>("/partners", { name, kind });
      setKey(r.api_key); setPid(r.partner_id);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Signup failed"); }
  }
  async function grant() {
    if (!fid || !pid) return;
    try {
      for (const scope of ["health.read", "health.write", "insurance.read"]) await post(`/families/${fid}/consents`, { grantee: `partner:${pid}`, scope });
      setOut("Consent granted for your demo family (health.read, health.write, insurance.read). Try the emergency packet now.");
    } catch (e) { setOut(e instanceof ApiError ? e.message : "Could not grant"); }
  }
  async function tryIt() {
    if (!key) return;
    try {
      const res = await fetch(`${API}/v1${path.replace("{fid}", fid ?? "FAMILY_ID")}`, { headers: { "X-API-Key": key } });
      setOut(`${res.status} ${res.statusText}\n` + JSON.stringify(await res.json(), null, 2));
    } catch { setOut("Network error: is the API running?"); }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="font-serif text-xl font-bold text-teal">← Aangan</Link>
      <h1 className="mt-4 font-serif text-4xl font-bold">Build on Aangan</h1>
      <p className="mt-2 text-lg text-muted">APIs for hospitals, banks and insurers. Families decide what you can see through the consent engine. No consent means a 403, and every access is audited.</p>

      <section className="card mt-8 p-5" aria-labelledby="k">
        <h2 id="k" className="flex items-center gap-2 font-serif text-xl font-bold"><KeyRound className="h-5 w-5" aria-hidden /> Get a sandbox key</h2>
        {!key ? (
          <form onSubmit={signup} className="mt-3 flex flex-wrap gap-3">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Organisation, e.g. Ruby Hall Clinic" className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-3" />
            <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-line bg-card px-3 py-3"><option>hospital</option><option>bank</option><option>insurer</option></select>
            <button className="btn btn-primary">Create key</button>
          </form>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-semibold">Copy it now. It is shown only once.</p>
            <div className="flex items-center gap-2 rounded-xl bg-teal-soft p-3 font-mono text-sm break-all">{key}
              <button aria-label="Copy key" className="btn btn-ghost min-h-9 px-3" onClick={() => { void navigator.clipboard.writeText(key); setCopied(true); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
            {fid ? <button className="btn btn-teal" onClick={grant}>Grant my demo family&apos;s consent to this key</button> : <p className="text-sm text-muted">Open the <Link className="underline" href="/app">demo family</Link> first to test consent.</p>}
          </div>
        )}
        {err && <p role="alert" className="mt-2 text-sm font-semibold text-terracotta">{err}</p>}
      </section>

      <section className="mt-8" aria-labelledby="ep">
        <h2 id="ep" className="font-serif text-xl font-bold">Endpoints</h2>
        <ul className="mt-3 grid gap-2">
          {ENDPOINTS.map((e) => (
            <li key={e.p}><button onClick={() => setPath(e.p.replace("{id}", ""))} className="card w-full p-3 text-left">
              <code className="text-sm font-bold"><span className="mr-2 rounded bg-teal-soft px-1.5 text-teal">{e.m}</span>{e.p}</code>
              <p className="mt-1 text-sm text-muted">{e.d} <span className="rounded bg-marigold-soft px-1.5 text-xs font-bold">{e.who}</span></p>
            </button></li>
          ))}
        </ul>
        <p className="mt-3 text-sm">Full interactive reference: <a className="font-bold text-teal underline" href={`${API}/docs`}>OpenAPI / Swagger</a>.</p>
      </section>

      <section className="card mt-8 p-5" aria-labelledby="try">
        <h2 id="try" className="font-serif text-xl font-bold">Try it</h2>
        <div className="mt-3 flex gap-2"><input aria-label="Request path" value={path} onChange={(e) => setPath(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-3 font-mono text-sm" />
          <button className="btn btn-teal" disabled={!key} onClick={tryIt}><Play className="h-4 w-4" aria-hidden /> Send GET</button></div>
        {!key && <p className="mt-2 text-sm text-muted">Create a key first.</p>}
        {out && <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-[#12161C] p-3 text-xs text-[#d6f0e0]" aria-live="polite">{out}</pre>}
      </section>
    </main>
  );
}
