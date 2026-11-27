// Two art directions, one token set.
//   dark  = "Courtyard at Dusk": plum night, marigold glow, Instrument Serif + Manrope.
//   light = "Sunlit Letters": ivory paper, terracotta ink, Fraunces + DM Sans.
// SOS red is for emergencies only.
export const light = {
  mode: "light" as "light" | "dark",
  ivory: "#FBF5EA", card: "#FFFDF8", line: "#EADFCB", ink: "#231B14", muted: "#74604C", inputBg: "#FFFDF8", placeholder: "#A8957D",
  teal: "#B2452F", tealDeep: "#7E2C1C", tealSoft: "#F5E2D3", onTeal: "#FFF6E6",
  marigold: "#E09A2B", marigoldSoft: "#FBEBCB",
  parrot: "#2F7A55", parrotSoft: "#DCEDDF", terracotta: "#B2452F", sos: "#C2283A", seniorSos: "#B00020",
  raised: "#FFFDF8", glow: "#F0C77A",
  paper: "#FFF6E6", onPaper: "#231B14", paperMuted: "#74604C", paperAccent: "#B2452F", paperLine: "#EBCF9E",
};
export type Palette = typeof light;

export const dark: Palette = {
  mode: "dark",
  ivory: "#16111E", card: "#241C2F", line: "#342A42", ink: "#F6EFE6", muted: "#B9AEC6", inputBg: "#1C1626", placeholder: "#857995",
  teal: "#FFC861", tealDeep: "#E5A83A", tealSoft: "#372B33", onTeal: "#1E1626",
  marigold: "#FFC861", marigoldSoft: "#3D2F22",
  parrot: "#7EE0B5", parrotSoft: "#1F3834", terracotta: "#FF9A86", sos: "#FF5C6C", seniorSos: "#B00020",
  raised: "#261E31", glow: "#FFAA40",
  paper: "#FFF4E2", onPaper: "#2A1A08", paperMuted: "#6B5440", paperAccent: "#A4531B", paperLine: "#D9C4A6",
};

const fontsLight = {
  display: "Fraunces_500Medium", italic: "Fraunces_500Medium_Italic", serif: "Fraunces_700Bold",
  reg: "DMSans_400Regular", semi: "DMSans_500Medium", bold: "DMSans_700Bold", xbold: "DMSans_700Bold",
};
const fontsDark: typeof fontsLight = {
  display: "InstrumentSerif_400Regular", italic: "InstrumentSerif_400Regular_Italic", serif: "InstrumentSerif_400Regular",
  reg: "Manrope_400Regular", semi: "Manrope_600SemiBold", bold: "Manrope_700Bold", xbold: "Manrope_800ExtraBold",
};

/**
 * The live palette and fonts. Components read `c.something` / `f.something` at render time. ThemeProvider overwrites
 * these values when the theme changes and re-renders from the root, so every screen picks up the new look without
 * remounting (which would reset the current tab and any half-typed text).
 */
export const c: Palette = { ...light };
export const f = { ...fontsLight };
export const isDark = () => c.mode === "dark";
export const applyPalette = (scheme: "light" | "dark") => {
  Object.assign(c, scheme === "dark" ? dark : light);
  Object.assign(f, scheme === "dark" ? fontsDark : fontsLight);
};

export const shadow = {
  shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2,
};
