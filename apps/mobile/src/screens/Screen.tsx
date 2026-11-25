import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c } from "../theme";

/** Scrolling page that respects the status bar and pulls to refresh. */
export function Screen({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [r, setR] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.ivory }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 28, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={r} progressViewOffset={insets.top} colors={[c.teal]} onRefresh={async () => { setR(true); await onRefresh(); setR(false); }} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
