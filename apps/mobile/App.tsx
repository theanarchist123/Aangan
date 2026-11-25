import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, call, type MyFamily, type Person, type Session } from "./src/api";
import { forgetFamily, getServer, getUser, hasSeenWelcome, logout, markWelcomeSeen, onAuthChange, restore, savedFamily, saveFamily } from "./src/auth";
import { Mitthu } from "./src/components/Mitthu";
import { SosOverlay } from "./src/components/SosOverlay";
import { ConnectionBanner } from "./src/components/ConnectionBanner";
import { UpdateBanner } from "./src/components/UpdateBanner";
import { AuthScreen } from "./src/screens/AuthScreen";
import { Family } from "./src/screens/Family";
import { FamilySetup } from "./src/screens/FamilySetup";
import { Home } from "./src/screens/Home";
import { Safety } from "./src/screens/Safety";
import { Senior } from "./src/screens/Senior";
import { Tasks } from "./src/screens/Tasks";
import { Vault } from "./src/screens/Vault";
import { Welcome } from "./src/screens/Welcome";
import { ThemeProvider, useTheme } from "./src/ThemeContext";
import { c, f } from "./src/theme";
import { AppCtx, Btn, Txt } from "./src/ui";
import { useFamily } from "./src/useFamily";

type Tab = "home" | "tasks" | "vault" | "family" | "safety";
const TABS: { id: Tab; label: string; on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }[] = [
  { id: "home", label: "Home", on: "home", off: "home-outline" },
  { id: "tasks", label: "Tasks", on: "list-circle", off: "list-circle-outline" },
  { id: "vault", label: "Vault", on: "lock-closed", off: "lock-closed-outline" },
  { id: "family", label: "Family", on: "people", off: "people-outline" },
  { id: "safety", label: "Safety", on: "shield-checkmark", off: "shield-checkmark-outline" },
];

function TabBar({ tab, setTab, pending }: { tab: Tab; setTab: (t: Tab) => void; pending: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 6 }}>
      {TABS.map((t) => {
        const sel = tab === t.id;
        return (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={t.label} onPress={() => setTab(t.id)} style={{ flex: 1, alignItems: "center", paddingVertical: 6, gap: 2 }}>
            <View>
              <Ionicons name={sel ? t.on : t.off} size={25} color={sel ? c.teal : c.muted} />
              {t.id === "home" && pending > 0 && <View style={{ position: "absolute", right: -9, top: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.marigold, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ fontFamily: f.xbold, fontSize: 11, color: "#2a1c00" }}>{pending}</Text></View>}
            </View>
            <Text style={{ fontFamily: sel ? f.bold : f.semi, fontSize: 11, color: sel ? c.teal : c.muted }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Main({ sess, onSignOut }: { sess: Session; onSignOut: () => void }) {
  const { data, loading, error, gone, refresh } = useFamily(sess);
  const [tab, setTab] = useState<Tab>("home");
  const [senior, setSenior] = useState(false);
  const [sos, setSos] = useState<{ person?: Person; fail: boolean } | null>(null);

  useEffect(() => { if (gone) { void forgetFamily(); onSignOut(); } }, [gone, onSignOut]);

  const ctx = useMemo(() => ({
    openSos: (personId?: string, fail = false) => setSos({ person: data.people.find((p) => p.id === personId), fail }),
    senior: () => setSenior(true),
  }), [data.people]);

  const pending = data.approvals.filter((a) => a.status === "pending").length;
  const contacts = data.people.filter((p) => p.is_emergency_contact && p.role !== "sponsor");

  return (
    <AppCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: c.ivory }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}><Mitthu mood="thinking" size={100} /><Txt variant="muted">Opening the courtyard…</Txt></View>
        ) : error ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 }}>
            <Mitthu mood="sleeping" size={100} />
            <Text accessibilityRole="alert" style={{ fontFamily: f.bold, fontSize: 16, color: c.ink, textAlign: "center" }}>{error}</Text>
            <Btn label="Try again" onPress={() => void refresh()} />
            <Btn label="Sign out" kind="ghost" small onPress={onSignOut} />
          </View>
        ) : senior ? (
          <Senior sess={sess} data={data} onExit={() => setSenior(false)} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {tab === "home" && <Home sess={sess} data={data} refresh={refresh} />}
              {tab === "tasks" && <Tasks sess={sess} data={data} refresh={refresh} />}
              {tab === "vault" && <Vault sess={sess} data={data} refresh={refresh} />}
              {tab === "family" && <Family sess={sess} data={data} refresh={refresh} />}
              {tab === "safety" && <Safety sess={sess} data={data} refresh={refresh} onSignOut={onSignOut} />}
            </View>
            <TabBar tab={tab} setTab={setTab} pending={pending} />
          </>
        )}
        {sos && <SosOverlay sess={sess} person={sos.person} simulateFailure={sos.fail} contacts={contacts} onClose={() => { setSos(null); void refresh(); }} />}
      </View>
    </AppCtx.Provider>
  );
}

