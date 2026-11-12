import { Redirect, useLocalSearchParams } from "expo-router";
import { desktopChatHref } from "@/features/desktops/routes";

/** Older links to a computer's thread, from when Code was a side of the chats sidebar. */
export default function OldDesktopChatRedirect() {
  const { desktopId, chatId } = useLocalSearchParams<{ desktopId: string; chatId: string }>();
  return <Redirect href={desktopChatHref(desktopId, chatId)} withAnchor />;
}
