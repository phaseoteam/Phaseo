import { Redirect, useLocalSearchParams } from "expo-router";
import { newDesktopChatHref } from "@/features/desktops/routes";

/** Older links to a new thread on a computer; it now opens in Code. */
export default function NewDesktopChatRedirect() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <Redirect href={newDesktopChatHref(desktopId)} withAnchor />;
}
