import { Stack } from "expo-router";
import { ChatDrawer } from "@/features/chat/ChatDrawer";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { useLayout } from "@/hooks/useLayout";

export const unstable_settings = { anchor: "index" };

const sidebar = () => <ChatSidebar />;

/** Phones get the sidebar as a drawer over Chat; split layouts keep it open beside the whole app (see the app layout). */
export default function ChatLayout() {
  const { split } = useLayout();
  return (
    <ChatDrawer sidebar={sidebar}>
      <Stack screenOptions={{ headerShown: false, animation: split ? "fade" : "default" }} />
    </ChatDrawer>
  );
}
