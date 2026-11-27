import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

export type Mood = "idle" | "thinking" | "listening" | "celebrate" | "sleeping" | "alert";
const CONFETTI = ["#FFC861", "#FF7E9D", "#63D15B", "#6C8CFF", "#FF7A5C", "#FFD25C", "#1FA9A0", "#B28CFF"];
const VB = "0 -4 200 240";
const sine = Easing.inOut(Easing.sin);
const to = (v: Animated.Value, toValue: number, duration: number, easing = sine) =>
  Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });
const useVal = (n = 0) => useRef(new Animated.Value(n)).current;

/** One full-size layer of the bird. Each moves on its own around its own pivot (all on the native thread). */
function Layer({ w, h, origin, transform, children }: { w: number; h: number; origin?: string; transform?: object[]; children: ReactNode }) {
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: w, height: h }, origin ? { transformOrigin: origin } : null, transform ? { transform: transform as never } : null]}>
      {children}
    </Animated.View>
  );
}

const Wing = ({ fill }: { fill: string }) => (
  <>
    <Path d="M55,118 C34,132 30,163 47,181 C54,176 56,172 56,167 C61,172 64,172 66,168 C74,152 72,130 55,118Z" fill={fill} />
    <Path d="M46,148 q8,8 17,4 M45,162 q7,6 14,3" stroke="#7BD97A" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.7} />
  </>
);
const Eye = ({ x }: { x: number }) => (
  <>
    <Circle cx={x} cy={73} r={18.5} fill="#F7A13D" />
    <Circle cx={x} cy={73} r={16} fill="#fff" />
  </>
);
const Pupil = ({ x, r }: { x: number; r: number }) => (
  <>
    <Circle cx={x} cy={75} r={r} fill="#14211F" />
    <Circle cx={x + 4} cy={70} r={4.4} fill="#fff" />
    <Circle cx={x - 4} cy={80} r={2} fill="#fff" />
  </>
);

