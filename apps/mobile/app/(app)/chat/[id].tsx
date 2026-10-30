import { useLocalSearchParams } from "expo-router";
import { Conversation } from "@/features/chat/Conversation";

export default function ChatRoute() {
  // `message` opens the chat at a message (a link); `q` at the newest message matching a search.
  const { id, message, q } = useLocalSearchParams<{ id: string; message?: string; q?: string }>();
  return <Conversation key={`${id}:${message ?? ""}:${q ?? ""}`} chatId={id} focusMessage={message ?? null} search={q ?? null} />;
}
