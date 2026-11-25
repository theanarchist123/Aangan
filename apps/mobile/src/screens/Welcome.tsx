import { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mitthu } from "../components/Mitthu";
import { f } from "../theme";

// The opening experience: always shown on a warm marigold-to-teal backdrop, so it uses fixed colours in both themes.
const INK = "#1F2A2E";

/** Each slide owns its fade-in, so it always starts from invisible and ends fully visible. */
function FadeIn({ children, dir }: { children: React.ReactNode; dir: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [a]);
  return (
    <Animated.View style={{ width: "100%", alignItems: "center", opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [28 * dir, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function Plane() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.timing(x, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    l.start(); return () => l.stop();
  }, [x]);
  return (
    <View style={{ width: "100%", height: 54 }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 26, borderTopWidth: 2, borderStyle: "dashed", borderColor: "rgba(31,42,46,0.35)" }} />
      <Animated.View style={{ position: "absolute", top: 4, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 250] }) }] }}>
        <Ionicons name="airplane" size={28} color="#0E5E6F" />
      </Animated.View>
      <Text style={{ position: "absolute", left: 0, bottom: -4, fontFamily: f.bold, fontSize: 12, color: INK }}>Seattle</Text>
      <Text style={{ position: "absolute", right: 0, bottom: -4, fontFamily: f.bold, fontSize: 12, color: INK }}>Pune</Text>
    </View>
  );
}

function StoryStep({ i, icon, title, body }: { i: number; icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 500, delay: 300 + i * 450, useNativeDriver: true }).start(); }, [a, i]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }], flexDirection: "row", gap: 12, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 18, padding: 12, alignItems: "center" }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#0E5E6F", alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={20} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: f.bold, fontSize: 14, color: "#0E5E6F" }}>{title}</Text>
        <Text style={{ fontFamily: f.reg, fontSize: 14, color: INK }}>{body}</Text>
      </View>
    </Animated.View>
  );
}

function SliderDemo() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.delay(600), Animated.timing(x, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.delay(700), Animated.timing(x, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]));
    l.start(); return () => l.stop();
  }, [x]);
  return (
    <View style={{ backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 24, padding: 16, width: "100%", gap: 6 }}>
      <Text style={{ fontFamily: f.xbold, fontSize: 11, letterSpacing: 0.8, color: "#5E6C70" }}>NEEDS YOUR APPROVAL</Text>
      <Text style={{ fontFamily: f.serif, fontSize: 18, color: INK }}>Pay hospital admission deposit</Text>
      <Text style={{ fontFamily: f.xbold, fontSize: 30, color: "#0E5E6F" }}>₹15,000</Text>
      <View style={{ height: 52, borderRadius: 26, backgroundColor: "#D9ECEF", justifyContent: "center", marginTop: 6 }}>
        <Text style={{ textAlign: "center", fontFamily: f.bold, color: "#0E5E6F" }}>Slide to approve  →</Text>
        <Animated.View style={{ position: "absolute", left: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: "#F4A300", alignItems: "center", justifyContent: "center", transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 215] }) }] }}>
          <Text style={{ fontSize: 22 }}>🦜</Text>
        </Animated.View>
      </View>
    </View>
  );
}

type Slide = { key: string; colors: [string, string]; render: () => React.ReactNode };

