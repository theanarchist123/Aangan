import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Share, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { call, webBase, type Member, type Person, type Session } from "../api";
import { c, f, isDark } from "../theme";
import { Constellation } from "../components/Constellation";
import { callName } from "../components/HomeBlocks";
import { Btn, Card, Chip, Empty, ErrorText, Heading, inputStyle, Pill, Rise, Segmented, Txt } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

const ROLE: Record<string, string> = { sponsor: "You", parent: "Parent", relative: "Relative", neighbour: "Neighbour", secretary: "Building secretary", poa: "Power of attorney", caregiver: "Caregiver" };

function PersonCard({ p, sess, refresh }: { p: Person; sess: Session; refresh: () => Promise<void> }) {
  const [shown, setShown] = useState<{ aadhaar: string; pan: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reveal() {
    if (shown) return setShown(null);
    setErr(null);
    try {
      await call(sess, `/families/${sess.familyId}/consents`, "POST", { grantee: "sponsor", scope: "id.unmask", ttl_hours: 1 });
      const r = await call<Person>(sess, `/people/${p.id}/health?unmask=true`);
      setShown({ aadhaar: r.aadhaar, pan: r.pan }); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not reveal"); }
  }
  async function card() {
    try {
      const r = await call<{ url: string }>(sess, `/people/${p.id}/emergency-card`, "POST");
      await Share.share({ message: `${p.name}'s emergency medical card: ${webBase()}${r.url}` });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create the card"); }
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: p.role === "parent" ? c.marigoldSoft : c.tealSoft, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: f.serif, fontSize: 20, color: c.ink }}>{callName(p.name)[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{p.name}</Txt>
          <Txt variant="muted">{ROLE[p.role] ?? p.role}{p.city ? ` · ${p.city}` : ""}{p.is_emergency_contact ? " · Emergency contact" : ""}</Txt>
        </View>
        {!!p.phone && <Pressable accessibilityRole="button" accessibilityLabel={`Call ${p.name}`} onPress={() => Linking.openURL(`tel:${p.phone}`)} style={{ padding: 10, borderRadius: 14, backgroundColor: c.tealSoft }}><Ionicons name="call" size={20} color={c.teal} /></Pressable>}
      </View>
      {p.role === "parent" && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {!!p.blood_group && <Pill label={p.blood_group} bg="rgba(214,40,40,0.1)" fg={c.sos} />}
            {p.allergies.map((a) => <Pill key={a} label={`Allergy: ${a}`} bg={c.marigoldSoft} fg={c.ink} />)}
            {p.conditions.map((x) => <Pill key={x} label={x} />)}
          </View>
          {p.medications.length > 0 && <Txt><Text style={{ fontFamily: f.bold }}>Medicines: </Text>{p.medications.map((m) => m.name).join(" · ")}</Txt>}
          {(!!p.aadhaar || !!p.pan) && (
            <View style={{ backgroundColor: c.marigoldSoft, borderRadius: 14, padding: 12, gap: 6 }}>
              <Txt style={{ fontFamily: f.semi }}>Aadhaar  {shown?.aadhaar ?? p.aadhaar}</Txt>
              <Txt style={{ fontFamily: f.semi }}>PAN  {shown?.pan ?? p.pan}</Txt>
              <View style={{ alignItems: "flex-start" }}><Btn small kind="ghost" label={shown ? "Hide" : "Reveal for 1 hour"} onPress={reveal} icon={<Ionicons name={shown ? "eye-off" : "eye"} size={16} color={c.ink} />} /></View>
            </View>
          )}
          <View style={{ alignItems: "flex-start" }}><Btn small kind="ghost" label="Emergency medical card" onPress={card} icon={<Ionicons name="qr-code" size={16} color={c.ink} />} /></View>
        </>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

function Members({ sess }: { sess: Session }) {
  const canInvite = sess.role === "sponsor";
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"relative" | "parent">("relative");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => call<Member[]>(sess, `/families/${sess.familyId}/members`).then(setMembers).catch((e) => setErr(e.message)), [sess]);
  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setErr(null); setNote(null);
    try { const r = await call<{ note: string }>(sess, `/families/${sess.familyId}/members`, "POST", { email, role }); setNote(r.note); setEmail(""); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not invite"); }
  }
  async function remove(id: string) {
    try { await call(sess, `/families/${sess.familyId}/members/${id}`, "DELETE"); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); }
  }
  const input = inputStyle();
  return (
    <Card style={{ gap: 8 }}>
      <Txt variant="h2">People with app access</Txt>
      <Txt variant="muted">Relatives can help and view. Only you, the sponsor, can approve money, change limits or share data.</Txt>
      {members.map((m) => (
        <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.line }}>
          <Txt style={{ flex: 1, fontSize: 14 }}><Text style={{ fontFamily: f.bold }}>{m.email}</Text>  {m.role}{m.joined ? "" : " · invited"}</Txt>
          {canInvite && m.role !== "sponsor" && <Btn small kind="ghost" label="Remove" onPress={() => remove(m.id)} />}
        </View>
      ))}
      {canInvite && (
        <>
          <TextInput accessibilityLabel="Email to invite" placeholder="sibling@example.com" placeholderTextColor={c.placeholder} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} style={input} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["relative", "parent"] as const).map((r) => <Chip key={r} label={r} on={role === r} onPress={() => setRole(r)} />)}
          </View>
          <Btn label="Invite" kind="teal" disabled={!email.trim()} onPress={invite} />
        </>
      )}
      {!!note && <Text accessibilityRole="alert" style={{ fontFamily: f.bold, color: c.parrot }}>{note}</Text>}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

type View3 = "circle" | "add" | "access";

export function Family({ sess, data, refresh }: { sess: Session; data: FamilyData; refresh: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", role: "parent", city: "", phone: "", blood_group: "", language: "hi", is_emergency_contact: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View3>("circle");
  const [picked, setPicked] = useState<string | undefined>();
  const person = data.people.find((p) => p.id === picked) ?? data.people.find((p) => p.role === "parent") ?? data.people[0];

  async function add() {
    setBusy(true); setErr(null);
    try { await call(sess, `/families/${sess.familyId}/people`, "POST", form); setForm({ ...form, name: "", city: "", phone: "", blood_group: "" }); await refresh(); setView("circle"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not add"); } finally { setBusy(false); }
  }
  async function revoke(grantee: string, scope: string) {
    try { await call(sess, `/families/${sess.familyId}/consents`, "POST", { grantee, scope, granted: false }); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not revoke"); }
  }
  const input = inputStyle();
  const active = data.consents.filter((x) => x.granted);

  return (
    <Screen onRefresh={refresh}>
      <Rise><Heading kicker={`${data.people.length} ${data.people.length === 1 ? "person" : "people"} looking out for each other`} title="Your family" accent="circle." /></Rise>
      <Rise delay={60}><Segmented value={view} onChange={setView} options={[{ id: "circle", label: "Circle" }, { id: "add", label: "Add someone" }, { id: "access", label: "Access" }]} /></Rise>

      {view === "circle" && (
        data.people.length === 0 ? <Empty title="Nobody here yet" hint="Add your parents to start the circle." /> : (
          <View style={{ gap: 14 }}>
            <Constellation people={data.people} selected={person?.id} onSelect={setPicked} />
            <Txt variant="muted" style={{ textAlign: "center", fontSize: 12 }}>Tap someone to open their card. A red mark means they are alerted first in an emergency.</Txt>
            {person && <Rise key={person.id} from={26}><PersonCard p={person} sess={sess} refresh={refresh} /></Rise>}
          </View>
        )
      )}

      {view === "add" && (
        <Rise>
          <Card style={{ gap: 10 }}>
            <Txt variant="h2">Who joins the circle?</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["parent", "relative", "neighbour", "secretary", "poa", "caregiver"].map((r) => <Chip key={r} label={ROLE[r]} on={form.role === r} onPress={() => setForm({ ...form, role: r })} />)}
            </View>
            <TextInput accessibilityLabel="Name" placeholder="Name" placeholderTextColor={c.placeholder} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} style={input} />
            <TextInput accessibilityLabel="City" placeholder="City" placeholderTextColor={c.placeholder} value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} style={input} />
            <TextInput accessibilityLabel="Phone" placeholder="Phone (+91…)" placeholderTextColor={c.placeholder} keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} style={input} />
            <TextInput accessibilityLabel="Blood group" placeholder="Blood group" placeholderTextColor={c.placeholder} value={form.blood_group} onChangeText={(v) => setForm({ ...form, blood_group: v })} style={input} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt style={{ flex: 1 }}>Alert this person first in an emergency</Txt>
              <Switch value={form.is_emergency_contact} onValueChange={(v) => setForm({ ...form, is_emergency_contact: v })} trackColor={{ true: c.parrot, false: c.line }} thumbColor="#fff" />
            </View>
            <Btn label={busy ? "Adding…" : "Add to circle"} disabled={busy || !form.name.trim()} onPress={add} />
          </Card>
        </Rise>
      )}

      {view === "access" && (
        <Rise>
          <View style={{ gap: 14 }}>
            <Members sess={sess} />
            <Txt variant="h2">Who can see what</Txt>
            {active.length === 0 && <Card><Txt variant="muted">No active permissions. Nobody but you can see sensitive data.</Txt></Card>}
            {active.map((x) => (
              <Card key={x.grantee + x.scope} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="key" size={20} color={isDark() ? c.teal : c.marigold} />
                <Txt style={{ flex: 1, fontSize: 14 }}><Text style={{ fontFamily: f.bold }}>{x.grantee}</Text> can <Text style={{ fontFamily: f.bold }}>{x.scope}</Text>{x.expires_at ? ` until ${new Date(x.expires_at).toLocaleTimeString()}` : ""}</Txt>
                <Btn small kind="ghost" label="Revoke" onPress={() => revoke(x.grantee, x.scope)} />
              </Card>
            ))}
          </View>
        </Rise>
      )}
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}
