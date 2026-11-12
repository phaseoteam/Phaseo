import { useLocalSearchParams } from "expo-router";
import { PullRequestScreen } from "@/features/desktops/pull-requests/PullRequestScreen";

export default function DesktopPullRequestRoute() {
  const { desktopId, projectId, number } = useLocalSearchParams<{ desktopId: string; projectId: string; number: string }>();
  return <PullRequestScreen key={`${desktopId}:${projectId}:${number}`} desktopId={desktopId} projectId={projectId ?? ""} number={Number(number)} />;
}
