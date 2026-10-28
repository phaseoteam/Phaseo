import { SplitStack } from "@/components/shell/SplitStack";
import { ChatList } from "@/features/chat/ChatList";

export const unstable_settings = { anchor: "index" };

export default function ChatLayout() {
  return <SplitStack list={<ChatList />} />;
}
