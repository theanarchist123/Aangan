"use client";
import { useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { post, type Approval } from "@/lib/api";

const TRACK = 260;
const KNOB = 52;

/** Slide to approve, then confirm with the device biometric. Money never moves before this. */
export function ApprovalCard({ approval, onDone }: { approval: Approval; onDone: () => void }) {
  const x = useMotionValue(0);
  const fill = useTransform(x, [0, TRACK - KNOB], [KNOB, TRACK]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setErr(null);
    try {
      // Production: the phone signs `approval.challenge` with a Secure Enclave / Keystore key
      // and sends `signature`. The demo build skips the signature (server flag require_signature).
      await post(`/approvals/${approval.id}/decision`, { approve });
      if (navigator.vibrate) navigator.vibrate(30);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record your decision");
      animate(x, 0);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card border-marigold p-4" style={{ borderColor: "var(--marigold)" }}>
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-teal" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Needs your approval</p>
          <p className="font-serif text-lg font-bold leading-snug">{approval.action}</p>
          {approval.amount_inr > 0 && <p className="mt-1 text-2xl font-extrabold text-teal">₹{approval.amount_inr.toLocaleString("en-IN")}</p>}
          <p className="mt-1 text-sm text-muted">Why you&apos;re asked: {approval.reason}.</p>
          <p className="text-sm text-muted">If you decline, nothing is paid or booked for this step.</p>
        </div>
      </div>

      {confirming ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-teal-soft p-4 text-center">
          <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
            <Fingerprint className="h-12 w-12 text-teal" aria-hidden />
          </motion.div>
          <p className="font-semibold">Confirm with Face ID / fingerprint</p>
          <p className="text-xs text-muted">Demo build: tap to simulate the device biometric.</p>
          <div className="flex gap-2">
            <button className="btn btn-teal" disabled={busy} onClick={() => decide(true)}>{busy ? "Approving…" : "Confirm"}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => { setConfirming(false); animate(x, 0); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="relative mx-auto h-[52px] rounded-full bg-teal-soft" style={{ width: TRACK }}>
            <motion.div className="absolute left-0 top-0 h-full rounded-full bg-marigold/50" style={{ width: fill }} />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-teal">Slide to approve →</span>
            <motion.button
              aria-label="Slide to approve"
              drag="x" dragConstraints={{ left: 0, right: TRACK - KNOB }} dragElastic={0} dragMomentum={false}
              style={{ x, width: KNOB, height: KNOB }}
              onDragEnd={() => (x.get() > (TRACK - KNOB) * 0.8 ? setConfirming(true) : animate(x, 0))}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setConfirming(true); }}
              className="absolute left-0 top-0 flex cursor-grab items-center justify-center rounded-full bg-marigold text-xl shadow-lg"
            >
              🦜
            </motion.button>
          </div>
          <button className="btn btn-ghost self-center text-sm" disabled={busy} onClick={() => decide(false)}>Decline</button>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-terracotta">{err}</p>}
    </motion.div>
  );
}
