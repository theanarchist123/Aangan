"use client";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Camera, ExternalLink, FileText, Landmark, Lock, Search, ShieldCheck, Stethoscope, Unlock, Zap } from "lucide-react";
import { api, post, upload } from "@/lib/api";
import type { FamilyData } from "@/lib/useFamily";

const ICON: Record<string, React.ReactNode> = {
  medical: <Stethoscope className="h-5 w-5" />, insurance: <ShieldCheck className="h-5 w-5" />, utility: <Zap className="h-5 w-5" />,
  property: <Landmark className="h-5 w-5" />, identity: <Lock className="h-5 w-5" />,
};

/** The tijori: the family safe. Opens after a (simulated) biometric unlock. */
export function VaultTab({ familyId, data, refresh }: { familyId: string; data: FamilyData; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ title: "", category: "medical", text: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setScanning(true); setErr(null); setScanMsg(null);
    try {
      const r = await upload<{ title: string; ai_read: boolean; note: string | null; extracted: Record<string, string> }>(`/families/${familyId}/documents/upload`, f, f.name);
      setScanMsg(r.ai_read ? `Added "${r.title}". Mitthu read ${Object.keys(r.extracted).length} detail(s) from it.` : `Added "${r.title}". ${r.note ?? ""}`);
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not upload that file"); }
    finally { setScanning(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function openOriginal(id: string) {
    try { const r = await api<{ url: string }>(`/documents/${id}/file`); window.open(r.url, "_blank", "noopener"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not open the file"); }
  }

  const docs = data.docs.filter((d) => !q || (d.title + d.text).toLowerCase().includes(q.toLowerCase()));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await post(`/families/${familyId}/documents`, form);
      setForm({ title: "", category: "medical", text: "" });
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save the document");
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <motion.div animate={unlocking ? { rotateY: -70 } : { rotateY: 0 }} transition={{ duration: 0.7 }} style={{ transformOrigin: "left center", perspective: 600 }}
          onAnimationComplete={() => unlocking && setOpen(true)}
          className="flex h-52 w-52 items-center justify-center rounded-3xl border-4 border-[#8a5a3a] bg-gradient-to-br from-[#b9855c] to-[#7a4d2f] shadow-xl">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-marigold bg-[#6a4128]">
            {unlocking ? <Unlock className="h-10 w-10 text-marigold" aria-hidden /> : <Lock className="h-10 w-10 text-marigold" aria-hidden />}
          </div>
        </motion.div>
        <div>
          <h1 className="font-serif text-2xl font-bold">The family tijori</h1>
          <p className="text-muted">{data.docs.length} documents, encrypted and shared only with people you allow.</p>
        </div>
        <button className="btn btn-primary" disabled={unlocking} onClick={() => setUnlocking(true)}>Unlock with Face ID</button>
        <p className="max-w-xs text-xs text-muted">Demo build: biometric prompt is simulated. On the phone it uses Face ID / fingerprint.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">Family vault</h1>
      <label className="relative block">
        <span className="sr-only">Search documents</span>
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 'insurance', 'HbA1c'…" className="w-full rounded-full border border-line bg-card py-3 pl-10 pr-4" />
      </label>
      <div className="card flex flex-col gap-2 p-4">
        <h2 className="font-serif text-lg font-bold">Scan or upload a document</h2>
        <p className="text-sm text-muted">Take a photo of a prescription, bill or policy. Mitthu reads it, files it, and hides Aadhaar/PAN in the searchable text. The original is stored privately.</p>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" id="scan" onChange={(e) => void onFile(e.target.files?.[0])} />
        <label htmlFor="scan" className={`btn btn-primary ${scanning ? "opacity-60" : "cursor-pointer"}`}><Camera className="h-5 w-5" aria-hidden /> {scanning ? "Reading your document…" : "Scan or choose a file"}</label>
        {scanMsg && <p role="status" className="text-sm font-semibold text-parrot">{scanMsg}</p>}
        <p className="text-xs text-muted">Prototype: documents are read by Google Gemini. Upload fake or sample documents only.</p>
      </div>
      {docs.length === 0 && <div className="card rangoli p-8 text-center text-muted">{q ? "Nothing matches that search." : "No documents yet. Add a prescription, policy or bill below."}</div>}
      <ul className="grid gap-3">
        {docs.map((d) => (
          <motion.li layout key={d.id} className="card flex gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-teal">{ICON[d.category] ?? <FileText className="h-5 w-5" />}</span>
            <div className="min-w-0">
              <p className="font-semibold">{d.title}</p>
              <p className="text-xs uppercase tracking-wide text-muted">{d.category}</p>
              {d.has_file && <button onClick={() => void openOriginal(d.id)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-teal underline"><ExternalLink className="h-3 w-3" aria-hidden /> Open original</button>}
              {Object.keys(d.extracted).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(d.extracted).map(([k, v]) => <span key={k} className="rounded-full bg-marigold-soft px-2.5 py-0.5 text-xs font-semibold">{k.replace("_", " ")}: {v}</span>)}
                </div>
              )}
            </div>
          </motion.li>
        ))}
      </ul>
      <form onSubmit={add} className="card flex flex-col gap-3 p-4">
        <h2 className="font-serif text-lg font-bold">Add a document</h2>
        <input required placeholder="Title, e.g. Papa's ECG report" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl border border-line bg-transparent px-3 py-3" />
        <select aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-xl border border-line bg-card px-3 py-3">
          {["medical", "insurance", "utility", "property", "identity", "will", "other"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <textarea rows={4} placeholder="Paste the document text. Mitthu reads dates, amounts, BP, policy numbers and hides Aadhaar/PAN." value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} className="rounded-xl border border-line bg-transparent px-3 py-3" />
        <button className="btn btn-teal" disabled={busy}>{busy ? "Reading…" : "Save to vault"}</button>
        {err && <p role="alert" className="text-sm font-semibold text-terracotta">{err}</p>}
      </form>
    </div>
  );
}
