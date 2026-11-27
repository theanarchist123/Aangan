import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { call, uploadFile, type Doc, type Session } from "../api";
import { Mitthu } from "../components/Mitthu";
import { SafeDial } from "../components/SafeDial";
import { c, f, isDark } from "../theme";
import { Btn, Card, Chip, Empty, ErrorText, Heading, IconBtn, inputStyle, Rise, Tap, Txt, useLoop, type IconName } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

const CATS = ["medical", "insurance", "utility", "property", "identity", "will", "other"];
const META: Record<string, { icon: IconName; tint: string }> = {
  medical: { icon: "medkit", tint: "#E5707E" }, insurance: { icon: "shield-checkmark", tint: "#3FA987" }, utility: { icon: "flash", tint: "#E09A2B" },
  property: { icon: "home", tint: "#7C8CE0" }, identity: { icon: "id-card", tint: "#B27BD0" }, will: { icon: "ribbon", tint: "#C8735A" }, other: { icon: "document-text", tint: "#8C8478" },
};
const meta = (k: string) => META[k] ?? META.other;

/** While Mitthu reads an upload: a page with a light sweeping over it. */
function Scanning() {
  const sweep = useLoop(1100, true);
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <View style={{ width: 62, height: 78, borderRadius: 8, backgroundColor: "#FFF8EC", padding: 9, gap: 7, overflow: "hidden" }}>
        {[1, 0.8, 0.95, 0.6, 0.85, 0.7].map((w, i) => <View key={i} style={{ height: 3, width: `${w * 100}%`, backgroundColor: "#CBB99C", borderRadius: 2 }} />)}
        <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 14, backgroundColor: "rgba(255,168,64,0.45)", borderBottomWidth: 2, borderBottomColor: "#E0801F", transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [-14, 76] }) }] }} />
      </View>
      <View style={{ flex: 1 }}><Txt variant="h2">Mitthu is reading…</Txt><Txt variant="muted">Finding dates and amounts, hiding ID numbers.</Txt></View>
      <Mitthu size={52} mood="thinking" />
    </Card>
  );
}

