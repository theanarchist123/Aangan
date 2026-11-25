"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import type { Story } from "@/lib/api";
import { Mitthu } from "@/components/Mitthu";

const ICON: Record<string, string> = { medicines: "💊", checkin: "☀️", task: "✅" };

/** "Maa's Day": tap-through stories, the daily habit loop. */
export function Stories({ stories, onClose }: { stories: Story[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const s = stories[i];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(stories.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, stories.length]);

  useEffect(() => {
    if (i >= stories.length - 1) return;
    const t = setTimeout(() => setI((n) => n + 1), 4500);
    return () => clearTimeout(t);
  }, [i, stories.length]);

  if (!s) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Today's family stories" className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="relative flex h-[min(640px,90vh)] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-teal text-white">
        <div className="flex gap-1 p-3" aria-hidden>
          {stories.map((_, n) => (
            <div key={n} className="h-1 flex-1 overflow-hidden rounded bg-white/30">
              <motion.div className="h-full bg-white" initial={{ width: n < i ? "100%" : 0 }}
                animate={{ width: n < i ? "100%" : n === i ? "100%" : 0 }} transition={{ duration: n === i ? 4.5 : 0, ease: "linear" }} />
            </div>
          ))}
        </div>
        <button ref={closeRef} onClick={onClose} aria-label="Close stories" className="absolute right-3 top-6 rounded-full bg-white/20 p-2"><X className="h-5 w-5" /></button>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="text-6xl" aria-hidden>{ICON[s.kind] ?? "🌼"}</div>
            <p className="font-serif text-3xl font-bold leading-snug">{s.title}</p>
            <p className="flex items-center gap-2 text-white/85">
              {s.ok ? <><CheckCircle2 className="h-5 w-5" aria-hidden /> All good</> : <><CircleAlert className="h-5 w-5" aria-hidden /> Worth a gentle nudge</>}
            </p>
            <Mitthu mood={s.ok ? "celebrate" : "idle"} size={90} />
          </motion.div>
        </AnimatePresence>
        <div className="grid grid-cols-2">
          <button className="py-4 font-semibold disabled:opacity-40" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          <button className="py-4 font-semibold" onClick={() => (i === stories.length - 1 ? onClose() : setI(i + 1))}>{i === stories.length - 1 ? "Done" : "Next →"}</button>
        </div>
      </div>
    </div>
  );
}
