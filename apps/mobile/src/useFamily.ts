import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { call, ApiError, type Approval, type AuditEntry, type Consent, type Doc, type FamilyInfo, type Notice, type Person, type Session, type Story, type Task } from "./api";

export type FamilyData = {
  family: FamilyInfo | null; people: Person[]; tasks: Task[]; approvals: Approval[]; notices: Notice[];
  stories: Story[]; docs: Doc[]; consents: Consent[]; audit: { intact: boolean; entries: AuditEntry[] } | null;
};
const empty: FamilyData = { family: null, people: [], tasks: [], approvals: [], notices: [], stories: [], docs: [], consents: [], audit: null };

/** Loads everything for the family and polls, so timelines feel live. */
export function useFamily(sess: Session | null) {
  const [data, setData] = useState<FamilyData>(empty);
  const [loading, setLoading] = useState(!!sess);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const alive = useRef(true);
  const inflight = useRef(false);
  const loaded = useRef(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!sess || inflight.current) return; // never stack requests on a slow server
    inflight.current = true;
    const id = sess.familyId;
    try {
      const [family, people, tasks, approvals, notices, digest, docs, consents, audit] = await Promise.all([
        call<FamilyInfo>(sess, `/families/${id}`),
        call<Person[]>(sess, `/families/${id}/people`),
        call<Task[]>(sess, `/families/${id}/tasks`),
        call<Approval[]>(sess, `/families/${id}/approvals`),
        call<Notice[]>(sess, `/families/${id}/notifications`),
        call<{ stories: Story[] }>(sess, `/families/${id}/digest`),
        call<Doc[]>(sess, `/families/${id}/documents`),
        call<Consent[]>(sess, `/families/${id}/consents`),
        call<{ intact: boolean; entries: AuditEntry[] }>(sess, `/families/${id}/audit`),
      ]);
      if (!alive.current) return;
      setData({ family, people, tasks, approvals, notices, stories: digest.stories, docs, consents, audit });
      loaded.current = true;
      busy.current = tasks.some((t) => t.status === "running" || t.status === "awaiting_approval");
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else if (!loaded.current) setError(e instanceof Error ? e.message : "Something went wrong"); // after first load, keep showing what we have
    } finally {
      inflight.current = false;
      if (alive.current) setLoading(false);
    }
  }, [sess]);

  useEffect(() => {
    alive.current = true;
    loaded.current = false;
    void refresh();
    // Fast while an emergency/task is moving, relaxed otherwise, and paused while the app is in the background.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { if (AppState.currentState === "active") void refresh(); timer = setTimeout(tick, busy.current ? 5000 : 20000); };
    timer = setTimeout(tick, 20000);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") void refresh(); });
    return () => { alive.current = false; clearTimeout(timer); sub.remove(); };
  }, [refresh]);

  return { data, loading, error, gone, refresh };
}
