import { SplitStack } from "@/components/shell/SplitStack";
import { ChatDrawer } from "@/features/chat/ChatDrawer";
import { ChatSidebar } from "@/features/chat/ChatSidebar";

export const unstable_settings = { anchor: "index" };

const sidebar = () => <ChatSidebar />;

/** Phones get the chats sidebar as a drawer over the stack; split layouts keep it as the list column. */
export default function ChatLayout() {
  return (
    <ChatDrawer sidebar={sidebar}>
      <SplitStack list={<ChatSidebar />} />
    </ChatDrawer>
  );
}
