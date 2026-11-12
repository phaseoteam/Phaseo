import { useLocalSearchParams } from "expo-router";
import { ArchivedThreadsScreen } from "@/features/desktops/ArchivedThreadsScreen";

export default function ArchivedThreadsRoute() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <ArchivedThreadsScreen desktopId={desktopId} />;
}
