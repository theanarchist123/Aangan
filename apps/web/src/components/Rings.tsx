"use client";
import { motion } from "motion/react";

export type RingSpec = { label: string; value: number; color: string };

/** Three activity rings (medicines, check-in, vitals). Values are 0..1. */
export function Rings({ rings, size = 96 }: { rings: RingSpec[]; size?: number }) {
  const stroke = size * 0.1;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={rings.map((r) => `${r.label} ${Math.round(r.value * 100)}%`).join(", ")}
    >
      {rings.map((r, i) => {
        const radius = size / 2 - stroke / 2 - i * (stroke + 3);
        const c = 2 * Math.PI * radius;
        return (
          <g key={r.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={r.color} strokeOpacity={0.18} strokeWidth={stroke} />
            <motion.circle
              cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, r.value)) }}
              transition={{ duration: 1, delay: i * 0.15, ease: "easeOut" }}
            />
          </g>
        );
      })}
    </svg>
  );
}
