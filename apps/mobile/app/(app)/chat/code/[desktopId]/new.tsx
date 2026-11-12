import { Redirect, useLocalSearchParams } from "expo-router";
import { newDesktopChatHref } from "@/features/desktops/routes";

/** Older links to a new thread on a computer, from when Code was a side of the chats sidebar. */
export default function OldNewDesktopChatRedirect() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <Redirect href={newDesktopChatHref(desktopId)} withAnchor />;
}
