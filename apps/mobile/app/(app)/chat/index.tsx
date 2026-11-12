import { useLocalSearchParams } from "expo-router";
import { NewChat } from "@/features/chat/Conversation";

export default function ChatIndex() {
  const { model } = useLocalSearchParams<{ model?: string }>();
  // Chat opens on a ready composer; the chats are in the sidebar (a drawer on phones, the list column on tablets).
  return <NewChat initialModel={model} />;
}
