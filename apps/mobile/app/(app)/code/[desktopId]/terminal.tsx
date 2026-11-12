import { useLocalSearchParams } from "expo-router";
import { TerminalScreen } from "@/features/desktops/terminal/TerminalScreen";

export default function DesktopTerminalRoute() {
  const { desktopId, chatId, terminalId, title } = useLocalSearchParams<{ desktopId: string; chatId: string; terminalId: string; title?: string }>();
  return <TerminalScreen key={`${desktopId}:${terminalId}`} desktopId={desktopId} chatId={chatId ?? ""} terminalId={terminalId ?? ""} title={title || null} />;
}
