import { useState } from "react";
import { View } from "react-native";
import type { Session, Task } from "../api";
import { TaskTimeline } from "../components/TaskTimeline";
import { Empty, Heading, Rise, Segmented, useApp, Btn } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

type Filter = "all" | "moving" | "waiting" | "done";
const MATCH: Record<Filter, (t: Task) => boolean> = {
  all: () => true,
  moving: (t) => !["done", "awaiting_approval"].includes(t.status),
  waiting: (t) => t.status === "awaiting_approval",
  done: (t) => t.status === "done",
};

export function Tasks({ sess, data, refresh }: { sess: Session; data: FamilyData; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { go } = useApp();
  const list = data.tasks.filter(MATCH[filter]);
  const count = (k: Filter) => data.tasks.filter(MATCH[k]).length;
  const live = count("moving") + count("waiting");

  return (
    <Screen onRefresh={refresh}>
      <Rise><Heading kicker={live ? `${live} in motion right now` : "Every errand, tracked"} title="Care" accent="journeys." /></Rise>
      <Rise delay={70}>
        <Segmented value={filter} onChange={setFilter} options={[
          { id: "all", label: "All" }, { id: "moving", label: `Moving ${count("moving") || ""}`.trim() },
          { id: "waiting", label: `Waiting ${count("waiting") || ""}`.trim() }, { id: "done", label: "Arrived" },
        ]} />
      </Rise>
      {list.length === 0 && (
        <Rise delay={140}>
          <View style={{ gap: 12 }}>
            <Empty title={data.tasks.length ? "Nothing here right now" : "No journeys yet"} hint={data.tasks.length ? "Try another filter." : "Ask Mitthu on the Home tab and watch each step happen."} />
            {!data.tasks.length && <Btn label="Ask Mitthu" onPress={() => go("home")} />}
          </View>
        </Rise>
      )}
      {list.map((t, i) => <Rise key={`${filter}-${t.id}`} delay={120 + Math.min(i, 5) * 70}><TaskTimeline task={t} sess={sess} startOpen={i === 0} /></Rise>)}
    </Screen>
  );
}
