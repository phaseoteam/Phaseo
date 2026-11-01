import { usePathname, useRouter, type Href } from "expo-router";
import { SquarePen, SquareTerminal } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { chatOpens, sectionOf } from "@/components/shell/navigation";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { useOpenScreen } from "@/components/shell/useOpenScreen";
import { Button, Icon, IconButton, Screen, SearchField, Text } from "@/components/ui";
import { useNeedsYouCount } from "@/features/desktops/needsYou";
import { CODE_HREF } from "@/features/desktops/routes";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";
import { useChatDrawer } from "./ChatDrawer";
import { ChatList } from "./ChatList";

/**
 * The app's sidebar: a drawer over Chat on phones, always open on the left on split layouts. Search and New chat, Code
 * (a paired computer's threads, with how many need you), the chats on this device, then Models, Providers and Usage
 * and the profile row for Account. Signed out, it keeps only the public screens and a way to sign in.
 */
export function ChatSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const drawer = useChatDrawer();
  const signedIn = Boolean(useAuth().session);
  const openScreen = useOpenScreen();

  const go = useCallback((href: string) => {
    drawer?.close();
    openScreen(href);
  }, [drawer, openScreen]);

  const open = useCallback((href: Href) => {
    drawer?.close();
    if (chatOpens(pathname) === "replace") router.replace(href);
    else go(String(href));
  }, [drawer, go, router, pathname]);

  return (
    <Screen>
      {signedIn ? <Chats pathname={pathname} open={open} go={go} /> : <SignedOut />}
      <SidebarFooter pathname={pathname} go={go} />
    </Screen>
  );
}

function Chats({ pathname, open, go }: { pathname: string; open(href: Href): void; go(href: string): void }) {
  const drawer = useChatDrawer();
  const [query, setQuery] = useState("");
  const newChat = () => {
    // Chat's own screen is already a new chat.
    if (pathname === "/chat" || pathname === "/chat/new") { drawer?.close(); return; }
    open("/chat/new");
  };
  return (
    <>
      <View className="flex-row items-center gap-1 pb-2 pl-4 pr-2 pt-2">
        <SearchField className="flex-1" value={query} onChangeText={setQuery} placeholder="Search chats" />
        <IconButton icon={SquarePen} label="New chat" onPress={newChat} />
      </View>
      <CodeEntry selected={sectionOf(pathname) === CODE_HREF} onPress={() => go(CODE_HREF)} />
      <View className="mx-4 mb-1 mt-1 h-px bg-border" />
      <View className="flex-1"><ChatList query={query} open={open} /></View>
    </>
  );
}

/** Code: a paired computer's threads on their own screen, with how many need you. */
function CodeEntry({ selected, onPress }: { selected: boolean; onPress(): void }) {
  const { split } = useLayout();
  const count = useNeedsYouCount();
  // Only split layouts show the sidebar beside Code, so only they mark it open.
  const marked = split && selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Code, ${count} need you` : "Code"}
      accessibilityHint="Your threads on a paired computer"
      accessibilityState={{ selected: marked }}
      onPress={onPress}
      className={cn("mx-2 h-10 flex-row items-center gap-3 rounded-md px-3 active:bg-accent", marked && "bg-accent")}
    >
      <Icon icon={SquareTerminal} tone={marked ? "foreground" : "muted"} size={19} />
      <Text variant="body" className={cn("flex-1", marked && "font-semibold")}>Code</Text>
      {count ? <Text variant="caption" className="font-semibold text-warning">{`${count} need you`}</Text> : null}
    </Pressable>
  );
}

/** Split layouts show the sidebar before signing in too: the public screens below, and this. */
function SignedOut() {
  const router = useRouter();
  return (
    <View className="flex-1 px-4 pt-4">
      <Text variant="heading">Phaseo</Text>
      <Text variant="muted" className="mt-1">Sign in to chat with any model. Chats stay on this device.</Text>
      <Button label="Sign in to chat" className="mt-4" onPress={() => router.push("/sign-in")} />
    </View>
  );
}
