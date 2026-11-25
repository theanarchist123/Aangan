import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { call } from "../api";
import { Mitthu } from "../components/Mitthu";
import { c, f } from "../theme";
import { Btn, Card, ErrorText, inputStyle, Txt } from "../ui";

/** Shown after sign-in when the account has no family yet. */
export function FamilySetup({ userName, onDone, onSignOut }: { userName?: string; onDone: (familyId: string) => void; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"welcome" | "form">("welcome");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", sponsor_name: userName && !userName.includes("@") ? userName : "", sponsor_city: "" });
  const input = inputStyle();

  async function run(path: string, body?: unknown) {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ id?: string; family_id?: string }>(null, path, "POST", body);
      onDone((r.id ?? r.family_id)!);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); setBusy(false); }
  }

  const first = (userName ?? "").split(/[ @]/)[0];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ivory }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, alignItems: "center", justifyContent: "center", gap: 18 }}>
        <Mitthu size={120} mood={busy ? "thinking" : "celebrate"} />
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: f.serif, fontSize: 32, color: c.teal, textAlign: "center" }}>Welcome{first ? `, ${first}` : ""}</Text>
          <Txt style={{ fontSize: 17, textAlign: "center" }}>Let&apos;s set up your family&apos;s courtyard.</Txt>
        </View>
        {step === "welcome" ? (
          <View style={{ width: "100%", gap: 12 }}>
            <Btn label="Set up my family" onPress={() => setStep("form")} />
            <Btn label={busy ? "Opening the courtyard…" : "Explore the Sharma family demo"} kind="ghost" disabled={busy} onPress={() => run("/demo/seed")} />
            <Pressable accessibilityRole="button" onPress={onSignOut} style={{ alignItems: "center", padding: 10 }}><Text style={{ fontFamily: f.bold, color: c.muted, textDecorationLine: "underline" }}>Sign out</Text></Pressable>
          </View>
        ) : (
          <Card style={{ width: "100%", gap: 10 }}>
            <Txt variant="h2">Who are we looking after?</Txt>
            <TextInput accessibilityLabel="Family name" placeholder="The Sharma Family" placeholderTextColor={c.placeholder} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} style={input} />
            <TextInput accessibilityLabel="Your name" placeholder="Your name" placeholderTextColor={c.placeholder} value={form.sponsor_name} onChangeText={(v) => setForm({ ...form, sponsor_name: v })} style={input} />
            <TextInput accessibilityLabel="Your city" placeholder="Where do you live? e.g. Seattle" placeholderTextColor={c.placeholder} value={form.sponsor_city} onChangeText={(v) => setForm({ ...form, sponsor_city: v })} style={input} />
            <Btn label={busy ? "Creating…" : "Create our courtyard"} disabled={busy || !form.name.trim() || !form.sponsor_name.trim()} onPress={() => run("/families", { ...form, sponsor_timezone: "America/Los_Angeles" })} />
            <Btn label="Back" kind="ghost" small onPress={() => setStep("welcome")} />
          </Card>
        )}
        <ErrorText>{err}</ErrorText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
