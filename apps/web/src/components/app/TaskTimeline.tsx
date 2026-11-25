"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, CircleDashed, Clock, Link2, Loader2, X } from "lucide-react";
import { post, type Step, type Task } from "@/lib/api";

const ICON: Record<string, React.ReactNode> = {
  done: <Check className="h-4 w-4 text-white" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-white" />,
  blocked: <Clock className="h-4 w-4 text-white" />,
  failed: <X className="h-4 w-4 text-white" />,
  pending: <CircleDashed className="h-4 w-4 text-muted" />,
};
const BG: Record<string, string> = {
  done: "bg-parrot", running: "bg-teal", blocked: "bg-marigold", failed: "bg-terracotta", pending: "bg-line",
};
const STATUS_LABEL: Record<string, string> = {
  running: "In progress", awaiting_approval: "Waiting for you", escalated: "Escalated to humans", done: "Done", failed: "Needs attention", planning: "Planning",
};

function StepRow({ s, last }: { s: Step; last: boolean }) {
  return (
    <motion.li initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: s.seq * 0.07 }} className="relative flex gap-3 pb-4">
      {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-line" aria-hidden />}
      <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BG[s.status] ?? "bg-line"}`}>{ICON[s.status] ?? ICON.pending}</span>
      <div className="min-w-0">
        <p className="font-semibold leading-snug">{s.title}</p>
        <p className="text-xs text-muted">{s.agent}</p>
        {s.detail && <p className="mt-0.5 text-sm">{s.detail}</p>}
      </div>
    </motion.li>
  );
}

/** Swiggy-style live tracker for one agent task. */
export function TaskTimeline({ task }: { task: Task }) {
  const [link, setLink] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  async function makeLink() {
    try {
      const r = await post<{ url: string }>(`/tasks/${task.id}/caregiver-link`);
      setLink(`${window.location.origin}${r.url}`);
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "Could not create link");
    }
  }

  return (
    <article className="card p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-bold leading-snug">{task.goal}</h3>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${task.status === "done" ? "bg-parrot/15 text-parrot" : task.status === "escalated" ? "bg-sos/15 text-sos" : "bg-marigold-soft text-ink"}`}>
          {STATUS_LABEL[task.status] ?? task.status}
        </span>
      </header>
      {task.status === "escalated" && (
        <p role="alert" className="mb-3 flex gap-2 rounded-xl bg-sos/10 p-3 text-sm font-semibold text-sos">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          {task.escalation_reason}. The 24×7 command desk and your local emergency contacts were alerted.
        </p>
      )}
      <ol>{task.steps.map((s, i) => <StepRow key={s.id} s={s} last={i === task.steps.length - 1} />)}</ol>
      {task.kind !== "sos" && (
        <div className="mt-1 border-t border-line pt-3">
          {link ? (
            <p className="break-all text-xs">Share with caregiver (expires in 12h): <a className="font-bold text-teal underline" href={link}>{link}</a></p>
          ) : (
            <button className="btn btn-ghost min-h-9 text-sm" onClick={makeLink}><Link2 className="h-4 w-4" aria-hidden /> Send caregiver link</button>
          )}
          {linkErr && <p role="alert" className="text-xs text-terracotta">{linkErr}</p>}
        </div>
      )}
    </article>
  );
}
