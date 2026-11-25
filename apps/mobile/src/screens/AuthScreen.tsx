import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getServer, login, setServer, signup } from "../auth";
import { Mitthu } from "../components/Mitthu";
import { useTheme } from "../ThemeContext";
import { c, f } from "../theme";
import { Btn, Card, ErrorText, inputStyle, Txt } from "../ui";

export function AuthScreen({ initialMode = "in", onDone, onBack, notice }: { initialMode?: "in" | "up"; onDone: () => void; onBack?: () => void; notice?: string | null }) {
  const insets = useSafeAreaInsets();
  const { scheme, pref, setPref } = useTheme();
  const [mode, setMode] = useState<"in" | "up">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(notice ?? null);
  const [advanced, setAdvanced] = useState(false);
  const [server, setServerText] = useState(getServer());
  const input = inputStyle();

  async function submit() {
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Please enter a valid email address.");
    if (mode === "up" && password.length < 8) return setErr("Password must be at least 8 characters.");
    if (!password) return setErr("Please enter your password.");
    setBusy(true);
    try {
      await setServer(server);
      if (mode === "up") await signup(email.trim(), password, name.trim());
      else await login(email.trim(), password);
      onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Something went wrong";
      setErr(m);
      if (/reach the server/i.test(m)) setAdvanced(true); // show the server address box so the tester can fix it
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ivory }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 22, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24, justifyContent: "center", gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ padding: 8 }}><Ionicons name="chevron-back" size={26} color={c.ink} /></Pressable> : <View />}
          <Pressable accessibilityRole="button" accessibilityLabel={`Theme: ${pref}. Tap to change.`} onPress={() => setPref(pref === "system" ? "light" : pref === "light" ? "dark" : "system")} style={{ padding: 10, borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <Ionicons name={pref === "system" ? "phone-portrait-outline" : scheme === "dark" ? "moon" : "sunny"} size={20} color={c.ink} />
          </Pressable>
        </View>
        <View style={{ alignItems: "center" }}>
          <Mitthu size={96} mood={busy ? "thinking" : "idle"} />
          <Text style={{ fontFamily: f.serif, fontSize: 36, color: c.teal }}>Aangan</Text>
        </View>

        <Card style={{ gap: 10 }}>
          <Txt variant="title" style={{ fontSize: 24 }}>{mode === "in" ? "Welcome back" : "Create your account"}</Txt>
          <Txt variant="muted">{mode === "in" ? "Sign in to your family's courtyard." : "It takes a minute. Then we'll set up your family."}</Txt>
          {mode === "up" && <TextInput accessibilityLabel="Your name" placeholder="Your name" placeholderTextColor={c.placeholder} autoComplete="name" value={name} onChangeText={setName} style={input} />}
          <TextInput accessibilityLabel="Email" placeholder="Email" placeholderTextColor={c.placeholder} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={email} onChangeText={setEmail} style={input} />
          <View>
            <TextInput accessibilityLabel="Password" placeholder={mode === "up" ? "Password (8+ characters)" : "Password"} placeholderTextColor={c.placeholder} secureTextEntry={!show} autoCapitalize="none" autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChangeText={setPassword} onSubmitEditing={submit} returnKeyType="go" style={[input, { paddingRight: 50 }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"} onPress={() => setShow(!show)} style={{ position: "absolute", right: 6, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={show ? "eye-off" : "eye"} size={22} color={c.muted} />
            </Pressable>
          </View>
          <Btn label={busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"} disabled={busy} onPress={submit} />
          <ErrorText>{err}</ErrorText>
          <Pressable accessibilityRole="button" onPress={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ fontFamily: f.bold, color: c.teal, textDecorationLine: "underline" }}>{mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}</Text>
          </Pressable>
        </Card>

        <View>
          <Pressable accessibilityRole="button" onPress={() => setAdvanced(!advanced)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", padding: 6 }}>
            <Ionicons name="settings-outline" size={16} color={c.muted} /><Text style={{ fontFamily: f.semi, fontSize: 13, color: c.muted }}>Connection settings</Text>
          </Pressable>
          {advanced && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <Txt variant="kicker">Server address</Txt>
              <TextInput accessibilityLabel="Server address" value={server} onChangeText={setServerText} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[input, { fontSize: 14 }]} />
              <Txt variant="muted" style={{ fontSize: 12 }}>Only change this if the person who gave you the app says so. It looks like https://something.example.com</Txt>
            </View>
          )}
        </View>
        <Txt variant="muted" style={{ fontSize: 12, textAlign: "center" }}>Prototype. Use fake data only.</Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
