"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Approval, type AuditEntry, type Consent, type Doc, type Notice, type Person, type Story, type Task } from "./api";

export type FamilyInfo = { id: string; name: string; auto_approve_limit_inr: number; category_rules: Record<string, string>; device_registered: boolean };
export type Finding = { type: string; severity: string; message: string; person?: string };

export type FamilyData = {
  family: FamilyInfo | null;
  people: Person[];
  tasks: Task[];
  approvals: Approval[];
  notices: Notice[];
  stories: Story[];
  docs: Doc[];
  consents: Consent[];
  audit: { intact: boolean; entries: AuditEntry[] } | null;
};

const empty: FamilyData = { family: null, people: [], tasks: [], approvals: [], notices: [], stories: [], docs: [], consents: [], audit: null };

/** Loads everything for one family and polls so the timeline feels live. */
export function useFamily(familyId: string | null) {
  const [data, setData] = useState<FamilyData>(empty);
  const [loading, setLoading] = useState(!!familyId);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!familyId) return;
    try {
      const [family, people, tasks, approvals, notices, digest, docs, consents, audit] = await Promise.all([
        api<FamilyInfo>(`/families/${familyId}`),
        api<Person[]>(`/families/${familyId}/people`),
        api<Task[]>(`/families/${familyId}/tasks`),
        api<Approval[]>(`/families/${familyId}/approvals`),
        api<Notice[]>(`/families/${familyId}/notifications`),
        api<{ stories: Story[] }>(`/families/${familyId}/digest`),
        api<Doc[]>(`/families/${familyId}/documents`),
        api<Consent[]>(`/families/${familyId}/consents`),
        api<{ intact: boolean; entries: AuditEntry[] }>(`/families/${familyId}/audit`),
      ]);
      if (!alive.current) return;
      setData({ family, people, tasks, approvals, notices, stories: digest.stories, docs, consents, audit });
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      // A family id from a previous server run won't exist anymore.
      if (e instanceof ApiError && e.status === 404) setError("FAMILY_GONE");
      else setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
