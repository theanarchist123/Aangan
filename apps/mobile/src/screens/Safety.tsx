import { useEffect, useRef, useState } from "react";
import { Animated, Switch, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { call, type Notice, type Session } from "../api";
import { getUser } from "../auth";
import { useTheme, type ThemePref } from "../ThemeContext";
import { c, dark, f, isDark, light } from "../theme";
import { Btn, Card, ErrorText, Heading, IconBtn, Rise, Segmented, Tap, Txt, useApp, useLoop, type IconName } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

const RULES: { key: string; label: string; hint: string; mode: string; icon: IconName }[] = [
  { key: "medical_service", label: "Medical bookings", hint: "Always ask me first", mode: "always_ask", icon: "medkit" },
  { key: "home_service", label: "Home services", hint: "Always ask me first", mode: "always_ask", icon: "construct" },
  { key: "utility", label: "Utility bills", hint: "Never pay automatically", mode: "never_auto", icon: "flash" },
];
const STEP = 500, MAX = 20000;
type Part = "rules" | "proof" | "you";

/** The shield at the top breathes; its colour tells you whether the history is still intact. */
function ShieldHero({ intact }: { intact: boolean }) {
  const ring = useLoop(2800);
  const col = intact ? c.parrot : c.sos;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: c.card, borderRadius: 28, borderWidth: 1, borderColor: c.line, padding: 18 }}>
      <View style={{ width: 82, height: 82, alignItems: "center", justifyContent: "center" }}>
        {[0, 0.5].map((o) => <Animated.View key={o} style={{ position: "absolute", width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: col, opacity: Animated.modulo(Animated.add(ring, o), 1).interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: Animated.modulo(Animated.add(ring, o), 1).interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.45] }) }] }} />)}
        <Svg width={58} height={64} viewBox="0 0 58 64"><Path d="M29 2 L55 12 V30 Q55 52 29 62 Q3 52 3 30 V12Z" fill={col} />{intact ? <Path d="M17 31 l9 9 l16 -18" stroke={isDark() ? "#16111E" : "#fff"} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <Path d="M29 18 v18 M29 45 v1" stroke="#fff" strokeWidth={6} strokeLinecap="round" />}</Svg>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="h2">{intact ? "History is intact" : "History was altered"}</Txt>
        <Txt variant="muted">{intact ? "Every action is hash-chained, so a quiet edit would show here." : "A record no longer matches its chain. Please contact support."}</Txt>
      </View>
    </View>
  );
}

/** The spending limit as a dial: the arc fills as you trust Mitthu with more. */
function LimitDial({ value, canEdit, onStep }: { value: number; canEdit: boolean; onStep: (d: number) => void }) {
  const R = 108, W = 260, len = Math.PI * R, frac = Math.min(1, value / MAX);
  const knob = Math.PI * (1 - frac);
  const arc = `M ${W / 2 - R} 128 A ${R} ${R} 0 0 1 ${W / 2 + R} 128`;
  const Step = ({ d, icon }: { d: number; icon: IconName }) => (
    <Tap accessibilityLabel={d > 0 ? "Increase limit" : "Decrease limit"} disabled={!canEdit} onPress={() => onStep(d)}
      style={{ width: 54, height: 54, borderRadius: isDark() ? 18 : 27, backgroundColor: c.tealSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={26} color={c.teal} /></Tap>
  );
  return (
    <Card style={{ alignItems: "center", gap: 6 }}>
      <Txt variant="h2">Mitthu may spend, on his own</Txt>
      <View style={{ width: W, height: 142 }}>
        <Svg width={W} height={142}>
          <Path d={arc} stroke={c.tealSoft} strokeWidth={16} fill="none" strokeLinecap="round" />
          <Path d={arc} stroke={c.teal} strokeWidth={16} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - frac)} />
          <Circle cx={W / 2 + Math.cos(knob) * R} cy={128 - Math.sin(knob) * R} r={12} fill={c.card} stroke={c.teal} strokeWidth={5} />
        </Svg>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 6, alignItems: "center" }}>
          <Text style={{ fontFamily: f.display, fontSize: 40, color: c.ink }}>₹{value.toLocaleString("en-IN")}</Text>
          <Text style={{ fontFamily: f.semi, fontSize: 12, color: c.muted }}>per action</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 70 }}><Step d={-STEP} icon="remove" /><Step d={STEP} icon="add" /></View>
      <Txt variant="muted" style={{ textAlign: "center", marginTop: 6 }}>Anything above this waits for your fingerprint.</Txt>
    </Card>
  );
}

