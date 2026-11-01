import { useLocalSearchParams } from "expo-router";
import { DesktopChatsScreen } from "@/features/desktops/DesktopChatsScreen";

export default function DesktopChatsRoute() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <DesktopChatsScreen key={desktopId} desktopId={desktopId} />;
}
