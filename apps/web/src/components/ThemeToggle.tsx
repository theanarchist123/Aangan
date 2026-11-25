"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Theme: follows your device", light: "Theme: light", dark: "Theme: dark" };

function apply(m: Mode) {
  const root = document.documentElement;
  if (m === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = m;
  try { if (m === "system") localStorage.removeItem("aangan.theme"); else localStorage.setItem("aangan.theme", m); } catch {}
}

/** One button that cycles System → Light → Dark. The choice is remembered. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("aangan.theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable on the client
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button
      type="button" aria-label={`${LABEL[mode]}. Click to change.`} title={LABEL[mode]}
      onClick={() => { const n = NEXT[mode]; setMode(n); apply(n); }}
      className={`flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
