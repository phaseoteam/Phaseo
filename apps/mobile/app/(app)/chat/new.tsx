import { useLocalSearchParams } from "expo-router";
import { NewChat } from "@/features/chat/Conversation";

export default function NewChatRoute() {
  const { model } = useLocalSearchParams<{ model?: string }>();
  return <NewChat initialModel={model} />;
}
