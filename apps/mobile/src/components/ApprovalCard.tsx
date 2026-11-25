import { useRef, useState } from "react";
import { Alert, Animated, PanResponder, Platform, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { call, type Approval, type Session } from "../api";
import { c, f } from "../theme";
import { Btn, Card, ErrorText, Txt } from "../ui";

const KNOB = 56;

/** Slide to approve, then confirm with the phone's real biometric. Nothing is paid or booked before this. */
export function ApprovalCard({ a, sess, onDone }: { a: Approval; sess: Session; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [track, setTrack] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const max = Math.max(0, track - KNOB - 8);
  const maxRef = useRef(0); maxRef.current = max;
  const busyRef = useRef(false); busyRef.current = busy;
  const approveRef = useRef<() => void>(() => {});

  async function approve() {
    setBusy(true); setErr(null);
    try {
      if (Platform.OS !== "web") {
        const has = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!has || !enrolled) {
          Alert.alert("Set up biometrics", "Turn on a fingerprint, Face ID or screen lock in your phone settings to approve actions.");
          return;
        }
        const auth = await LocalAuthentication.authenticateAsync({ promptMessage: `Approve: ${a.action}`, cancelLabel: "Cancel" });
        if (!auth.success) return; // cancelled or failed: nothing is approved
      }
      await call(sess, `/approvals/${a.id}/decision`, "POST", { approve: true });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not approve"); }
    finally { setBusy(false); Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(); }
  }
  approveRef.current = approve;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !busyRef.current,
    onMoveShouldSetPanResponder: () => !busyRef.current,
    onPanResponderMove: (_, g) => x.setValue(Math.min(maxRef.current, Math.max(0, g.dx))),
    onPanResponderRelease: (_, g) => {
      if (g.dx > maxRef.current * 0.8 && maxRef.current > 0) { x.setValue(maxRef.current); approveRef.current(); }
      else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
    },
  })).current;

  async function decline() {
    setBusy(true);
    try { await call(sess, `/approvals/${a.id}/decision`, "POST", { approve: false }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not decline"); } finally { setBusy(false); }
  }

  return (
    <Card style={{ borderColor: c.marigold, borderWidth: 2 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Ionicons name="shield-checkmark" size={26} color={c.teal} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Txt variant="kicker">Needs your approval</Txt>
          <Txt variant="h2" style={{ marginTop: 2 }}>{a.action}</Txt>
          {a.amount_inr > 0 && <Text style={{ fontFamily: f.xbold, fontSize: 32, color: c.teal, marginTop: 2 }}>₹{a.amount_inr.toLocaleString("en-IN")}</Text>}
          <Txt variant="muted" style={{ marginTop: 4 }}>Why you&apos;re asked: {a.reason}.</Txt>
          <Txt variant="muted">If you decline, nothing is paid or booked for this step.</Txt>
        </View>
      </View>

      <View onLayout={(e) => setTrack(e.nativeEvent.layout.width)} style={{ marginTop: 16, height: KNOB + 8, borderRadius: 999, backgroundColor: c.tealSoft, justifyContent: "center" }}>
        <Animated.View style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: "rgba(244,163,0,0.35)", width: Animated.add(x, KNOB + 8) }} />
        <Text style={{ position: "absolute", width: "100%", textAlign: "center", fontFamily: f.bold, color: c.teal }}>{busy ? "Checking…" : "Slide to approve  →"}</Text>
        <Animated.View {...pan.panHandlers} accessible accessibilityRole="button" accessibilityLabel="Slide to approve"
          accessibilityActions={[{ name: "activate" }]} onAccessibilityAction={() => approve()}
          style={{ marginLeft: 4, width: KNOB, height: KNOB, borderRadius: 28, backgroundColor: c.marigold, alignItems: "center", justifyContent: "center", transform: [{ translateX: x }], shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }}>
          <Text style={{ fontSize: 26 }}>🦜</Text>
        </Animated.View>
      </View>
      <View style={{ alignItems: "center", marginTop: 10 }}><Btn label="Decline" kind="ghost" small onPress={decline} disabled={busy} /></View>
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
