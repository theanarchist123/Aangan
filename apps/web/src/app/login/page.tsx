"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Mitthu } from "@/components/Mitthu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSession, login, signup } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (getSession()) router.replace("/app"); }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === "up") await signup(email, password, name);
      else await login(email, password);
      window.location.replace("/app"); // hard load: start with a clean in-memory state for this account
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong");
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-line bg-transparent px-4 py-3 text-ink";
  return (
    <main className="rangoli relative flex min-h-screen items-center justify-center px-5 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-4 flex flex-col items-center gap-1" aria-label="Aangan home">
          <Mitthu size={84} mood={busy ? "thinking" : "idle"} />
          <span className="font-serif text-3xl font-bold text-teal">Aangan</span>
        </Link>
        <form onSubmit={submit} className="card flex flex-col gap-3 p-6" aria-labelledby="auth-h">
          <h1 id="auth-h" className="font-serif text-2xl font-bold">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-muted">{mode === "in" ? "Sign in to your family's courtyard." : "It takes a minute. Then we'll set up your family."}</p>
          {mode === "up" && (
            <label className="text-sm font-semibold">Your name
              <input required autoComplete="name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul" />
            </label>
          )}
          <label className="text-sm font-semibold">Email
            <input required type="email" autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <div className="text-sm font-semibold">
            <label htmlFor="pw">Password</label>
            <span className="relative block">
              <input id="pw" required type={show ? "text" : "password"} minLength={mode === "up" ? 8 : undefined} autoComplete={mode === "up" ? "new-password" : "current-password"}
                className={`${field} pr-12`} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "up" ? "At least 8 characters" : "Your password"} />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted">
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </span>
          </div>
          <button className="btn btn-primary mt-1" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
          {err && <p role="alert" className="text-sm font-semibold text-terracotta">{err}</p>}
          <button type="button" className="text-sm font-bold text-teal underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>
            {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Prototype. Use fake data only. Don&apos;t reuse a password from elsewhere.</p>
      </div>
    </main>
  );
}
