// Sign-in state. The API proxies Supabase Auth, so the browser never holds Supabase keys.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type AuthUser = { id: string; email: string; name: string };
export type AuthSession = { access_token: string; refresh_token: string; expires_at: number; user: AuthUser };

const KEY = "aangan.auth";

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function save(r: { access_token: string; refresh_token: string; expires_in: number; user: AuthUser }): AuthSession {
  const s: AuthSession = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000, user: r.user };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}

async function authCall(path: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(`${API}/v1/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the Aangan server. Please check your connection.");
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Something went wrong. Please try again.");
  return j;
}

export const login = async (email: string, password: string) => save(await authCall("login", { email, password }));
export const signup = async (email: string, password: string, name: string) => save(await authCall("signup", { email, password, name }));

let refreshing: Promise<AuthSession | null> | null = null;

/** A valid access token, refreshing it first if it expires within a minute. Null if signed out. */
export async function getAccessToken(force = false): Promise<string | null> {
  const s = getSession();
  if (!s) return null;
  if (!force && s.expires_at - Date.now() > 60_000) return s.access_token;
  refreshing ??= authCall("refresh", { refresh_token: s.refresh_token })
    .then((r) => save({ ...r, user: r.user?.id ? r.user : s.user }))
    .catch(() => { clearSession(); return null; })
    .finally(() => { refreshing = null; });
  return (await refreshing)?.access_token ?? null;
}

export function logout() {
  clearSession();
  try { Object.keys(localStorage).filter((k) => k.startsWith("aangan.family.")).forEach((k) => localStorage.removeItem(k)); } catch {}
}
