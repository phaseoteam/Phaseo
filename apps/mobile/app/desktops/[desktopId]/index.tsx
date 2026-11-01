import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { chooseDesktop } from "@/features/chat/sidebar";

/** Older links to a computer's chats: Chat, with the sidebar on Code and that computer picked. */
export default function DesktopChatsRedirect() {
  const router = useRouter();
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  useEffect(() => {
    chooseDesktop(desktopId);
    router.replace("/chat");
  }, [desktopId, router]);
  return null;
}
