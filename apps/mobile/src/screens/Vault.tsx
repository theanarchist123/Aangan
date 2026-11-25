import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { call, uploadFile, type Session } from "../api";
import { c, f } from "../theme";
import { Btn, Card, Empty, ErrorText, Pill, Txt } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { medical: "medkit", insurance: "shield-checkmark", utility: "flash", property: "home", identity: "id-card" };
const CATS = ["medical", "insurance", "utility", "property", "identity", "will", "other"];

/** The tijori: the family safe. The door swings open after the phone's biometric unlock. */
export function Vault({ sess, data, refresh }: { sess: Session; data: FamilyData; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ title: "", category: "medical", text: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const door = useRef(new Animated.Value(0)).current;

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
      const f = type.startsWith("image/") ? await shrink(uri) : { uri, name, type };
      const r = await uploadFile<{ title: string; ai_read: boolean; note: string | null; extracted: Record<string, string> }>(`/families/${sess.familyId}/documents/upload-b64`, f);
      setScanMsg(r.ai_read ? `Added "${r.title}". Mitthu read ${Object.keys(r.extracted).length} detail(s) from it.` : `Added "${r.title}". ${r.note ?? ""}`);
      await refresh();
    } catch (e) { setErr(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`); } finally { setScanning(false); }
  }
  async function camera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setErr("Camera permission is off. Allow it in phone settings, or choose a photo instead.");
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!r.canceled && r.assets[0]) await send(r.assets[0].uri, r.assets[0].fileName ?? "scan.jpg", r.assets[0].mimeType ?? "image/jpeg");
  }
  async function gallery() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!r.canceled && r.assets[0]) await send(r.assets[0].uri, r.assets[0].fileName ?? "photo.jpg", r.assets[0].mimeType ?? "image/jpeg");
  }
  async function pdf() {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 10 * 1024 * 1024) return setErr(`That file is ${(a.size / 1048576).toFixed(1)} MB. The limit is 10 MB. Try a smaller PDF or a photo of the page.`);
    await send(a.uri, a.name, a.mimeType ?? "application/pdf");
  }
  async function openOriginal(id: string) {
    try { const r = await call<{ url: string }>(sess, `/documents/${id}/file`); await Linking.openURL(r.url); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not open the file"); }
  }
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const l = Animated.loop(Animated.sequence([Animated.timing(wobble, { toValue: 1, duration: 1400, useNativeDriver: true }), Animated.timing(wobble, { toValue: 0, duration: 1400, useNativeDriver: true })]));
    l.start(); return () => l.stop();
  }, [wobble]);

  async function unlock() {
    setErr(null);
    try {
      if (Platform.OS !== "web") {
        const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
        if (!ok) { setErr("Set up a fingerprint, Face ID or screen lock in phone settings to open the vault."); return; }
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Open the family vault" });
        if (!r.success) return;
      }
      setUnlocking(true);
      Animated.timing(door, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setOpen(true));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not unlock"); }
  }

  async function add() {
    setBusy(true); setErr(null);
    try { await call(sess, `/families/${sess.familyId}/documents`, "POST", form); setForm({ title: "", category: "medical", text: "" }); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save the document"); } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <Screen>
        <View style={{ alignItems: "center", gap: 20, paddingTop: 30 }}>
          <View style={{ width: 230, height: 230, justifyContent: "center" }}>
            <View style={{ position: "absolute", inset: 0, borderRadius: 28, backgroundColor: "#2b1a0f" }} />
            <Animated.View style={{ width: 230, height: 230, transform: [{ perspective: 800 }, { translateX: -115 }, { rotateY: door.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-80deg"] }) }, { translateX: 115 }, { rotate: wobble.interpolate({ inputRange: [0, 1], outputRange: ["-1deg", "1deg"] }) }] }}>
              <LinearGradient colors={["#C99468", "#7A4D2F"]} style={{ flex: 1, borderRadius: 28, borderWidth: 5, borderColor: "#8a5a3a", alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 5, borderColor: c.marigold, backgroundColor: "#6a4128", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={unlocking ? "lock-open" : "lock-closed"} size={42} color={c.marigold} />
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: f.serif, fontSize: 28, color: c.ink }}>The family tijori</Text>
            <Txt variant="muted" style={{ textAlign: "center", marginTop: 4 }}>{data.docs.length} documents, encrypted and shared only with people you allow.</Txt>
          </View>
          <View style={{ width: "100%" }}><Btn label="Unlock with fingerprint / Face ID" disabled={unlocking} onPress={unlock} icon={<Ionicons name="finger-print" size={22} color="#2a1c00" />} /></View>
          <ErrorText>{err}</ErrorText>
        </View>
      </Screen>
    );
  }

  const docs = data.docs.filter((d) => !q || (d.title + d.text).toLowerCase().includes(q.toLowerCase()));
  const input = { borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: f.reg, fontSize: 15, color: c.ink, backgroundColor: c.inputBg } as const;
  return (
    <Screen onRefresh={refresh}>
      <Txt variant="title">Family vault</Txt>
      <View><Ionicons name="search" size={18} color={c.muted} style={{ position: "absolute", left: 16, top: 15, zIndex: 2 }} /><TextInput accessibilityLabel="Search documents" value={q} onChangeText={setQ} placeholder="Search 'insurance', 'HbA1c'…" placeholderTextColor={c.placeholder} style={[input, { borderRadius: 999, paddingLeft: 42 }]} /></View>
      <Card style={{ gap: 10 }}>
        <Txt variant="h2">Scan or upload a document</Txt>
        <Txt variant="muted">Photograph a prescription, bill or policy. Mitthu reads it, files it, and hides Aadhaar/PAN in the searchable text. The original is stored privately.</Txt>
        <Btn label={scanning ? "Reading your document…" : "Scan with camera"} disabled={scanning} onPress={camera} icon={<Ionicons name="camera" size={20} color="#2a1c00" />} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Btn label="Photos" kind="ghost" small disabled={scanning} onPress={gallery} icon={<Ionicons name="images" size={16} color={c.ink} />} /></View>
          <View style={{ flex: 1 }}><Btn label="PDF / file" kind="ghost" small disabled={scanning} onPress={pdf} icon={<Ionicons name="document" size={16} color={c.ink} />} /></View>
        </View>
        {!!scanMsg && <Text accessibilityRole="alert" style={{ fontFamily: f.bold, color: c.parrot }}>{scanMsg}</Text>}
        <Txt variant="muted" style={{ fontSize: 12 }}>Prototype: documents are read by Google Gemini. Use fake or sample documents only.</Txt>
      </Card>
      {docs.length === 0 && <Empty emoji="🗂️" title={q ? "Nothing matches" : "No documents yet"} hint={q ? "Try another word." : "Add a prescription, policy or bill below."} />}
      {docs.map((d) => (
        <Card key={d.id} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tealSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={ICON[d.category] ?? "document-text"} size={22} color={c.teal} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: f.bold, fontSize: 16, color: c.ink }}>{d.title}</Text>
            <Txt variant="kicker">{d.category}</Txt>
            {d.has_file && <Pressable accessibilityRole="button" onPress={() => openOriginal(d.id)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name="open-outline" size={14} color={c.teal} /><Text style={{ fontFamily: f.bold, fontSize: 12, color: c.teal }}>Open original</Text></Pressable>}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{Object.entries(d.extracted).map(([k, v]) => <Pill key={k} label={`${k.replace("_", " ")}: ${v}`} bg={c.marigoldSoft} fg={c.ink} />)}</View>
          </View>
        </Card>
      ))}
      <Card style={{ gap: 10 }}>
        <Txt variant="h2">Add a document</Txt>
        <TextInput accessibilityLabel="Title" placeholder="Title, e.g. Papa's ECG report" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} style={input} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CATS.map((k) => <Pressable key={k} onPress={() => setForm({ ...form, category: k })} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: form.category === k ? c.teal : c.tealSoft }}><Text style={{ fontFamily: f.semi, fontSize: 13, color: form.category === k ? "#fff" : c.teal }}>{k}</Text></Pressable>)}
        </View>
        <TextInput accessibilityLabel="Document text" multiline numberOfLines={4} placeholder="Paste the text. Mitthu reads dates, amounts, BP and policy numbers, and hides Aadhaar/PAN." placeholderTextColor={c.placeholder} value={form.text} onChangeText={(v) => setForm({ ...form, text: v })} style={[input, { minHeight: 96, textAlignVertical: "top" }]} />
        <Btn label={busy ? "Reading…" : "Save to vault"} kind="teal" disabled={busy || !form.title.trim()} onPress={add} />
        <ErrorText>{err}</ErrorText>
      </Card>
    </Screen>
  );
}
