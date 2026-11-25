import { Platform } from "react-native";
import { getAccessToken, getServer } from "./auth";

export type Person = {
  id: string; name: string; role: string; city: string; timezone: string; language: string; phone: string;
  is_emergency_contact: boolean; blood_group: string; allergies: string[]; conditions: string[];
  medications: { name: string; times?: string[] }[]; aadhaar: string; pan: string; last_checkin_at: string | null;
};
export type Approval = { id: string; task_id: string; action: string; reason: string; amount_inr: number; status: string; category: string };
export type Step = { id: string; seq: number; title: string; detail: string; status: string; agent: string };
export type Task = {
  id: string; goal: string; status: string; kind: string; created_at: string; steps: Step[]; approvals: Approval[];
  escalation_reason: string | null;
};
export type Notice = { id: string; channel: string; to: string; message: string; urgent: boolean; delivery: string };
export type Story = { person: string; person_id?: string; kind: string; title: string; ok: boolean; value?: number };
export type Doc = { id: string; title: string; category: string; text: string; extracted: Record<string, string>; has_file?: boolean };
export type Consent = { grantee: string; scope: string; granted: boolean; expires_at: string | null };
export type AuditEntry = { id: number; actor: string; action: string; hash: string };
export type FamilyInfo = { id: string; name: string; auto_approve_limit_inr: number; category_rules: Record<string, string> };
export type Finding = { type: string; severity: string; message: string };
export type Member = { id: string; email: string; role: string; joined: boolean };
export type Weather = { city: string; temp_c: number; summary: string; is_day: boolean };
export type Hospital = { name: string; distance_km: number; phone: string; maps_url: string };
export type MyFamily = { id: string; name: string; role: string };

/** Everything the screens need to talk to one family. */
export type Session = { api: string; familyId: string; role?: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function send(path: string, method: string, body: unknown, token: string | null, timeoutMs: number) {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${getServer()}/v1${path}`, { method, headers, signal: ctl.signal, body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
  } finally { clearTimeout(timer); }
}

/** Authenticated API call. Refreshes an expired token once; a dead session signs the user out (see onAuthChange). */
export async function call<T>(_s: unknown, path: string, method = "GET", body?: unknown, timeoutMs = 30_000): Promise<T> {
  let token = await getAccessToken();
  let res: Response;
  try {
    res = await send(path, method, body, token, timeoutMs);
    if (res.status === 401 && token) {
      token = await getAccessToken(true);
      if (token) res = await send(path, method, body, token, timeoutMs);
    }
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    throw new ApiError(0, timedOut ? "The server took too long to answer. Check your connection and try again."
      : `Can't reach the server at ${getServer()}. Check the address, the Wi-Fi, and that the API is running.`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") detail = j.detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Read a local file (photo, PDF, recording) as base64. Works for file:// and content:// URIs on Android. */
export async function fileToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("Could not read the file"));
      r.readAsDataURL(blob);
    });
  }
  const { readAsStringAsync } = await import("expo-file-system/legacy");
  return readAsStringAsync(uri, { encoding: "base64" });
}

/**
 * Send a local file to an `...-b64` endpoint as plain JSON. This avoids multipart/FormData, whose handling of local file
 * URIs differs between phones and Expo versions, and lets the server detect the real file type from the bytes.
 */
export async function uploadFile<T>(path: string, file: { uri: string; name: string; type: string }, extra: Record<string, string> = {}): Promise<T> {
  let data: string;
  try { data = await fileToBase64(file.uri); }
  catch { throw new ApiError(0, "Couldn't read that file from your phone. Please pick it again."); }
  if (!data) throw new ApiError(0, "That file looks empty.");
  return call<T>(null, path, "POST", { filename: file.name, mime: file.type, data, ...extra }, 180_000);
}

/** The caregiver / emergency-card pages live on the web app (same host, port 3000). */
export const webBase = () => getServer().replace(/:\d+$/, ":3000");
