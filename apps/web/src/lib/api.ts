import { API, clearSession, getAccessToken, getSession } from "./auth";
export { API };

export type Person = {
  id: string; name: string; role: string; city: string; timezone: string; language: string; phone: string;
  is_emergency_contact: boolean; blood_group: string; allergies: string[]; conditions: string[];
  medications: { name: string; times?: string[] }[]; aadhaar: string; pan: string; last_checkin_at: string | null;
};
export type Step = { id: string; seq: number; agent: string; title: string; detail: string; status: string };
export type Approval = {
  id: string; task_id: string; action: string; reason: string; amount_inr: number; category: string;
  status: string; challenge: string; created_at: string;
};
export type Task = {
  id: string; goal: string; kind: string; status: string; created_at: string; escalation_reason: string | null;
  steps: Step[]; approvals: Approval[];
};
export type Notice = { id: string; channel: string; to: string; message: string; urgent: boolean; delivery: string; created_at: string };
export type Story = { person: string; person_id?: string; kind: string; title: string; ok: boolean; value?: number };
export type Doc = { id: string; title: string; category: string; text: string; extracted: Record<string, string>; has_file?: boolean };
export type Consent = { grantee: string; scope: string; granted: boolean; expires_at: string | null };
export type AuditEntry = { id: number; actor: string; action: string; hash: string; created_at: string; payload: Record<string, unknown> };
export type Member = { id: string; email: string; role: string; joined: boolean };
export type Weather = { city: string; temp_c: number; summary: string; is_day: boolean };
export type Hospital = { name: string; distance_km: number; phone: string; maps_url: string };
export type MyFamily = { id: string; name: string; role: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function send(path: string, init: RequestInit | undefined, token: string | null) {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (!(init?.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}/v1${path}`, { ...init, headers });
}

/** Calls the API with the signed-in user's token. On an expired session it refreshes once, then sends you to sign in. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let token = await getAccessToken();
  let res: Response;
  try {
    res = await send(path, init, token);
    if (res.status === 401 && token) {
      token = await getAccessToken(true);
      if (token) res = await send(path, init, token);
    }
  } catch {
    throw new ApiError(0, "Can't reach the Aangan server. Is the API running on " + API + "?");
  }
  if (res.status === 401 && getSession() === null && typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    clearSession();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- not a React component; a hard redirect also resets all state
    window.location.href = "/login";
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const upload = <T,>(path: string, file: Blob, name: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.append("file", file, name);
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return api<T>(path, { method: "POST", body: fd });
};

// The active family is remembered per signed-in user.
const famKey = () => `aangan.family.${getSession()?.user.id ?? "anon"}`;
export const getFamilyId = () => (typeof window === "undefined" ? null : localStorage.getItem(famKey()));
export const setFamilyId = (id: string) => localStorage.setItem(famKey(), id);
export const clearFamilyId = () => localStorage.removeItem(famKey());
