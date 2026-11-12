import { useLocalSearchParams } from "expo-router";
import { FilesScreen } from "@/features/desktops/files/FilesScreen";

export default function DesktopFilesRoute() {
  const { desktopId, chatId, projectId, where, path } = useLocalSearchParams<{ desktopId: string; chatId?: string; projectId?: string; where?: string; path?: string }>();
  const target = chatId ? { chatId } : { projectId: projectId ?? "" };
  return <FilesScreen key={`${desktopId}:${chatId ?? projectId}:${path ?? ""}`} desktopId={desktopId} target={target} where={where ?? null} path={path || null} />;
}
