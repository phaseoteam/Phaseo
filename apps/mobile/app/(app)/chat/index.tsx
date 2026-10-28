import { useLocalSearchParams } from "expo-router";
import { ChatList } from "@/features/chat/ChatList";
import { NewChat } from "@/features/chat/Conversation";
import { useLayout } from "@/hooks/useLayout";

export default function ChatIndex() {
  const { split } = useLayout();
  const { model } = useLocalSearchParams<{ model?: string }>();
  // Tablets keep the list beside a ready composer; phones show the list first.
  if (split || model) return <NewChat initialModel={model} />;
  return <ChatList />;
}
