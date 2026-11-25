"use client";
import { motion } from "motion/react";

export type MitthuMood = "idle" | "thinking" | "listening" | "celebrate" | "sleeping";

const CONFETTI = ["#F4A300", "#C8553D", "#3FA34D", "#0E5E6F", "#F4A300", "#C8553D"];

/** Mitthu the parrot: the app's mascot. Playful when calm; the app hides him during SOS. */
export function Mitthu({ mood = "idle", size = 120, label }: { mood?: MitthuMood; size?: number; label?: string }) {
  const asleep = mood === "sleeping";
  return (
    <svg
      viewBox="0 0 200 230"
      width={size}
      height={size * 1.15}
      role="img"
      aria-label={label ?? `Mitthu the parrot, ${mood}`}
      style={{ overflow: "visible" }}
    >
      {/* perch */}
      <rect x="30" y="205" width="140" height="9" rx="4.5" fill="#8a5a3a" />

      <motion.g
        animate={mood === "celebrate" ? { y: [0, -22, 0] } : asleep ? { y: [0, 1.5, 0] } : { y: [0, -3, 0] }}
        transition={{ duration: mood === "celebrate" ? 0.7 : asleep ? 3 : 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* tail */}
        <path d="M86 170 Q70 215 80 228 Q96 214 100 176Z" fill="#0E5E6F" />
        <path d="M100 172 Q104 220 118 228 Q124 205 112 170Z" fill="#3FA34D" />

        {/* body */}
        <ellipse cx="100" cy="128" rx="48" ry="62" fill="#3FA34D" />
        <ellipse cx="104" cy="144" rx="29" ry="42" fill="#9ADBA5" />
        {/* wing */}
        <motion.path
          d="M60 108 Q44 150 68 184 Q90 160 84 112Z"
          fill="#2E8A3E"
          style={{ originX: "70px", originY: "110px" }}
          animate={mood === "celebrate" ? { rotate: [0, -16, 0] } : { rotate: 0 }}
          transition={{ duration: 0.35, repeat: mood === "celebrate" ? Infinity : 0 }}
        />
        <path d="M66 168 Q70 182 68 184 Q82 172 80 160Z" fill="#0E5E6F" />

        {/* feet */}
        <path d="M86 188 v17 M96 188 v17 M108 188 v17 M118 188 v17" stroke="#E8A33D" strokeWidth="4" strokeLinecap="round" />

        {/* head */}
        <motion.g
          style={{ originX: "100px", originY: "100px" }}
          animate={
            mood === "thinking" ? { rotate: [-6, 6, -6] } : mood === "listening" ? { rotate: [8, 8] } : { rotate: [0, 2, 0] }
          }
          transition={{ duration: mood === "thinking" ? 1.4 : 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* crest */}
          <path d="M92 36 Q86 18 96 10 Q98 26 102 36Z" fill="#F4A300" />
          <path d="M102 34 Q104 14 116 12 Q112 28 110 38Z" fill="#C8553D" />
          <circle cx="100" cy="74" r="40" fill="#3FA34D" />
          <circle cx="82" cy="86" r="9" fill="#F4A300" opacity="0.55" />
          {/* listening glow */}
          {mood === "listening" && (
            <motion.circle
              cx="70" cy="76" r="10" fill="none" stroke="#F4A300" strokeWidth="3"
              animate={{ r: [8, 20], opacity: [0.9, 0] }} transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          {/* eye */}
          {asleep ? (
            <path d="M104 66 q8 6 16 0" stroke="#1F2A2E" strokeWidth="3" fill="none" strokeLinecap="round" />
          ) : (
            <motion.g
              style={{ originX: "112px", originY: "66px" }}
              animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
              transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.93, 0.96, 1] }}
            >
              <circle cx="112" cy="66" r="10" fill="#fff" />
              <circle cx="115" cy="67" r="5" fill="#1F2A2E" />
              <circle cx="116.8" cy="65" r="1.6" fill="#fff" />
            </motion.g>
          )}
          {/* beak */}
          <path d="M120 74 Q154 76 146 100 Q132 96 122 86Z" fill="#E8472B" />
          <path d="M122 86 Q134 92 146 100 Q134 100 124 92Z" fill="#B8341D" />
        </motion.g>
      </motion.g>

      {mood === "thinking" && (
        <g fill="#0E5E6F">
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i} cx={150 + i * 14} cy={30} r="4"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </g>
      )}
      {asleep && (
        <g fill="#0E5E6F" fontWeight="700" fontFamily="serif">
          {["z", "Z", "Z"].map((z, i) => (
            <motion.text
              key={i} x={150 + i * 12} y={40 - i * 14} fontSize={14 + i * 4}
              animate={{ opacity: [0, 1, 0], y: [0, -8, -14] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5 }}
            >
              {z}
            </motion.text>
          ))}
        </g>
      )}
      {mood === "celebrate" &&
        CONFETTI.map((c, i) => (
          <motion.circle
            key={i} cx={100} cy={60} r="5" fill={c}
            animate={{ x: (i - 2.5) * 36, y: [0, -70 - (i % 3) * 18, 60], opacity: [1, 1, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.08 }}
          />
        ))}
    </svg>
  );
}
