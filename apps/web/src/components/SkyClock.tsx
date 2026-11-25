"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, Sunset } from "lucide-react";

function partsIn(tz: string, now: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now)) % 24;
  return { text: f.format(now), hour: h };
}

export function skyFor(hour: number): "day" | "dusk" | "night" {
  if (hour >= 6 && hour < 17) return "day";
  if ((hour >= 17 && hour < 20) || (hour >= 5 && hour < 6)) return "dusk";
  return "night";
}

/** Signature element: two clocks with a sky that matches each person's actual local time of day. */
export function SkyClock({ you, them, youLabel, themLabel, themWeather }: { you: string; them: string; youLabel: string; themLabel: string; themWeather?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avoids server/client time mismatch
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="skeleton h-[72px]" aria-hidden />;

  const cells = [
    { label: youLabel, ...partsIn(you, now) },
    { label: themLabel, ...partsIn(them, now) },
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-line">
      {cells.map((c) => {
        const sky = skyFor(c.hour);
        const Icon = sky === "day" ? Sun : sky === "dusk" ? Sunset : Moon;
        return (
          <div key={c.label} className={`sky-${sky} flex items-center justify-between px-4 py-3 ${sky === "night" ? "text-white" : "text-[#1F2A2E]"}`}>
            <div>
              <div className="text-xs font-semibold opacity-80">{c.label}</div>
              <div className="font-serif text-xl font-bold leading-tight">{c.text}</div>
              {c.label === themLabel && themWeather && <div className="text-xs font-semibold opacity-80">{themWeather}</div>}
            </div>
            <Icon aria-hidden className="h-6 w-6" />
          </div>
        );
      })}
    </div>
  );
}
