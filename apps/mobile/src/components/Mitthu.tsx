import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

export type Mood = "idle" | "thinking" | "listening" | "celebrate" | "sleeping";
const CONFETTI = ["#F4A300", "#C8553D", "#3FA34D", "#0E5E6F", "#F4A300", "#C8553D"];

/** Mitthu the parrot. Bobs while idle, tilts when thinking, hops with confetti when celebrating. */
export function Mitthu({ mood = "idle", size = 110 }: { mood?: Mood; size?: number }) {
  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);
  const asleep = mood === "sleeping";

  useEffect(() => {
    const amp = mood === "celebrate" ? -size * 0.2 : asleep ? -1 : -4;
    const dur = mood === "celebrate" ? 380 : asleep ? 1600 : 1200;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: amp, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mood, size, asleep, bob]);

  useEffect(() => {
    tilt.setValue(0);
    if (mood !== "thinking" && mood !== "listening") return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(tilt, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(tilt, { toValue: -1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mood, tilt]);

  useEffect(() => {
    pop.setValue(0);
    if (mood !== "celebrate") return;
    const loop = Animated.loop(Animated.timing(pop, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [mood, pop]);

  useEffect(() => {
    if (asleep) return;
    const t = setInterval(() => { setBlink(true); setTimeout(() => setBlink(false), 140); }, 3600);
    return () => clearInterval(t);
  }, [asleep]);

  const rotate = tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-6deg", "6deg"] });
  const h = size * 1.15;

  return (
    <View style={{ width: size, height: h }} accessible accessibilityRole="image" accessibilityLabel={`Mitthu the parrot, ${mood}`}>
      <Animated.View style={{ transform: [{ translateY: bob }, { rotate }] }}>
        <Svg width={size} height={h} viewBox="0 0 200 230">
          <Rect x="30" y="205" width="140" height="9" rx="4.5" fill="#8a5a3a" />
          <Path d="M86 170 Q70 215 80 228 Q96 214 100 176Z" fill="#0E5E6F" />
          <Path d="M100 172 Q104 220 118 228 Q124 205 112 170Z" fill="#3FA34D" />
          <Ellipse cx="100" cy="128" rx="48" ry="62" fill="#3FA34D" />
          <Ellipse cx="104" cy="144" rx="29" ry="42" fill="#9ADBA5" />
          <Path d="M60 108 Q44 150 68 184 Q90 160 84 112Z" fill="#2E8A3E" />
          <Path d="M66 168 Q70 182 68 184 Q82 172 80 160Z" fill="#0E5E6F" />
          <Path d="M86 188 v17 M96 188 v17 M108 188 v17 M118 188 v17" stroke="#E8A33D" strokeWidth="4" strokeLinecap="round" />
          <Path d="M92 36 Q86 18 96 10 Q98 26 102 36Z" fill="#F4A300" />
          <Path d="M102 34 Q104 14 116 12 Q112 28 110 38Z" fill="#C8553D" />
          <Circle cx="100" cy="74" r="40" fill="#3FA34D" />
          <Circle cx="82" cy="86" r="9" fill="#F4A300" opacity={0.55} />
          {asleep || blink ? (
            <Path d="M104 66 q8 6 16 0" stroke="#1F2A2E" strokeWidth="3" fill="none" strokeLinecap="round" />
          ) : (
            <G>
              <Circle cx="112" cy="66" r="10" fill="#fff" />
              <Circle cx="115" cy="67" r="5" fill="#1F2A2E" />
              <Circle cx="116.8" cy="65" r="1.6" fill="#fff" />
            </G>
          )}
          <Path d="M120 74 Q154 76 146 100 Q132 96 122 86Z" fill="#E8472B" />
          <Path d="M122 86 Q134 92 146 100 Q134 100 124 92Z" fill="#B8341D" />
        </Svg>
      </Animated.View>

      {mood === "thinking" && (
        <View style={{ position: "absolute", right: -4, top: 0 }}><Text style={{ fontSize: size * 0.18, color: "#0E5E6F" }}>•••</Text></View>
      )}
      {asleep && <Text style={{ position: "absolute", right: 0, top: 0, fontSize: size * 0.2, color: "#0E5E6F" }}>z Z</Text>}
      {mood === "celebrate" && CONFETTI.map((col, i) => {
        const dx = (i - 2.5) * (size * 0.22);
        return (
          <Animated.View key={i} style={{
            position: "absolute", left: size * 0.45, top: size * 0.3, width: 8, height: 8, borderRadius: 4, backgroundColor: col,
            opacity: pop.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [{ translateX: pop.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
              { translateY: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -size * (0.4 + (i % 3) * 0.1), size * 0.3] }) }],
          }} />
        );
      })}
    </View>
  );
}
