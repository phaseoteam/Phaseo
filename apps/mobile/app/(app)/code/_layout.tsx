import { Stack } from "expo-router";
import { useLayout } from "@/hooks/useLayout";

// A computer's threads are listed in the sidebar, so a thread is the root of this stack, like a chat in Chat.
export default function CodeLayout() {
  const { split } = useLayout();
  return <Stack screenOptions={{ headerShown: false, animation: split ? "fade" : "default" }} />;
}
