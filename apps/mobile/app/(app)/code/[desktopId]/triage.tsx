import { useLocalSearchParams } from "expo-router";
import { TriageScreen } from "@/features/desktops/triage/TriageScreen";

export default function TriageRoute() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <TriageScreen key={desktopId} desktopId={desktopId} />;
}
