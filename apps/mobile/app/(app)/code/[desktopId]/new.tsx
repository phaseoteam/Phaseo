import { useLocalSearchParams } from "expo-router";
import { NewDesktopChatScreen } from "@/features/desktops/NewDesktopChatScreen";

export default function NewDesktopChatRoute() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <NewDesktopChatScreen key={desktopId} desktopId={desktopId} />;
}
