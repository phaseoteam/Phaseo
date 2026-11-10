import { useLocalSearchParams } from "expo-router";
import { DesktopChatScreen } from "@/features/desktops/DesktopChatScreen";

export default function DesktopChatRoute() {
  const { desktopId, chatId } = useLocalSearchParams<{ desktopId: string; chatId: string }>();
  return <DesktopChatScreen key={`${desktopId}:${chatId}`} desktopId={desktopId} chatId={chatId} />;
}