export function Welcome({ onStart, onHaveAccount }: { onStart: () => void; onHaveAccount: () => void }) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const dir = useRef(1);
  const pageRef = useRef(0);
  const countRef = useRef(4);
  pageRef.current = page;

  // One slide at a time: deterministic on every platform, with swipe or buttons to move.
  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(countRef.current - 1, i));
    if (next === pageRef.current) return;
    dir.current = next > pageRef.current ? 1 : -1;
    setPage(next);
  };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { if (g.dx < -50) goTo(pageRef.current + 1); else if (g.dx > 50) goTo(pageRef.current - 1); },
  })).current;

  const slides: Slide[] = [
    { key: "hero", colors: ["#FFE7B8", "#FFF8EE"], render: () => (
      <View style={{ alignItems: "center", gap: 14 }}>
        <Plane />
        <Mitthu mood="celebrate" size={170} />
        <Text style={{ fontFamily: f.serif, fontSize: 44, color: "#0E5E6F" }}>Aangan</Text>
        <Text style={{ fontFamily: f.serif, fontSize: 26, color: INK, textAlign: "center", lineHeight: 34 }}>Your family&apos;s courtyard, wherever you are.</Text>
        <Text style={{ fontFamily: f.reg, fontSize: 16, color: "#5E6C70", textAlign: "center" }}>AI that looks after your parents in India, while you stay in charge.</Text>
      </View>) },
    { key: "story", colors: ["#F6A96B", "#FFD9A0"], render: () => (
      <View style={{ gap: 10, width: "100%" }}>
        <Text style={{ fontFamily: f.serif, fontSize: 28, color: INK, lineHeight: 36, marginBottom: 6 }}>&ldquo;Papa feels chest pain in Pune.&rdquo;</Text>
        <StoryStep i={0} icon="alert-circle" title="10:42 PM, Seattle" body="One big button, or a Hindi voice note." />
        <StoryStep i={1} icon="medkit" title="3 seconds later" body="Mitthu starts the emergency plan." />
        <StoryStep i={2} icon="location" title="Right away" body="Nearest real hospitals, found for you." />
        <StoryStep i={3} icon="shield-checkmark" title="The ₹15,000 deposit" body="Over your limit, so it asks you first." />
        <StoryStep i={4} icon="people" title="If anything fails" body="A human desk and the neighbour are alerted." />
      </View>) },
    { key: "control", colors: ["#CFE9EE", "#FFF8EE"], render: () => (
      <View style={{ alignItems: "center", gap: 18, width: "100%" }}>
        <Text style={{ fontFamily: f.serif, fontSize: 30, color: INK, textAlign: "center", lineHeight: 38 }}>Nothing big happens without you.</Text>
        <SliderDemo />
        <Text style={{ fontFamily: f.reg, fontSize: 16, color: "#5E6C70", textAlign: "center" }}>You set the limit. Money, medical consent and sharing always ask first, confirmed with your fingerprint.</Text>
      </View>) },
    { key: "all", colors: ["#FFEEC7", "#D9ECEF"], render: () => (
      <View style={{ alignItems: "center", gap: 14, width: "100%" }}>
        <Text style={{ fontFamily: f.serif, fontSize: 30, color: INK, textAlign: "center", lineHeight: 38 }}>Made for every generation.</Text>
        {[{ i: "accessibility" as const, t: "Senior Mode", d: "Four huge buttons for your parents." }, { i: "logo-whatsapp" as const, t: "WhatsApp & voice", d: "In Hindi, Marathi, Tamil and more." }, { i: "albums" as const, t: "Maa's Day", d: "A daily story of how they're doing." }, { i: "lock-closed" as const, t: "The family tijori", d: "Documents, safe and searchable." }].map((x) => (
          <View key={x.t} style={{ flexDirection: "row", gap: 12, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 18, padding: 14, width: "100%", alignItems: "center" }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#0E5E6F", alignItems: "center", justifyContent: "center" }}><Ionicons name={x.i} size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}><Text style={{ fontFamily: f.bold, fontSize: 16, color: INK }}>{x.t}</Text><Text style={{ fontFamily: f.reg, fontSize: 14, color: "#5E6C70" }}>{x.d}</Text></View>
          </View>))}
      </View>) },
  ];

  countRef.current = slides.length;
  const last = page === slides.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: "#FFF8EE" }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <LinearGradient colors={slides[page].colors} style={{ flex: 1, paddingTop: insets.top + 56, paddingHorizontal: 24, paddingBottom: 190, justifyContent: "center", alignItems: "center" }}>
          <FadeIn key={slides[page].key} dir={dir.current}>
            {slides[page].render()}
          </FadeIn>
        </LinearGradient>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction" onPress={onHaveAccount} style={{ position: "absolute", right: 16, top: insets.top + 12, padding: 10 }}>
        <Text style={{ fontFamily: f.bold, color: "#0E5E6F", fontSize: 15 }}>Skip</Text>
      </Pressable>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 16, paddingHorizontal: 24, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }} accessibilityLabel={`Page ${page + 1} of ${slides.length}`}>
          {slides.map((s, i) => <View key={s.key} style={{ width: i === page ? 26 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? "#0E5E6F" : "rgba(14,94,111,0.25)" }} />)}
        </View>
        <Pressable accessibilityRole="button" onPress={() => (last ? onStart() : goTo(page + 1))}
          style={{ minHeight: 56, borderRadius: 28, backgroundColor: "#F4A300", alignItems: "center", justifyContent: "center", shadowColor: "#F4A300", shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
          <Text style={{ fontFamily: f.xbold, fontSize: 17, color: "#2a1c00" }}>{last ? "Get started" : "Next"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onHaveAccount} style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ fontFamily: f.bold, fontSize: 15, color: "#0E5E6F" }}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}
