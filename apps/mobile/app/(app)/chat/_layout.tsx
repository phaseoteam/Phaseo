import { Stack } from "expo-router";
import { useLayout } from "@/hooks/useLayout";

export const unstable_settings = { anchor: "index" };

/** Chat's stack. The sidebar sits beside the whole app, as a drawer on phones (see the app layout). */
export default function ChatLayout() {
  const { split } = useLayout();
  return <Stack screenOptions={{ headerShown: false, animation: split ? "fade" : "default" }} />;
}
