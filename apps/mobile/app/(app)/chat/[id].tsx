import { useLocalSearchParams } from "expo-router";
import { Conversation } from "@/features/chat/Conversation";

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Conversation key={id} chatId={id} />;
}
