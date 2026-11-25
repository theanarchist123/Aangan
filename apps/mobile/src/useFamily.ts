import { useCallback, useEffect, useRef, useState } from "react";
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

  const refresh = useCallback(async () => {
    if (!sess) return;
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
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [sess]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => { alive.current = false; clearInterval(t); };
  }, [refresh]);

  return { data, loading, error, gone, refresh };
}
