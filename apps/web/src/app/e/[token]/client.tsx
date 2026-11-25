"use client";
import { use, useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { api } from "@/lib/api";

type Card = { name: string; blood_group: string; allergies: string[]; conditions: string[]; medications: { name: string; times?: string[] }[]; contacts: { name: string; role: string; phone: string }[] };

/** Public emergency medical card for paramedics (scanned from the fridge/wallet QR). Time-limited, view-only. */
export default function EmergencyCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [card, setCard] = useState<Card | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Card>(`/emergency/${token}`).then(setCard).catch((e) => setErr(e.message));
  }, [token]);

  if (err) return <main className="mx-auto max-w-md p-6"><p role="alert" className="card p-6 text-center font-bold">This card link has expired or is not valid. Ask the family for a new one.</p></main>;
  if (!card) return <main className="mx-auto max-w-md p-6"><div className="skeleton h-64" aria-busy="true" /></main>;

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="card overflow-hidden">
        <div className="bg-sos p-4 text-white"><p className="text-sm font-bold uppercase tracking-wide">Emergency medical card</p><h1 className="text-3xl font-extrabold">{card.name}</h1></div>
        <dl className="grid gap-4 p-5 text-lg">
          <div><dt className="text-sm font-bold uppercase text-muted">Blood group</dt><dd className="text-4xl font-extrabold">{card.blood_group || "Unknown"}</dd></div>
          <div><dt className="text-sm font-bold uppercase text-muted">Allergies</dt><dd className="font-bold">{card.allergies.length ? card.allergies.join(", ") : "None recorded"}</dd></div>
          <div><dt className="text-sm font-bold uppercase text-muted">Conditions</dt><dd>{card.conditions.length ? card.conditions.join(", ") : "None recorded"}</dd></div>
          <div><dt className="text-sm font-bold uppercase text-muted">Current medicines</dt><dd>{card.medications.length ? card.medications.map((m) => m.name).join(", ") : "None recorded"}</dd></div>
        </dl>
        <div className="grid gap-2 border-t border-line p-5">
          {card.contacts.map((c) => <a key={c.name} href={`tel:${c.phone}`} className="btn btn-teal justify-between"><span>{c.name}</span><Phone className="h-5 w-5" aria-hidden /></a>)}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">View-only. This access is logged and expires automatically.</p>
    </main>
  );
}
