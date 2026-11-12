import { useLocalSearchParams } from "expo-router";
import { NewDesktopThread } from "@/features/desktops/NewDesktopThread";

export default function NewDesktopThreadRoute() {
  const { desktopId, projectId } = useLocalSearchParams<{ desktopId: string; projectId?: string }>();
  return <NewDesktopThread key={`${desktopId}:${projectId ?? ""}`} desktopId={desktopId} projectId={projectId ?? null} />;
}