function UploadTile({ icon, label, tint, onPress, disabled }: { icon: IconName; label: string; tint: string; onPress: () => void; disabled: boolean }) {
  return (
    <Tap accessibilityLabel={label} disabled={disabled} onPress={onPress} wrap={{ flex: 1 }} style={{ height: 104, borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center", gap: 9 }}>
      <View style={{ width: 46, height: 46, borderRadius: isDark() ? 15 : 23, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={22} color="#fff" /></View>
      <Text style={{ fontFamily: f.bold, fontSize: 12.5, color: c.ink }}>{label}</Text>
    </Tap>
  );
}

/** A document as a paper folder: a coloured tab, then the page. */
function Folder({ d, onOpen }: { d: Doc; onOpen: () => void }) {
  const m = meta(d.category);
  const facts = Object.entries(d.extracted);
  return (
    <View>
      <View style={{ alignSelf: "flex-start", marginLeft: 16, flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: m.tint, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, marginBottom: -2 }}>
        <Ionicons name={m.icon} size={12} color="#fff" />
        <Text style={{ fontFamily: f.xbold, fontSize: 10.5, letterSpacing: 0.8, color: "#fff", textTransform: "uppercase" }}>{d.category}</Text>
      </View>
      <Card style={{ borderTopWidth: 3, borderTopColor: m.tint, gap: 10 }}>
        <Text style={{ fontFamily: f.serif, fontSize: isDark() ? 22 : 17.5, color: c.ink }}>{d.title}</Text>
        {facts.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {facts.map(([k, v]) => (
              <View key={k} style={{ backgroundColor: c.ivory, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, maxWidth: "100%" }}>
                <Text style={{ fontFamily: f.bold, fontSize: 9.5, letterSpacing: 0.7, color: c.muted, textTransform: "uppercase" }}>{k.replace(/_/g, " ")}</Text>
                <Text style={{ fontFamily: f.bold, fontSize: 13.5, color: c.ink }}>{v}</Text>
              </View>
            ))}
          </View>
        )}
        {d.has_file && (
          <Pressable accessibilityRole="button" onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingVertical: 2 }}>
            <Text style={{ fontFamily: f.bold, fontSize: 13, color: c.teal }}>Open original</Text><Ionicons name="arrow-forward" size={14} color={c.teal} />
          </Pressable>
        )}
      </Card>
    </View>
  );
}

/** The tijori: the family safe. The dial spins open after the phone's biometric unlock, and locks again when you leave. */
export function Vault({ sess, data, refresh, active = true }: { sess: Session; data: FamilyData; refresh: () => Promise<void>; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [form, setForm] = useState({ title: "", category: "medical", text: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const dial = useRef(new Animated.Value(0)).current;
  const picking = useRef(false);

  // Leaving the tab locks the safe again (but not while a camera or file picker is up).
  useEffect(() => {
    if (!active && !picking.current) { setOpen(false); setUnlocking(false); dial.setValue(0); }
  }, [active, dial]);

  /** Phone cameras make 5-15 MB photos. Shrink to a readable 2000 px JPEG first: far faster, and under the size limit. */
  async function shrink(uri: string): Promise<{ uri: string; name: string; type: string }> {
    try {
      const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 2000 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG });
      return { uri: r.uri, name: "scan.jpg", type: "image/jpeg" };
    } catch { return { uri, name: "scan.jpg", type: "image/jpeg" }; } // fall back to the original if resizing fails
  }
  async function send(uri: string, name: string, type: string) {
    setScanning(true); setErr(null); setScanMsg(null);
    try {
      const file = type.startsWith("image/") ? await shrink(uri) : { uri, name, type };
      const r = await uploadFile<{ title: string; ai_read: boolean; note: string | null; extracted: Record<string, string> }>(`/families/${sess.familyId}/documents/upload-b64`, file);
      setScanMsg(r.ai_read ? `Added "${r.title}". Mitthu read ${Object.keys(r.extracted).length} detail(s) from it.` : `Added "${r.title}". ${r.note ?? ""}`);
      await refresh();
    } catch (e) { setErr(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`); } finally { setScanning(false); }
  }
  async function camera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setErr("Camera permission is off. Allow it in phone settings, or choose a photo instead.");
    picking.current = true;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 }).finally(() => { picking.current = false; });
    if (!r.canceled && r.assets[0]) await send(r.assets[0].uri, r.assets[0].fileName ?? "scan.jpg", r.assets[0].mimeType ?? "image/jpeg");
  }
  async function gallery() {
    picking.current = true;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 }).finally(() => { picking.current = false; });
    if (!r.canceled && r.assets[0]) await send(r.assets[0].uri, r.assets[0].fileName ?? "photo.jpg", r.assets[0].mimeType ?? "image/jpeg");
  }
  async function pdf() {
    picking.current = true;
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true }).finally(() => { picking.current = false; });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 10 * 1024 * 1024) return setErr(`That file is ${(a.size / 1048576).toFixed(1)} MB. The limit is 10 MB. Try a smaller PDF or a photo of the page.`);
    await send(a.uri, a.name, a.mimeType ?? "application/pdf");
  }
  async function openOriginal(id: string) {
    try { const r = await call<{ url: string }>(sess, `/documents/${id}/file`); await Linking.openURL(r.url); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not open the file"); }
  }

  async function unlock() {
    setErr(null);
    try {
      if (Platform.OS !== "web") {
        const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
        if (!ok) { setErr("Set up a fingerprint, Face ID or screen lock in phone settings to open the vault."); return; }
        picking.current = true;
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Open the family vault" }).finally(() => { picking.current = false; });
        if (!r.success) return;
      }
      setUnlocking(true);
      Animated.timing(dial, { toValue: 1, duration: 1150, easing: Easing.bezier(0.65, 0, 0.25, 1), useNativeDriver: true }).start(({ finished }) => { if (finished) setOpen(true); });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not unlock"); }
  }
  function lock() { setOpen(false); setUnlocking(false); dial.setValue(0); }

  async function add() {
    setBusy(true); setErr(null);
    try { await call(sess, `/families/${sess.familyId}/documents`, "POST", form); setForm({ title: "", category: "medical", text: "" }); setTyping(false); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save the document"); } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <Screen>
        <Rise><Heading kicker="Sealed with your fingerprint" title="The family" accent="tijori." /></Rise>
        <View style={{ alignItems: "center", gap: 26, paddingTop: 22 }}>
          <Rise delay={90}>
            <Tap accessibilityLabel="Unlock the vault" disabled={unlocking} onPress={unlock} scaleTo={0.97}><SafeDial open={dial} unlocked={unlocking} /></Tap>
          </Rise>
          <Txt variant="muted" style={{ textAlign: "center", maxWidth: 280 }}>{data.docs.length} document{data.docs.length === 1 ? "" : "s"} inside, stored privately and shared only with people you allow.</Txt>
          <View style={{ width: "100%" }}><Btn label={unlocking ? "Opening…" : "Unlock with fingerprint / Face ID"} disabled={unlocking} onPress={unlock} icon={<Ionicons name="finger-print" size={21} color={isDark() ? "#1E1626" : c.onTeal} />} /></View>
          <ErrorText>{err}</ErrorText>
        </View>
      </Screen>
    );
  }

  const present = CATS.filter((k) => data.docs.some((d) => d.category === k));
  const docs = data.docs.filter((d) => (!cat || d.category === cat) && (!q || (d.title + d.text).toLowerCase().includes(q.toLowerCase())));
  const input = inputStyle();
  return (
    <Screen onRefresh={refresh}>
      <Rise><Heading kicker={`${data.docs.length} kept safe`} title="Family" accent="vault." right={<IconBtn icon="lock-closed-outline" label="Lock the vault" onPress={lock} />} /></Rise>
      <Rise delay={60}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <UploadTile icon="camera" label="Scan" tint="#C2553D" disabled={scanning} onPress={camera} />
          <UploadTile icon="images" label="Photo" tint="#3F8F78" disabled={scanning} onPress={gallery} />
          <UploadTile icon="document-attach" label="PDF / file" tint="#6B62C8" disabled={scanning} onPress={pdf} />
        </View>
      </Rise>
      {scanning && <Rise><Scanning /></Rise>}
      {!!scanMsg && <Rise><View style={{ flexDirection: "row", gap: 9, backgroundColor: c.parrotSoft, borderRadius: 16, padding: 13 }}><Ionicons name="checkmark-circle" size={20} color={c.parrot} /><Text accessibilityRole="alert" style={{ flex: 1, fontFamily: f.bold, color: c.ink }}>{scanMsg}</Text></View></Rise>}
      <ErrorText>{err}</ErrorText>

      <Rise delay={110}>
        <View>
          <Ionicons name="search" size={18} color={c.muted} style={{ position: "absolute", left: 16, top: 15, zIndex: 2 }} />
          <TextInput accessibilityLabel="Search documents" value={q} onChangeText={setQ} placeholder="Search 'insurance', 'HbA1c'…" placeholderTextColor={c.placeholder} style={[input, { borderRadius: 999, paddingLeft: 43 }]} />
        </View>
      </Rise>
      {present.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={`All ${data.docs.length}`} on={!cat} onPress={() => setCat(null)} />
          {present.map((k) => <Chip key={k} label={`${k} ${data.docs.filter((d) => d.category === k).length}`} icon={meta(k).icon} on={cat === k} onPress={() => setCat(cat === k ? null : k)} />)}
        </ScrollView>
      )}

      {docs.length === 0 && <Empty title={q || cat ? "Nothing matches" : "The tijori is empty"} hint={q || cat ? "Try another word or folder." : "Scan a prescription, policy or bill above."} />}
      {docs.map((d, i) => <Rise key={d.id} delay={130 + Math.min(i, 5) * 70}><Folder d={d} onOpen={() => openOriginal(d.id)} /></Rise>)}

      <Btn label={typing ? "Close" : "Type a document in instead"} kind="ghost" onPress={() => setTyping(!typing)} />
      {typing && (
        <Rise>
          <Card style={{ gap: 10 }}>
            <Txt variant="h2">Add by typing</Txt>
            <TextInput accessibilityLabel="Title" placeholder="Title, e.g. Papa's ECG report" placeholderTextColor={c.placeholder} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} style={input} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{CATS.map((k) => <Chip key={k} label={k} on={form.category === k} onPress={() => setForm({ ...form, category: k })} />)}</View>
            <TextInput accessibilityLabel="Document text" multiline numberOfLines={4} placeholder="Paste the text. Mitthu reads dates, amounts, BP and policy numbers, and hides Aadhaar/PAN." placeholderTextColor={c.placeholder} value={form.text} onChangeText={(v) => setForm({ ...form, text: v })} style={[input, { minHeight: 96, textAlignVertical: "top" }]} />
            <Btn label={busy ? "Reading…" : "Save to vault"} kind="teal" disabled={busy || !form.title.trim()} onPress={add} />
          </Card>
        </Rise>
      )}
      <Txt variant="muted" style={{ fontSize: 12, textAlign: "center" }}>Prototype: documents are read by Google Gemini. Use fake or sample documents only.</Txt>
    </Screen>
  );
}