function ChainLink() {
  return (
    <View style={{ alignItems: "center", height: 18 }}>
      <Svg width={16} height={18}><Line x1={8} y1={0} x2={8} y2={18} stroke={c.parrot} strokeWidth={2} /><Rect x={4} y={4} width={8} height={11} rx={4} fill={c.ivory} stroke={c.parrot} strokeWidth={2} /></Svg>
    </View>
  );
}

function Bubble({ n }: { n: Notice }) {
  const sent = n.delivery === "sent", failed = n.delivery.startsWith("failed");
  const status = sent ? "Delivered on WhatsApp" : failed ? `Not delivered (${n.delivery.replace("failed: ", "")})` : n.delivery === "not_configured" ? "Shown in app only" : "In app";
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: f.bold, fontSize: 11.5, color: n.urgent ? c.sos : c.muted }}>To {n.to} · {n.channel}{n.urgent ? " · urgent" : ""}</Text>
      <View style={{ backgroundColor: c.card, borderRadius: 18, borderTopLeftRadius: 4, borderWidth: 1, borderColor: n.urgent ? c.sos : c.line, padding: 12 }}>
        <Txt style={{ fontSize: 13.5, lineHeight: 19 }}>{n.message}</Txt>
      </View>
      <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
        <Ionicons name={sent ? "checkmark-done" : failed ? "close-circle" : "phone-portrait-outline"} size={13} color={sent ? c.parrot : failed ? c.sos : c.muted} />
        <Text style={{ flex: 1, fontFamily: f.semi, fontSize: 11.5, color: sent ? c.parrot : failed ? c.sos : c.muted }}>{status}</Text>
      </View>
    </View>
  );
}

/** A tiny picture of each theme, so you choose by looking. */
function ThemeCard({ k, label, selected }: { k: ThemePref; label: string; selected: boolean }) {
  const { setPref } = useTheme();
  const half = (p: typeof light) => (
    <View style={{ flex: 1, backgroundColor: p.ivory, padding: 7, gap: 5 }}>
      <View style={{ height: 7, width: "75%", borderRadius: 4, backgroundColor: p.ink }} />
      <View style={{ height: 20, borderRadius: 6, backgroundColor: p.card, borderWidth: 1, borderColor: p.line }} />
      <View style={{ height: 20, borderRadius: 6, backgroundColor: p.paper, borderWidth: 1, borderColor: p.paperLine }} />
      <View style={{ height: 9, borderRadius: 5, backgroundColor: p.teal }} />
    </View>
  );
  return (
    <Tap accessibilityLabel={`${label} theme`} accessibilityState={{ selected }} onPress={(e) => setPref(k, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })} wrap={{ flex: 1 }} style={{ gap: 7, alignItems: "center" }}>
      <View style={{ width: "100%", height: 92, borderRadius: 16, overflow: "hidden", borderWidth: 2.5, borderColor: selected ? c.teal : c.line, flexDirection: "row" }}>
        {k === "system" ? <>{half(light)}{half(dark)}</> : half(k === "dark" ? dark : light)}
      </View>
      <Text style={{ fontFamily: selected ? f.xbold : f.semi, fontSize: 12.5, color: selected ? c.teal : c.muted }}>{label}</Text>
    </Tap>
  );
}

