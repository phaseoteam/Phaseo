import { Stack, useNavigationContainerRef, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { launchHref, launchReset } from "@/components/shell/navigation";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { useLayout } from "@/hooks/useLayout";
import { useAuth } from "@/providers/AuthProvider";

// `/` decides where the app opens; under a deep link it's what back returns to.
export const unstable_settings = { anchor: "index" };

/**
 * One stack: the launch screen (a new chat, or Models when signed out) with Models, Providers, Compare and Account
 * pushed over it. Phones open the sidebar from Chat as a drawer; split layouts keep it open on the left.
 */
export default function AppLayout() {
  const { split, sidebarWidth } = useLayout();
  useLaunchOnSignIn();
  const stack = <Stack screenOptions={{ headerShown: false, animation: split ? "fade" : "default" }} />;
  if (!split) return stack;
  return (
    <View className="flex-1 flex-row bg-background">
      <View className="border-r border-border" style={{ width: sidebarWidth }}><ChatSidebar /></View>
      <View className="flex-1">{stack}</View>
    </View>
  );
}

/** Signing in opens a new chat, and signing out opens Models, each as the only screen. */
function useLaunchOnSignIn() {
  const signedIn = Boolean(useAuth().session);
  const navigation = useNavigationContainerRef();
  const router = useRouter();
  const shown = useRef(signedIn);
  useEffect(() => {
    if (shown.current === signedIn) return;
    shown.current = signedIn;
    const reset = launchReset(navigation.getRootState(), signedIn);
    if (reset) navigation.dispatch(reset);
    else router.replace(launchHref(signedIn));
  }, [signedIn, navigation, router]);
}
