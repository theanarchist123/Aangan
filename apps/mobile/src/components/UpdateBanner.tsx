import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Modal, Pressable, Text, View } from "react-native";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getServer } from "../auth";
import { c, f } from "../theme";
import { Btn, Txt } from "../ui";

type Latest = { version_code: number; version_name: string; min_version_code: number; apk_url: string; notes: string };

/**
 * Two kinds of updates, both announced here:
 *  1. Over-the-air: new screens/logic/fixes download silently; one tap restarts into them (no reinstall).
 *  2. New APK: needed only when native code changes (new permission or library). The server announces it and we link to it.
 * Neither runs in Expo Go or the browser preview, only in an installed build.
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [latest, setLatest] = useState<Latest | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const checkOta = useCallback(async () => {
    if (!Updates.isEnabled) return;
    try {
      const r = await Updates.checkForUpdateAsync();
      if (r.isAvailable) await Updates.fetchUpdateAsync(); // download now; isUpdatePending flips when ready
    } catch { /* offline or no update channel: keep running the current version */ }
  }, []);

  const checkApk = useCallback(async () => {
    const mine = Number(Application.nativeBuildVersion);
    if (!mine) return; // web preview / Expo Go
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(`${getServer()}/v1/app/latest`, { signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) setLatest((await res.json()) as Latest);
    } catch { /* server asleep or offline: try again next time */ }
  }, []);

  useEffect(() => {
    void checkOta(); void checkApk();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { void checkOta(); void checkApk(); } });
    return () => sub.remove();
  }, [checkOta, checkApk]);

  const mine = Number(Application.nativeBuildVersion) || 0;
  const apkNewer = !!latest && !!latest.apk_url && latest.version_code > mine;
  const apkRequired = !!latest && !!latest.apk_url && mine > 0 && mine < latest.min_version_code;

  if (apkRequired) {
    return (
      <Modal animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: c.ivory, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 }}>
          <Text style={{ fontSize: 56 }}>🦜</Text>
          <Text style={{ fontFamily: f.serif, fontSize: 28, color: c.ink, textAlign: "center" }}>Please update Aangan</Text>
          <Txt style={{ textAlign: "center", fontSize: 16 }}>This version is too old to work with the server. Download version {latest!.version_name} and install it over this one. Your account and data are kept.</Txt>
          {!!latest!.notes && <Txt variant="muted" style={{ textAlign: "center" }}>{latest!.notes}</Txt>}
          <Btn label="Download update" onPress={() => Linking.openURL(latest!.apk_url)} icon={<Ionicons name="download" size={20} color="#2a1c00" />} />
        </View>
      </Modal>
    );
  }

  const showOta = isUpdatePending;
  const showApk = apkNewer && !dismissed && !showOta;
  if (!showOta && !showApk) return null;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, top: insets.top + 8, zIndex: 100 }}>
      <View accessibilityRole="alert" style={{ backgroundColor: c.teal, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 }}>
        <Ionicons name={showOta ? "sparkles" : "download"} size={24} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: f.bold, color: "#fff", fontSize: 15 }}>{showOta ? "A new version is ready" : `Version ${latest!.version_name} is available`}</Text>
          <Text style={{ fontFamily: f.reg, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{showOta ? "Restart to get the latest improvements." : (latest!.notes || "Download and install it over the current app.")}</Text>
        </View>
        {showOta ? (
          <Pressable accessibilityRole="button" disabled={restarting} onPress={() => { setRestarting(true); void Updates.reloadAsync(); }} style={{ backgroundColor: c.marigold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }}>
            <Text style={{ fontFamily: f.xbold, color: "#2a1c00" }}>{restarting ? "…" : "Restart"}</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => setDismissed(true)} style={{ paddingHorizontal: 8, paddingVertical: 9 }}><Text style={{ fontFamily: f.bold, color: "#fff" }}>Later</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => Linking.openURL(latest!.apk_url)} style={{ backgroundColor: c.marigold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }}><Text style={{ fontFamily: f.xbold, color: "#2a1c00" }}>Get it</Text></Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