/** Mitthu, a rose-ringed parakeet. Breathes, blinks, glances around, sways his tail and reacts to what's happening. */
export function Mitthu({ mood = "idle", size = 110 }: { mood?: Mood; size?: number }) {
  const w = size, h = size * 1.2;
  const u = size / 200; // one drawing unit in pixels
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const breathe = useVal(), tail = useVal(), tilt = useVal(), flap = useVal(), jump = useVal(), blink = useVal(1), look = useVal(), pop = useVal(), fx = useVal(), shake = useVal();
  const [side, setSide] = useState(1);
  const asleep = mood === "sleeping", happy = mood === "celebrate";

  useEffect(() => {
    const d = asleep ? 2200 : 1400;
    const a = Animated.loop(Animated.sequence([to(breathe, 1, d), to(breathe, 0, d)]));
    const b = Animated.loop(Animated.sequence([to(tail, 1, asleep ? 3000 : 1100), to(tail, -1, asleep ? 3000 : 1100)]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [asleep, breathe, tail]);

  // idle life: single or double blinks, curious head tilts and the odd wing flutter, at uneven intervals
  useEffect(() => {
    if (asleep || happy) return;
    let alive = true;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const doBlink = () => {
      const one = () => [to(blink, 0.08, 70, Easing.linear), to(blink, 1, 110, Easing.linear)];
      Animated.sequence([...one(), ...(Math.random() > 0.65 ? one() : [])]).start();
      if (alive) t1 = setTimeout(doBlink, 2200 + Math.random() * 2600);
    };
    const curious = () => {
      if (mood === "idle") {
        setSide(Math.random() > 0.5 ? 1 : -1);
        Animated.sequence([
          Animated.spring(tilt, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
          Animated.delay(900),
          Animated.spring(tilt, { toValue: 0, friction: 6, tension: 50, useNativeDriver: true }),
        ]).start();
        if (Math.random() > 0.55) Animated.sequence([to(flap, 0.7, 140), to(flap, 0, 140), to(flap, 0.5, 130), to(flap, 0, 180)]).start();
      }
      if (alive) t2 = setTimeout(curious, 3800 + Math.random() * 3200);
    };
    t1 = setTimeout(doBlink, 1200); t2 = setTimeout(curious, 2400);
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); };
  }, [asleep, happy, mood, blink, tilt, flap]);

  useEffect(() => {
    [tilt, flap, jump, pop, fx, shake, look].forEach((v) => v.setValue(0));
    blink.setValue(1);
    const loops: Animated.CompositeAnimation[] = [];
    if (happy) {
      loops.push(Animated.loop(Animated.sequence([
        to(jump, -0.18, 140, Easing.out(Easing.quad)),   // crouch
        to(jump, 1, 300, Easing.out(Easing.cubic)),      // leap
        to(jump, 0, 260, Easing.in(Easing.quad)),        // fall
        to(jump, -0.12, 90), to(jump, 0, 160), Animated.delay(260),
      ])));
      loops.push(Animated.loop(Animated.sequence([to(flap, 1, 130), to(flap, 0.1, 130)])));
      loops.push(Animated.loop(to(pop, 1, 1500, Easing.out(Easing.quad))));
    }
    if (mood === "thinking") {
      Animated.parallel([Animated.spring(tilt, { toValue: 1, friction: 6, useNativeDriver: true }), to(look, 1, 300)]).start();
      loops.push(Animated.loop(to(fx, 1, 1500, Easing.linear)));
    }
    if (mood === "listening") {
      Animated.spring(tilt, { toValue: -1, friction: 6, useNativeDriver: true }).start();
      loops.push(Animated.loop(to(fx, 1, 1400, Easing.out(Easing.quad))));
    }
    if (asleep) {
      Animated.spring(tilt, { toValue: 0.8, friction: 8, useNativeDriver: true }).start();
      loops.push(Animated.loop(to(fx, 1, 2800, Easing.linear)));
    }
    if (mood === "alert") {
      loops.push(Animated.loop(Animated.sequence([to(shake, 1, 60), to(shake, -1, 90), to(shake, 1, 90), to(shake, 0, 60), Animated.delay(700)])));
      loops.push(Animated.loop(Animated.sequence([to(flap, 0.8, 120), to(flap, 0, 160), Animated.delay(640)])));
    }
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [mood, happy, asleep, tilt, flap, jump, pop, fx, shake, look, blink]);

  const body = [
    { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-4 * u, 4 * u] }) },
    { translateY: jump.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, -46 * u] }) },
    { scaleX: jump.interpolate({ inputRange: [-0.2, 0, 1], outputRange: [1.08, 1, 0.95] }) },
    { scaleY: jump.interpolate({ inputRange: [-0.2, 0, 1], outputRange: [0.9, 1, 1.06] }) },
  ];
  const head = [
    { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, (asleep ? 4 : 2.4) * u] }) },
    { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: [`${-9 * side}deg`, `${9 * side}deg`] }) },
  ];
  const grad = (n: string) => `url(#${n}${uid})`;
  const art = (children: ReactNode) => <Svg width={w} height={h} viewBox={VB}>{children}</Svg>;
  const pupil = mood === "alert" ? 8.5 : 11.5;

  return (
    <View style={{ width: w, height: h }} accessible accessibilityRole="image" accessibilityLabel={`Mitthu the parrot, ${mood}`}>
      {/* soft ground shadow that shrinks as he jumps */}
      <Animated.View style={{ position: "absolute", left: w * 0.26, width: w * 0.48, bottom: 0, height: 9 * u + 1, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.14)", transform: [{ scaleX: jump.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55], extrapolateLeft: "clamp" }) }] }} />
      <Animated.View style={{ width: w, height: h, transformOrigin: "50% 84%", transform: body as never }}>
        <Layer w={w} h={h} origin="48% 71%" transform={[{ rotate: tail.interpolate({ inputRange: [-1, 1], outputRange: ["-6deg", "6deg"] }) }]}>
          {art(<>
            <Path d="M96,168 C82,196 62,214 38,224 C48,200 60,178 76,160Z" fill="#12806A" />
            <Path d="M112,172 C108,196 96,216 78,230 C80,206 84,188 92,168Z" fill="#1FA9A0" />
            <Path d="M38,224 C46,216 52,208 56,202 C52,212 46,220 38,224Z" fill="#FFD25C" />
          </>)}
        </Layer>
        <Layer w={w} h={h} origin="50% 82%" transform={[{ scaleY: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }, { scaleX: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 0.99] }) }]}>
          {art(<>
            <Defs><LinearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#63D15B" /><Stop offset="1" stopColor="#27945A" /></LinearGradient></Defs>
            <Path d="M83,190 v7 l-7,4 M83,197 v5 M83,197 l7,4 M117,190 v7 l-7,4 M117,197 v5 M117,197 l7,4" stroke="#F2894E" strokeWidth={4.5} strokeLinecap="round" fill="none" />
            <Path d="M100,88 C146,88 162,128 156,152 C149,181 127,192 100,192 C73,192 51,181 44,152 C38,128 54,88 100,88Z" fill={grad("b")} />
            <Path d="M100,124 C122,124 134,142 132,158 C129,178 116,187 100,187 C84,187 71,178 68,158 C66,142 78,124 100,124Z" fill="#CDF08F" />
            <Path d="M86,150 q7,7 14,0 q7,7 14,0 M93,166 q7,7 14,0" stroke="#8FCB5E" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          </>)}
        </Layer>
        {([-1, 1] as const).map((s) => (
          <Layer key={s} w={w} h={h} origin={s === -1 ? "29% 51%" : "71% 51%"} transform={[{ rotate: flap.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${-s * 62}deg`] }) }]}>
            {art(<>
              <Defs><LinearGradient id={`w${uid}${s}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#2FA557" /><Stop offset="1" stopColor="#13785F" /></LinearGradient></Defs>
              <G transform={s === 1 ? "translate(200 0) scale(-1 1)" : undefined}><Wing fill={`url(#w${uid}${s})`} /></G>
            </>)}
          </Layer>
        ))}

        <Layer w={w} h={h} origin="50% 56%" transform={head}>
          <Layer w={w} h={h}>
            {art(<>
              <Defs><RadialGradient id={`h${uid}`} cx="0.4" cy="0.32" r="0.75"><Stop offset="0" stopColor="#8BE56C" /><Stop offset="1" stopColor="#3DB152" /></RadialGradient></Defs>
              <Path d="M96,26 C86,18 84,6 92,2 C93,12 100,16 104,24Z" fill="#2FA557" />
              <Path d="M102,25 C102,10 114,2 124,6 C115,10 112,18 110,28Z" fill="#63D15B" />
              <Path d="M92,28 C80,26 72,18 74,10 C80,18 90,20 98,25Z" fill="#7FE068" />
              <Ellipse cx={100} cy={76} rx={60} ry={55} fill={grad("h")} />
              <Path d="M52,106 C64,126 84,132 100,132 C116,132 136,126 148,106 C142,130 122,139 100,139 C78,139 58,130 52,106Z" fill="#FF7E9D" />
              <Ellipse cx={55} cy={96} rx={10} ry={7} fill="#FF8FA3" opacity={0.6} />
              <Ellipse cx={145} cy={96} rx={10} ry={7} fill="#FF8FA3" opacity={0.6} />
            </>)}
          </Layer>
          {asleep || happy ? (
            <Layer w={w} h={h}>
              {art(<Path d={happy ? "M60,77 Q74,60 88,77 M112,77 Q126,60 140,77" : "M61,72 Q74,84 87,72 M113,72 Q126,84 139,72"} stroke="#14211F" strokeWidth={5.5} fill="none" strokeLinecap="round" />)}
            </Layer>
          ) : (
            <Layer w={w} h={h} origin="50% 32%" transform={[{ scaleY: blink }]}>
              <Layer w={w} h={h}>{art(<><Eye x={74} /><Eye x={126} /></>)}</Layer>
              <Layer w={w} h={h} transform={[
                { translateX: look.interpolate({ inputRange: [0, 1], outputRange: [0, 3.5 * u] }) },
                { translateY: look.interpolate({ inputRange: [0, 1], outputRange: [0, -5 * u] }) },
              ]}>{art(<><Pupil x={76} r={pupil} /><Pupil x={124} r={pupil} /></>)}</Layer>
            </Layer>
          )}
          <Layer w={w} h={h}>
            {art(<>
              <Defs><LinearGradient id={`k${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FF7A5C" /><Stop offset="1" stopColor="#E0342F" /></LinearGradient></Defs>
              {(happy || mood === "alert" || mood === "listening") && <Path d="M92,106 C93,120 99,124 103,122 C108,120 110,113 110,106Z" fill="#7A1C24" />}
              <Path d="M84,89 C84,78 92,75 100,75 C108,75 116,78 116,89 C116,100 109,108 100,117 C99,110 96,106 91,103 C86,100 84,95 84,89Z" fill={grad("k")} />
              <Path d="M90,85 C92,80 98,79 103,80" stroke="#FFD0B8" strokeWidth={3.4} fill="none" strokeLinecap="round" />
              {mood === "alert" && <Path d="M56,48 L88,57 M144,48 L112,57" stroke="#14543A" strokeWidth={5} strokeLinecap="round" />}
            </>)}
          </Layer>
        </Layer>
      </Animated.View>

      {mood === "thinking" && [0, 1, 2].map((i) => (
        <Animated.View key={i} style={{ position: "absolute", right: w * (0.14 - i * 0.09), top: h * (0.12 - i * 0.065), width: 4 + (i + 1) * 3 * Math.max(0.6, u * 1.4), height: 4 + (i + 1) * 3 * Math.max(0.6, u * 1.4), borderRadius: 99, backgroundColor: "#FFC861", opacity: fx.interpolate({ inputRange: [0, 0.1 + i * 0.22, 0.3 + i * 0.22, 0.55 + i * 0.22, 1], outputRange: [0.25, 0.25, 1, 0.25, 0.25] }) }} />
      ))}
      {mood === "listening" && [0, 1].map((i) => (
        <Animated.View key={i} style={{ pointerEvents: "none", position: "absolute", left: w * 0.1, top: h * 0.08, width: w * 0.8, height: w * 0.8, borderRadius: 999, borderWidth: 2, borderColor: "#FF7E9D", opacity: fx.interpolate({ inputRange: [0, 1], outputRange: [0.8 - i * 0.3, 0] }), transform: [{ scale: fx.interpolate({ inputRange: [0, 1], outputRange: [0.8 + i * 0.1, 1.35 + i * 0.1] }) }] }} />
      ))}
      {asleep && [0, 1, 2].map((i) => (
        <Animated.Text key={i} style={{ position: "absolute", right: w * (0.1 - i * 0.08), top: h * (0.2 - i * 0.09), fontSize: size * (0.1 + i * 0.03), fontWeight: "800", color: "#7FA8FF", opacity: fx.interpolate({ inputRange: [0, 0.1 + i * 0.2, 0.35 + i * 0.2, 0.6 + i * 0.2, 1], outputRange: [0, 0, 1, 0, 0] }), transform: [{ translateY: fx.interpolate({ inputRange: [0, 1], outputRange: [6, -10] }) }] }}>z</Animated.Text>
      ))}
      {mood === "alert" && <View style={{ position: "absolute", right: 0, top: h * 0.06, width: size * 0.2, height: size * 0.2, borderRadius: 99, backgroundColor: "#EF476F", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: size * 0.13 }}>!</Text></View>}
      {happy && CONFETTI.map((col, i) => {
        const ang = (i / CONFETTI.length) * Math.PI * 2;
        return (
          <Animated.View key={col} style={{
            pointerEvents: "none", position: "absolute", left: w * 0.48, top: h * 0.36, width: 5 + (i % 3) * 2, height: 9 + (i % 2) * 3, borderRadius: 3, backgroundColor: col,
            opacity: pop.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: pop.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * w * 0.68] }) },
              { translateY: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, Math.sin(ang) * w * 0.52 - w * 0.14, Math.sin(ang) * w * 0.58 + w * 0.14] }) },
              { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${i % 2 ? 260 : -260}deg`] }) },
            ],
          }} />
        );
      })}
    </View>
  );
}
