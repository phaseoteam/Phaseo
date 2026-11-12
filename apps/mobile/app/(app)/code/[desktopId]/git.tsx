import { useLocalSearchParams } from "expo-router";
import { GitScreen } from "@/features/desktops/git/GitScreen";

export default function DesktopGitRoute() {
  const { desktopId, projectId, chatId, where } = useLocalSearchParams<{ desktopId: string; projectId: string; chatId?: string; where?: string }>();
  return <GitScreen key={`${desktopId}:${projectId}`} desktopId={desktopId} projectId={projectId ?? ""} chatId={chatId || null} where={where || null} />;
}
