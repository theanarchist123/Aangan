// Aangan tokens (same palette as the web app). SOS red is for emergencies only.
export const light = {
  teal: "#0E5E6F", tealDeep: "#0A4655", tealSoft: "#D9ECEF", marigold: "#F4A300", marigoldSoft: "#FFEEC7",
  ivory: "#FFF8EE", card: "#FFFFFF", ink: "#1F2A2E", muted: "#5E6C70", line: "#EADFCE", parrot: "#3FA34D",
  terracotta: "#C8553D", sos: "#D62828", seniorSos: "#B00020", inputBg: "#FFFFFF", placeholder: "#9AA6A9",
};
export type Palette = typeof light;

export const dark: Palette = {
  ...light,
  teal: "#4FB3C6", tealDeep: "#2E8FA3", tealSoft: "#17323A", marigoldSoft: "#3A2D0C", ivory: "#12161C", card: "#1B212A",
  ink: "#F4EFE6", muted: "#A3AFB3", line: "#2B3440", inputBg: "#161B22", placeholder: "#6F7C80",
};

/**
 * The live palette. Components read `c.something` at render time. ThemeProvider overwrites these values when the theme
 * changes and re-renders the whole tree from the root, so every screen picks up the new colours without remounting
 * (which would reset the current tab and any half-typed text).
 */
export const c: Palette = { ...light };
export const applyPalette = (scheme: "light" | "dark") => Object.assign(c, scheme === "dark" ? dark : light);

export const f = {
  serif: "Fraunces_700Bold",
  reg: "PlusJakartaSans_400Regular",
  semi: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  xbold: "PlusJakartaSans_800ExtraBold",
};

export const shadow = {
  shadowColor: "#000", shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3,
};
