import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { call, type Session } from "../api";
import { getUser } from "../auth";
import { useTheme, type ThemePref } from "../ThemeContext";
import { c, f } from "../theme";
import { Btn, Card, ErrorText, Txt } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

const RULES = [
  { key: "medical_service", label: "Medical bookings", hint: "Always ask me first", mode: "always_ask" },
  { key: "home_service", label: "Home services", hint: "Always ask me first", mode: "always_ask" },
  { key: "utility", label: "Utility bills", hint: "Never pay automatically", mode: "never_auto" },
] as const;
const STEP = 500, MAX = 20000;

export function Safety({ sess, data, refresh, onSignOut }: { sess: Session; data: FamilyData; refresh: () => Promise<void>; onSignOut: () => void }) {
  const fam = data.family;
  const canEdit = sess.role === "sponsor";
  const { pref, setPref } = useTheme();
  const user = getUser();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!fam) return null;

  async function save(body: object) {
    setErr(null); setSaved(false);
    try { await call(sess, `/families/${sess.familyId}/limits`, "PATCH", body); setSaved(true); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  }
  const lim = fam.auto_approve_limit_inr;
  const Step = ({ d, icon }: { d: number; icon: keyof typeof Ionicons.glyphMap }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={d > 0 ? "Increase limit" : "Decrease limit"} onPress={() => save({ auto_approve_limit_inr: Math.min(MAX, Math.max(0, lim + d)) })}
      disabled={!canEdit} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.tealSoft, alignItems: "center", justifyContent: "center", opacity: canEdit ? 1 : 0.4 }}><Ionicons name={icon} size={26} color={c.teal} /></Pressable>
  );

  return (
    <Screen onRefresh={refresh}>
      <Txt variant="title">Safety &amp; trust</Txt>

      <Card style={{ gap: 12 }}>
        <Txt variant="h2">Account</Txt>
        <View><Text style={{ fontFamily: f.bold, fontSize: 16, color: c.ink }}>{user?.name || user?.email}</Text><Txt variant="muted">{user?.email}{sess.role ? ` · ${sess.role}` : ""}</Txt></View>
        <Txt variant="kicker">Appearance</Txt>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["system", "Device", "phone-portrait-outline"], ["light", "Light", "sunny"], ["dark", "Dark", "moon"]] as [ThemePref, string, keyof typeof Ionicons.glyphMap][]).map(([k, label, icon]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: pref === k }} accessibilityLabel={`${label} theme`} onPress={() => setPref(k)}
              style={{ flex: 1, minHeight: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 2, borderWidth: 2, borderColor: pref === k ? c.teal : c.line, backgroundColor: pref === k ? c.tealSoft : "transparent" }}>
              <Ionicons name={icon} size={20} color={pref === k ? c.teal : c.muted} /><Text style={{ fontFamily: f.bold, fontSize: 12, color: pref === k ? c.teal : c.muted }}>{label}</Text>
            </Pressable>))}
        </View>
        <Btn label="Sign out" kind="ghost" onPress={onSignOut} icon={<Ionicons name="log-out-outline" size={18} color={c.ink} />} />
      </Card>

      <Card>
        <Txt variant="h2">Auto-approve limit</Txt>
        <Txt variant="muted" style={{ marginTop: 2 }}>Mitthu can book routine services up to this amount on its own. Anything above needs your biometric approval.</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <Step d={-STEP} icon="remove" />
          <Text style={{ fontFamily: f.xbold, fontSize: 38, color: c.teal }}>₹{lim.toLocaleString("en-IN")}</Text>
          <Step d={STEP} icon="add" />
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: c.tealSoft, marginTop: 14, overflow: "hidden" }}><View style={{ width: `${(lim / MAX) * 100}%`, height: 8, backgroundColor: c.marigold }} /></View>
        {saved && <Text accessibilityRole="alert" style={{ marginTop: 8, fontFamily: f.bold, color: c.parrot }}>Saved.</Text>}
        {!canEdit && <Txt variant="muted" style={{ marginTop: 8 }}>Only the family sponsor can change limits and rules.</Txt>}
      </Card>

      <Card>
        <Txt variant="h2">Rules by category</Txt>
        {RULES.map((r, i) => {
          const on = fam.category_rules[r.key] === r.mode;
          return (
            <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <View style={{ flex: 1 }}><Text style={{ fontFamily: f.bold, color: c.ink, fontSize: 15 }}>{r.label}</Text><Txt variant="muted">{r.hint}</Txt></View>
              <Switch disabled={!canEdit} accessibilityLabel={`${r.label}: ${r.hint}`} value={on} trackColor={{ true: c.teal }} thumbColor="#fff"
                onValueChange={() => { const next = { ...fam.category_rules }; if (on) delete next[r.key]; else next[r.key] = r.mode; void save({ category_rules: next }); }} />
            </View>
          );
        })}
        <Txt variant="muted" style={{ marginTop: 4 }}>Medical consent, sharing documents and legal actions always need your approval.</Txt>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt variant="h2">Audit trail</Txt>
          {data.audit && <Text style={{ fontFamily: f.bold, color: data.audit.intact ? c.parrot : c.sos }}>{data.audit.intact ? "✓ Tamper-proof" : "⚠ Chain broken"}</Text>}
        </View>
        <Txt variant="muted">Every agent action is recorded and chained with a hash, so edits would show.</Txt>
        {data.audit?.entries.slice(0, 12).map((e) => (
          <View key={e.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line, marginTop: 4 }}>
            <Txt style={{ flex: 1, fontSize: 13 }}><Text style={{ fontFamily: f.bold }}>{e.action}</Text> by {e.actor}</Txt>
            <Text style={{ fontFamily: f.reg, fontSize: 11, color: c.muted }}>{e.hash}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Txt variant="h2">Notifications sent</Txt>
        {data.notices.length === 0 && <Txt variant="muted" style={{ marginTop: 4 }}>Nothing sent yet.</Txt>}
        {data.notices.slice(0, 10).map((n) => (
          <Txt key={n.id} style={{ marginTop: 8, fontSize: 13 }}>
            <Text style={{ fontFamily: f.bold, color: n.urgent ? c.sos : c.muted }}>[{n.channel}] </Text><Text style={{ fontFamily: f.bold }}>{n.to}: </Text>{n.message}{"  "}
            <Text style={{ fontFamily: f.bold, color: n.delivery === "sent" ? c.parrot : n.delivery.startsWith("failed") ? c.sos : c.muted }}>
              {n.delivery === "sent" ? "✓ delivered on WhatsApp" : n.delivery.startsWith("failed") ? `✗ not delivered (${n.delivery.replace("failed: ", "")})` : n.delivery === "not_configured" ? "in-app only" : "in-app"}
            </Text>
          </Txt>
        ))}
      </Card>
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}
