import { View } from "react-native";
import type { Session } from "../api";
import { TaskTimeline } from "../components/TaskTimeline";
import { Empty, Txt } from "../ui";
import type { FamilyData } from "../useFamily";
import { Screen } from "./Screen";

export function Tasks({ sess, data, refresh }: { sess: Session; data: FamilyData; refresh: () => Promise<void> }) {
  return (
    <Screen onRefresh={refresh}>
      <Txt variant="title">Tasks</Txt>
      {data.tasks.length === 0 ? <Empty emoji="🦜" title="No tasks yet" hint="Ask Mitthu on the Home tab and watch it work." />
        : <View style={{ gap: 14 }}>{data.tasks.map((t) => <TaskTimeline key={t.id} task={t} sess={sess} />)}</View>}
    </Screen>
  );
}
