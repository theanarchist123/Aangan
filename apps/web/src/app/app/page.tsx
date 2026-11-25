"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ListChecks, Lock, LogOut, ShieldCheck, Users } from "lucide-react";
import { Mitthu } from "@/components/Mitthu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FamilyTab } from "@/components/app/FamilyTab";
import { HomeTab } from "@/components/app/HomeTab";
import { Onboarding } from "@/components/app/Onboarding";
import { SafetyTab } from "@/components/app/SafetyTab";
import { SosOverlay } from "@/components/app/SosOverlay";
import { TaskTimeline } from "@/components/app/TaskTimeline";
import { VaultTab } from "@/components/app/VaultTab";
import { api, ApiError, clearFamilyId, getFamilyId, setFamilyId, type MyFamily, type Person } from "@/lib/api";
import { getSession, logout } from "@/lib/auth";
import { useFamily } from "@/lib/useFamily";

const TABS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "tasks", label: "Tasks", Icon: ListChecks },
  { id: "vault", label: "Vault", Icon: Lock },
  { id: "family", label: "Family", Icon: Users },
  { id: "safety", label: "Safety", Icon: ShieldCheck },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AppPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [families, setFamilies] = useState<MyFamily[] | null>(null);
  const [familyId, setId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [sos, setSos] = useState<{ person?: Person; fail: boolean } | null>(null);
  const user = typeof window === "undefined" ? null : getSession()?.user;

  const loadFamilies = useCallback(async () => {
    try {
      const list = await api<MyFamily[]>("/me/families");
      setFamilies(list);
      const saved = getFamilyId();
      const pick = list.find((f) => f.id === saved) ?? list[0] ?? null;
      setId(pick?.id ?? null);
      if (pick) setFamilyId(pick.id); else clearFamilyId();
      setLoadErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { logout(); window.location.replace("/login"); return; }
      setLoadErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }, []);

  useEffect(() => {
    if (!getSession()) { router.replace("/login"); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth state lives in localStorage, readable only on the client
    setReady(true);
    void loadFamilies();
  }, [router, loadFamilies]);

  const { data, loading, error, refresh } = useFamily(familyId);

  function signOut() {
    logout();
    // Hard navigation on purpose: Next keeps a page's React state alive across client-side navigations, so a soft
    // redirect could leave this user's family data in memory for the next person who signs in on this tab.
    window.location.replace("/login");
  }

  if (!ready || (families === null && !loadErr)) return <div className="flex min-h-screen items-center justify-center"><Mitthu mood="thinking" size={90} /></div>;
  if (loadErr) return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Mitthu mood="sleeping" size={100} />
      <p role="alert" className="font-semibold">{loadErr}</p>
      <button className="btn btn-primary" onClick={() => void loadFamilies()}>Try again</button>
      <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
    </main>
  );
  if (!familyId) return <Onboarding userName={user?.name || user?.email} onDone={(id) => { setFamilyId(id); setId(id); void loadFamilies(); }} onSignOut={signOut} />;

  const role = families?.find((f) => f.id === familyId)?.role;
  const pendingCount = data.approvals.filter((a) => a.status === "pending").length;
  const contacts = data.people.filter((p) => p.is_emergency_contact && p.role !== "sponsor");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col md:flex-row">
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 backdrop-blur md:static md:h-screen md:w-60 md:grid-cols-1 md:content-start md:gap-1 md:border-r md:border-t-0 md:p-4">
        <Link href="/" className="mb-4 hidden items-center gap-2 md:flex"><Mitthu size={36} /><span className="font-serif text-2xl font-bold text-teal">Aangan</span></Link>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold md:flex-row md:gap-3 md:rounded-xl md:px-3 md:text-base ${tab === id ? "text-teal md:bg-teal-soft" : "text-muted"}`}>
            <Icon className="h-6 w-6" aria-hidden />{label}
            {id === "home" && pendingCount > 0 && <span className="absolute right-[22%] top-1 h-5 min-w-5 rounded-full bg-marigold px-1 text-center text-xs font-extrabold text-[#2a1c00] md:static md:ml-auto">{pendingCount}</span>}
          </button>
        ))}
        <div className="hidden flex-col gap-2 md:mt-auto md:flex md:pt-6">
          <Link href="/senior" className="rounded-xl px-3 py-2 text-sm font-bold text-muted underline">Open Senior Mode</Link>
          <div className="rounded-xl bg-teal-soft p-3 text-xs">
            <p className="truncate font-bold text-ink">{user?.name || user?.email}</p>
            <p className="truncate text-muted">{user?.email}{role ? ` · ${role}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={signOut} className="btn btn-ghost min-h-11 flex-1 text-sm"><LogOut className="h-4 w-4" aria-hidden /> Sign out</button>
          </div>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10">
        <div className="mb-3 flex justify-end gap-2 md:hidden">
          <ThemeToggle />
          <button onClick={signOut} aria-label="Sign out" className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink"><LogOut className="h-5 w-5" aria-hidden /></button>
        </div>
        {loading ? (
          <div className="grid gap-4" aria-busy="true" aria-label="Loading your family"><div className="skeleton h-20" /><div className="skeleton h-40" /><div className="skeleton h-40" /></div>
        ) : error ? (
          <div role="alert" className="card p-6 text-center"><Mitthu mood="sleeping" size={90} /><p className="mt-2 font-semibold">{error}</p><button className="btn btn-primary mt-3" onClick={() => void refresh()}>Try again</button></div>
        ) : (
          <>
            {tab === "home" && <HomeTab familyId={familyId} data={data} refresh={refresh} onSos={(person, fail) => setSos({ person, fail })} />}
            {tab === "tasks" && (
              <div className="flex flex-col gap-4">
                <h1 className="font-serif text-2xl font-bold">Tasks</h1>
                {data.tasks.length === 0 ? <div className="card rangoli p-8 text-center text-muted">No tasks yet. Ask Mitthu on the Home tab.</div> : data.tasks.map((t) => <TaskTimeline key={t.id} task={t} />)}
              </div>
            )}
            {tab === "vault" && <VaultTab familyId={familyId} data={data} refresh={refresh} />}
            {tab === "family" && <FamilyTab familyId={familyId} data={data} refresh={refresh} role={role} />}
            {tab === "safety" && <SafetyTab familyId={familyId} data={data} refresh={refresh} role={role} />}
          </>
        )}
      </main>

      {sos && <SosOverlay familyId={familyId} person={sos.person} simulateFailure={sos.fail} contacts={contacts} onClose={() => { setSos(null); void refresh(); }} />}
    </div>
  );
}
