import { useLocalSearchParams } from "expo-router";
import { PullRequestsScreen } from "@/features/desktops/pull-requests/PullRequestsScreen";

export default function DesktopPullRequestsRoute() {
  const { desktopId, projectId } = useLocalSearchParams<{ desktopId: string; projectId?: string }>();
  return <PullRequestsScreen key={desktopId} desktopId={desktopId} projectId={projectId || null} />;
}
