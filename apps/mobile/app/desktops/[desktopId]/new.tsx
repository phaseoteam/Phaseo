import { Redirect, useLocalSearchParams } from "expo-router";
import { newDesktopChatHref } from "@/features/desktops/routes";

/** Older links to a new chat on a computer; it now opens under Chat. */
export default function NewDesktopChatRedirect() {
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  return <Redirect href={newDesktopChatHref(desktopId)} />;
}
