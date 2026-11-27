import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Fraunces_500Medium, Fraunces_500Medium_Italic, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif";
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
import { Pager, TabBar } from "./src/components/Tabs";
import { AppCtx, Btn, Txt, type Tab } from "./src/ui";
import { useFamily } from "./src/useFamily";

function Main({ sess, onSignOut }: { sess: Session; onSignOut: () => void }) {
  const { data, loading, error, gone, refresh } = useFamily(sess);
  const [tab, setTab] = useState<Tab>("home");
  const [senior, setSenior] = useState(false);
  const [sos, setSos] = useState<{ person?: Person; fail: boolean } | null>(null);

  useEffect(() => { if (gone) { void forgetFamily(); onSignOut(); } }, [gone, onSignOut]);

  const ctx = useMemo(() => ({
    openSos: (personId?: string, fail = false) => setSos({ person: data.people.find((p) => p.id === personId), fail }),
    senior: () => setSenior(true),
    go: (t: Tab) => setTab(t),
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
            <Pager tab={tab} render={(t, active) => {
              if (t === "home") return <Home sess={sess} data={data} refresh={refresh} />;
              if (t === "tasks") return <Tasks sess={sess} data={data} refresh={refresh} />;
              if (t === "vault") return <Vault sess={sess} data={data} refresh={refresh} active={active} />;
              if (t === "family") return <Family sess={sess} data={data} refresh={refresh} />;
              return <Safety sess={sess} data={data} refresh={refresh} onSignOut={onSignOut} />;
            }} />
            <TabBar tab={tab} setTab={setTab} onSos={() => ctx.openSos(data.people.find((p) => p.role === "parent")?.id)} pending={pending} />
          </>
        )}
        {sos && <SosOverlay sess={sess} person={sos.person} simulateFailure={sos.fail} contacts={contacts} onClose={() => { setSos(null); void refresh(); }} />}
      </View>
    </AppCtx.Provider>
  );
}

type Phase = "boot" | "welcome" | "auth" | "loading" | "setup" | "main" | "error";

function Root() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium, Fraunces_500Medium_Italic, Fraunces_700Bold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
    InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  });
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