type Phase = "boot" | "welcome" | "auth" | "loading" | "setup" | "main" | "error";

function Root() {
  const [fontsLoaded] = useFonts({ Fraunces_700Bold, PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const { scheme } = useTheme();
  const [phase, setPhase] = useState<Phase>("boot");
  const [authMode, setAuthMode] = useState<"in" | "up">("in");
  const [sess, setSess] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootErr, setBootErr] = useState<string | null>(null);

  const loadFamilies = useCallback(async () => {
    setPhase("loading");
    try {
      const list = await call<MyFamily[]>(null, "/me/families");
      if (!list.length) { setSess(null); setPhase("setup"); return; }
      const saved = await savedFamily();
      const pick = list.find((x) => x.id === saved) ?? list[0];
      await saveFamily(pick.id);
      setSess({ api: getServer(), familyId: pick.id, role: pick.role });
      setPhase("main");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setNotice("Your session expired. Please sign in again."); setPhase("auth"); return; }
      setBootErr(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const s = await restore();
      if (s) { await loadFamilies(); return; }
      setPhase((await hasSeenWelcome()) ? "auth" : "welcome");
    })();
  }, [loadFamilies]);

  // Sign-outs from anywhere (including an expired session that can't be refreshed) return to the sign-in screen.
  useEffect(() => onAuthChange(() => { if (!getUser()) { setSess(null); setAuthMode("in"); setPhase((p) => (p === "welcome" ? p : "auth")); } }), []);

  const signOut = useCallback(() => { void logout(); setNotice(null); }, []);

  if (!fontsLoaded || phase === "boot" || phase === "loading") {
    return <View style={{ flex: 1, backgroundColor: c.ivory, alignItems: "center", justifyContent: "center", gap: 10 }}>{fontsLoaded ? <Mitthu mood="thinking" size={100} /> : <ActivityIndicator color={c.teal} size="large" />}</View>;
  }
  return (
    <>
      <StatusBar style={phase === "welcome" ? "dark" : scheme === "dark" ? "light" : "dark"} />
      <UpdateBanner />
      <ConnectionBanner />
      {phase === "welcome" && <Welcome onStart={() => { void markWelcomeSeen(); setAuthMode("up"); setPhase("auth"); }} onHaveAccount={() => { void markWelcomeSeen(); setAuthMode("in"); setPhase("auth"); }} />}
      {phase === "auth" && <AuthScreen key={authMode} initialMode={authMode} notice={notice} onBack={() => setPhase("welcome")} onDone={() => { setNotice(null); void loadFamilies(); }} />}
      {phase === "setup" && <FamilySetup userName={getUser()?.name || getUser()?.email} onSignOut={signOut} onDone={async (id) => { await saveFamily(id); await loadFamilies(); }} />}
      {phase === "main" && sess && <Main key={sess.familyId} sess={sess} onSignOut={signOut} />}
      {phase === "error" && (
        <View style={{ flex: 1, backgroundColor: c.ivory, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 }}>
          <Mitthu mood="sleeping" size={100} />
          <Text accessibilityRole="alert" style={{ fontFamily: f.bold, fontSize: 16, color: c.ink, textAlign: "center" }}>{bootErr}</Text>
          <Btn label="Try again" onPress={() => void loadFamilies()} />
          <Btn label="Sign out" kind="ghost" small onPress={signOut} />
        </View>
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
