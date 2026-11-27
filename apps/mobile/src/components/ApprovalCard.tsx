import { useRef, useState } from "react";
import { Alert, Animated, Platform, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { call, type Approval, type Session } from "../api";
import { c, f, isDark } from "../theme";
import { ErrorText, Tap, useLoop } from "../ui";
import { Mitthu } from "./Mitthu";

/**
 * Nothing is paid or booked before the phone's real biometric check passes.
 * Dusk shows it as a bright ticket; Sunlit shows it as a note from Mitthu with a rupee stamp.
 */
export function ApprovalCard({ a, sess, onDone }: { a: Approval; sess: Session; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stamp, setStamp] = useState<"APPROVED" | "DECLINED" | null>(null);
  const slam = useRef(new Animated.Value(0)).current;
  const finger = useLoop(1100, true);
  const dk = isDark();

  function stampThenDone(label: "APPROVED" | "DECLINED") {
    setStamp(label);
    Animated.spring(slam, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    setTimeout(onDone, 1000);
  }

  async function approve() {
    setBusy(true); setErr(null);
    try {
      if (Platform.OS !== "web") {
        const has = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!has || !enrolled) {
          Alert.alert("Set up biometrics", "Turn on a fingerprint, Face ID or screen lock in your phone settings to approve actions.");
          setBusy(false); return;
        }
        const auth = await LocalAuthentication.authenticateAsync({ promptMessage: `Approve: ${a.action}`, cancelLabel: "Cancel" });
        if (!auth.success) { setBusy(false); return; } // cancelled or failed: nothing is approved
      }
      await call(sess, `/approvals/${a.id}/decision`, "POST", { approve: true });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      stampThenDone("APPROVED");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not approve"); setBusy(false); }
  }
  async function decline() {
    setBusy(true); setErr(null);
    try { await call(sess, `/approvals/${a.id}/decision`, "POST", { approve: false }); stampThenDone("DECLINED"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not decline"); setBusy(false); }
  }

  const amount = a.amount_inr > 0 ? `₹${a.amount_inr.toLocaleString("en-IN")}` : null;
  const buttons = (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Tap accessibilityLabel={`Approve ${a.action} with fingerprint or Face ID`} disabled={busy} onPress={approve} wrap={{ flex: 1.5 }}
        style={{ height: 50, borderRadius: dk ? 15 : 999, backgroundColor: c.onPaper, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ opacity: finger.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }), transform: [{ scale: finger.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }] }}>
          <Ionicons name="finger-print" size={21} color={c.paper} />
        </Animated.View>
        <Text style={{ color: c.paper, fontFamily: f.xbold, fontSize: 15 }}>{busy && !stamp ? "Checking…" : dk ? "Approve" : "Yes, go ahead"}</Text>
      </Tap>
      <Tap accessibilityLabel={`Decline ${a.action}`} disabled={busy} onPress={decline} wrap={{ flex: 1 }}
        style={{ height: 50, borderRadius: dk ? 15 : 999, borderWidth: 1.5, borderColor: c.paperLine, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: c.onPaper, fontFamily: f.bold, fontSize: 14.5 }}>{dk ? "Decline" : "No, don't"}</Text>
      </Tap>
    </View>
  );

  return (
    <View style={{ backgroundColor: c.paper, borderRadius: 24, padding: 17, gap: 12, borderWidth: dk ? 0 : 1, borderColor: c.paperLine, marginTop: dk || !amount ? 0 : 8 }}>
      {dk ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: f.xbold, fontSize: 11, letterSpacing: 0.9, color: c.paperAccent }}>NEEDS YOUR OK</Text>
            <Text style={{ fontFamily: f.xbold, fontSize: 16.5, color: c.onPaper }}>{a.action}</Text>
          </View>
          {amount && <Text style={{ fontFamily: f.display, fontSize: 36, color: c.onPaper }}>{amount}</Text>}
        </View>
      ) : (
        <>
          {amount && (
            <View style={{ position: "absolute", right: 16, top: -13, transform: [{ rotate: "5deg" }], backgroundColor: c.paperAccent, borderRadius: 7, padding: 3 }}>
              <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: "#FFD9C9", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: f.serif, fontSize: 19, color: "#FFF6E6" }}>{amount}</Text>
              </View>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Mitthu size={46} mood={stamp === "APPROVED" ? "celebrate" : "idle"} />
            <Text style={{ flex: 1, paddingRight: amount ? 40 : 0, paddingTop: amount ? 14 : 4, fontFamily: f.italic, fontSize: 17.5, lineHeight: 24, color: c.onPaper }}>“{a.action}. May I go ahead?”</Text>
          </View>
        </>
      )}
      <Text style={{ fontFamily: f.reg, fontSize: 13, lineHeight: 18, color: c.paperMuted }}>Why you&apos;re asked: {a.reason}. If you decline, nothing is paid or booked for this step.</Text>
      {buttons}
      <ErrorText>{err}</ErrorText>
      {stamp && (
        <Animated.View style={{ pointerEvents: "none", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: slam, transform: [{ scale: slam.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] }) }, { rotate: "-9deg" }] }}>
          <View style={{ borderWidth: 4, borderColor: stamp === "APPROVED" ? "#1E7A4F" : "#B2452F", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 6, backgroundColor: c.paper }}>
            <Text style={{ fontFamily: f.xbold, fontSize: 30, letterSpacing: 2, color: stamp === "APPROVED" ? "#1E7A4F" : "#B2452F" }}>{stamp}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