export function Safety({ sess, data, refresh, onSignOut }: { sess: Session; data: FamilyData; refresh: () => Promise<void>; onSignOut: () => void }) {
  const fam = data.family;
  const canEdit = sess.role === "sponsor";
  const { pref } = useTheme();
  const { go } = useApp();
  const user = getUser();
  const [part, setPart] = useState<Part>("rules");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [limit, setLimit] = useState(fam?.auto_approve_limit_inr ?? 0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!saveTimer.current) setLimit(fam?.auto_approve_limit_inr ?? 0); }, [fam?.auto_approve_limit_inr]);
  if (!fam) return null;

  async function save(body: object) {
    setErr(null); setSaved(false);
    try { await call(sess, `/families/${sess.familyId}/limits`, "PATCH", body); setSaved(true); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); setLimit(fam!.auto_approve_limit_inr); }
  }
  /** The dial moves at once; the server is told once you stop tapping. */
  function step(d: number) {
    const next = Math.min(MAX, Math.max(0, limit + d));
    setLimit(next); setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void save({ auto_approve_limit_inr: next }); }, 700);
  }

  return (
    <Screen onRefresh={refresh}>
      <Rise><Heading kicker="You stay in charge" title="Safety &" accent="trust." right={<IconBtn icon="close" label="Back to Home" onPress={() => go("home")} />} /></Rise>
      <Rise delay={60}><ShieldHero intact={data.audit?.intact ?? true} /></Rise>
      <Rise delay={110}><Segmented value={part} onChange={setPart} options={[{ id: "rules", label: "Limits" }, { id: "proof", label: "Proof" }, { id: "you", label: "You" }]} /></Rise>
      <ErrorText>{err}</ErrorText>

      {part === "rules" && (
        <Rise>
          <View style={{ gap: 14 }}>
            <LimitDial value={limit} canEdit={canEdit} onStep={step} />
            {saved && <Text accessibilityRole="alert" style={{ textAlign: "center", fontFamily: f.bold, color: c.parrot }}>Saved.</Text>}
            {!canEdit && <Txt variant="muted" style={{ textAlign: "center" }}>Only the family sponsor can change limits and rules.</Txt>}
            <Card>
              <Txt variant="h2">House rules</Txt>
              {RULES.map((r, i) => {
                const on = fam.category_rules[r.key] === r.mode;
                return (
                  <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: on ? c.parrotSoft : c.ivory, alignItems: "center", justifyContent: "center" }}><Ionicons name={r.icon} size={19} color={on ? c.parrot : c.muted} /></View>
                    <View style={{ flex: 1 }}><Text style={{ fontFamily: f.bold, color: c.ink, fontSize: 15 }}>{r.label}</Text><Txt variant="muted">{r.hint}</Txt></View>
                    <Switch disabled={!canEdit} accessibilityLabel={`${r.label}: ${r.hint}`} value={on} trackColor={{ true: c.parrot, false: c.line }} thumbColor="#fff"
                      onValueChange={() => { const next = { ...fam.category_rules }; if (on) delete next[r.key]; else next[r.key] = r.mode; void save({ category_rules: next }); }} />
                  </View>
                );
              })}
              <Txt variant="muted" style={{ marginTop: 4 }}>Medical consent, sharing documents and legal actions always need your approval.</Txt>
            </Card>
          </View>
        </Rise>
      )}

      {part === "proof" && (
        <Rise>
          <View style={{ gap: 14 }}>
            <View>
              <Txt variant="h2" style={{ marginBottom: 10 }}>The chain of actions</Txt>
              {!data.audit?.entries.length && <Txt variant="muted">No actions recorded yet.</Txt>}
              {data.audit?.entries.slice(0, 10).map((e, i, all) => (
                <View key={e.id}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 12 }}>
                    <View style={{ flex: 1 }}><Text style={{ fontFamily: f.bold, fontSize: 13.5, color: c.ink }}>{e.action}</Text><Txt variant="muted" style={{ fontSize: 12 }}>by {e.actor}</Txt></View>
                    <Text style={{ fontFamily: f.semi, fontSize: 10.5, color: c.parrot }}>#{e.hash.slice(0, 10)}</Text>
                  </View>
                  {i < all.length - 1 && <ChainLink />}
                </View>
              ))}
            </View>
            <Txt variant="h2">Messages sent</Txt>
            {data.notices.length === 0 && <Txt variant="muted">Nothing sent yet.</Txt>}
            {data.notices.slice(0, 10).map((n) => <Bubble key={n.id} n={n} />)}
          </View>
        </Rise>
      )}

      {part === "you" && (
        <Rise>
          <View style={{ gap: 14 }}>
            <Card style={{ gap: 12 }}>
              <Txt variant="h2">Look and feel</Txt>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <ThemeCard k="system" label="Auto" selected={pref === "system"} />
                <ThemeCard k="light" label="Sunlit" selected={pref === "light"} />
                <ThemeCard k="dark" label="Dusk" selected={pref === "dark"} />
              </View>
            </Card>
            <Card style={{ gap: 12 }}>
              <View><Text style={{ fontFamily: f.bold, fontSize: 16, color: c.ink }}>{user?.name || user?.email}</Text><Txt variant="muted">{user?.email}{sess.role ? ` · ${sess.role}` : ""}</Txt></View>
              <Btn label="Sign out" kind="ghost" onPress={onSignOut} icon={<Ionicons name="log-out-outline" size={18} color={c.ink} />} />
            </Card>
          </View>
        </Rise>
      )}
    </Screen>
  );
}
