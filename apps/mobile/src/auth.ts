import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Android emulator reaches the host machine at 10.0.2.2; set EXPO_PUBLIC_API_URL for a real device.
export const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8000";

export type AuthUser = { id: string; email: string; name: string };
export type AuthSession = { access_token: string; refresh_token: string; expires_at: number; user: AuthUser };

// Tokens live in the OS keystore (SecureStore). The web preview falls back to localStorage.
const store = {
  get: async (k: string) => (Platform.OS === "web" ? localStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === "web" ? localStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === "web" ? localStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

const AUTH = "aangan.auth";
const SERVER = "aangan.server";
const FAMILY = "aangan.family";

let cached: AuthSession | null = null;
let server = DEFAULT_API;
const listeners = new Set<() => void>();
export const onAuthChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((fn) => fn());

export const getServer = () => server;
export async function setServer(url: string) { server = url.trim().replace(/\/+$/, "") || DEFAULT_API; await store.set(SERVER, server); }
export const getUser = () => cached?.user ?? null;

export async function restore(): Promise<AuthSession | null> {
  try {
    server = (await store.get(SERVER)) || DEFAULT_API;
    const raw = await store.get(AUTH);
    cached = raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch { cached = null; }
  return cached;
}

async function put(r: { access_token: string; refresh_token: string; expires_in: number; user: AuthUser }) {
  cached = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000, user: r.user };
  await store.set(AUTH, JSON.stringify(cached));
  return cached;
}

async function authCall(path: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(`${server}/v1/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(`Can't reach the server at ${server}. Check the address and your Wi-Fi.`);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Something went wrong. Please try again.");
  return j;
}

export const login = async (email: string, password: string) => { const s = await put(await authCall("login", { email, password })); emit(); return s; };
export const signup = async (email: string, password: string, name: string) => { const s = await put(await authCall("signup", { email, password, name })); emit(); return s; };

export async function logout() {
  cached = null;
  await store.del(AUTH).catch(() => {});
  await store.del(FAMILY).catch(() => {});
  emit();
}

let refreshing: Promise<string | null> | null = null;
/** A valid access token, refreshed first if it expires within a minute. Null (and signed out) if the session is gone. */
export async function getAccessToken(force = false): Promise<string | null> {
  if (!cached) return null;
  if (!force && cached.expires_at - Date.now() > 60_000) return cached.access_token;
  const rt = cached.refresh_token, prev = cached.user;
  refreshing ??= authCall("refresh", { refresh_token: rt })
    .then(async (r) => (await put({ ...r, user: r.user?.id ? r.user : prev })).access_token)
    .catch(async () => { await logout(); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export const savedFamily = async () => store.get(FAMILY);
export const saveFamily = async (id: string) => store.set(FAMILY, id);
export const forgetFamily = async () => store.del(FAMILY);

const SEEN = "aangan.seen";
export const hasSeenWelcome = async () => (await store.get(SEEN).catch(() => null)) === "1";
export const markWelcomeSeen = async () => store.set(SEEN, "1").catch(() => {});
