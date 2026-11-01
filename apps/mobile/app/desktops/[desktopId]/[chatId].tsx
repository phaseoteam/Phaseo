import { Redirect, useLocalSearchParams } from "expo-router";
import { desktopChatHref } from "@/features/desktops/routes";

/** Older links to a computer's thread; it now opens in Code. */
export default function DesktopChatRedirect() {
  const { desktopId, chatId } = useLocalSearchParams<{ desktopId: string; chatId: string }>();
  return <Redirect href={desktopChatHref(desktopId, chatId)} withAnchor />;
}
