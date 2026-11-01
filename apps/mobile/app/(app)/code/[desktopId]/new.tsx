import { useLocalSearchParams } from "expo-router";
import { NewDesktopChatScreen } from "@/features/desktops/NewDesktopChatScreen";

export default function NewDesktopChatRoute() {
  const { desktopId, projectId } = useLocalSearchParams<{ desktopId: string; projectId?: string }>();
  return <NewDesktopChatScreen key={`${desktopId}:${projectId ?? ""}`} desktopId={desktopId} projectId={projectId ?? null} />;
}
