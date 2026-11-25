"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { BookOpenCheck, FileLock2, HandHeart, MessageCircle, PhoneCall, Siren, Stethoscope, UserCheck } from "lucide-react";
import { Mitthu } from "@/components/Mitthu";
import { ThemeToggle } from "@/components/ThemeToggle";

const STORY = [
  { t: "10:42 PM, Seattle", d: "Papa taps one big button in Pune. Or sends a WhatsApp voice note in Hindi.", Icon: Siren },
  { t: "3 seconds later", d: "Mitthu confirms it's an emergency and dispatches the nearest ambulance with Papa's GPS location.", Icon: PhoneCall },
  { t: "Before the ambulance arrives", d: "The ER already has Papa's allergies, medicines and blood group.", Icon: Stethoscope },
  { t: "You, on your phone", d: "A live tracker, like food delivery, except it's your father.", Icon: MessageCircle },
  { t: "The ₹15,000 deposit", d: "Above your limit, so Mitthu asks. One slide and Face ID. Nothing moves without you.", Icon: UserCheck },
  { t: "If anything fails", d: "In 30 seconds a human command desk and Mr. Kulkarni next door are alerted. Automatically.", Icon: HandHeart },
];

const FEATURES = [
  { t: "Tell Mitthu, not a call centre", d: "\"Get Maa's sugar test done this week.\" Mitthu plans it, calls, books and reports back.", e: "🦜" },
  { t: "Maa's Day", d: "A story-style daily digest: medicines taken, a bill paid, a good morning. Your 30-second daily habit.", e: "🌼" },
  { t: "The family tijori", d: "Prescriptions, policies, deeds, searchable and locked. Aadhaar and PAN stay hidden until you say so.", e: "🔐" },
  { t: "Senior Mode", d: "Four huge buttons, photos of the kids, and WhatsApp for those who'd rather not install anything.", e: "👵" },
  { t: "You set the limits", d: "Auto-approve up to ₹2,500. Anything above, or anything medical, asks you first.", e: "🎚️" },
  { t: "Guardian", d: "Quietly watches for missed check-ins, expiring policies and bills due, before they become emergencies.", e: "🛡️" },
];

export default function Landing() {
  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <span className="font-serif text-2xl font-bold text-teal">Aangan</span>
        <nav className="flex items-center gap-2" aria-label="Site"><Link href="/developers" className="btn btn-ghost hidden sm:inline-flex">Developers</Link><Link href="/senior" className="btn btn-ghost hidden md:inline-flex">Senior Mode</Link><ThemeToggle /><Link href="/login" className="btn btn-primary">Sign in</Link></nav>
      </header>

      <section className="rangoli">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-marigold-soft px-3 py-1 text-sm font-bold">For NRIs with parents in India</p>
            <h1 className="font-serif text-4xl font-bold leading-[1.1] md:text-6xl">Your family&apos;s <span className="text-teal">courtyard</span>, wherever you are.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Aangan is the AI that looks after your parents in India. It books doctors, pays bills, calls vendors in their language, and raises the alarm, while you stay in charge of every big decision.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link href="/login" className="btn btn-primary text-lg">Get started free</Link><a href="#story" className="btn btn-ghost text-lg">See how an emergency plays out</a></div>
            <p className="mt-4 text-sm text-muted">Prototype. Mock hospitals, ambulances and payments. No real calls are made.</p>
          </div>
          <div className="relative mx-auto flex h-[360px] w-full max-w-md items-end justify-center overflow-hidden rounded-[32px] sky-dusk">
            <motion.div className="absolute left-6 top-6 text-sm font-bold" animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity }}>Seattle 9:40 PM 🌙 ↔ Pune 10:10 AM ☀️</motion.div>
            <Mitthu size={230} mood="celebrate" />
          </div>
        </div>
      </section>

      <section id="story" className="mx-auto max-w-3xl px-5 py-16" aria-labelledby="story-h">
        <h2 id="story-h" className="font-serif text-3xl font-bold md:text-4xl">&ldquo;Papa feels chest pain in Pune.&rdquo;</h2>
        <p className="mt-2 text-muted">What happens next, in the first minute.</p>
        <ol className="mt-8 space-y-6">
          {STORY.map(({ t, d, Icon }, i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.04 }} className="card flex gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal text-white"><Icon className="h-5 w-5" aria-hidden /></span>
              <div><p className="font-bold text-teal">{t}</p><p className="mt-0.5 text-lg">{d}</p></div>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="bg-teal-soft py-16" aria-labelledby="feat-h">
        <div className="mx-auto max-w-6xl px-5">
          <h2 id="feat-h" className="font-serif text-3xl font-bold md:text-4xl">Care that feels like family, not software.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.li key={f.t} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.06 }} className="card p-5">
                <div className="text-4xl" aria-hidden>{f.e}</div><h3 className="mt-3 font-serif text-xl font-bold">{f.t}</h3><p className="mt-1 text-muted">{f.d}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center" aria-labelledby="trust-h">
        <h2 id="trust-h" className="font-serif text-3xl font-bold">Autonomy you can trust</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { Icon: BookOpenCheck, t: "Tamper-proof audit trail", d: "Every agent action is hash-chained. Edits would show." },
            { Icon: FileLock2, t: "Aadhaar & PAN hidden", d: "Masked by default and stripped before any text reaches an AI model." },
            { Icon: UserCheck, t: "You approve the big stuff", d: "Limits are code, not AI judgement. The AI can't skip them." },
          ].map(({ Icon, t, d }) => (
            <li key={t} className="card p-5"><Icon className="mx-auto h-8 w-8 text-teal" aria-hidden /><p className="mt-3 font-bold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></li>
          ))}
        </ul>
        <div className="mt-12 flex flex-col items-center gap-4"><Mitthu size={90} /><Link href="/app" className="btn btn-primary text-lg">Meet Mitthu</Link></div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">Aangan prototype. Not a medical service. In an emergency in India, call 112.</footer>
    </div>
  );
}
