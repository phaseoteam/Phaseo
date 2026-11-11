import { usePathname, useRouter, type Href } from "expo-router";
import { SquarePen } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { chatOpens, sectionOf } from "@/components/shell/navigation";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { useOpenScreen } from "@/components/shell/useOpenScreen";
import { Button, IconButton, Screen, SearchField, Text } from "@/components/ui";
import { CodeThreadList } from "@/features/desktops/CodeThreadList";
import { workspaceDesktop, workspaceStore } from "@/features/desktops/picked";
import type { SavedDesktop } from "@/features/desktops/reach";
import { CODE_HREF, desktopChatInPath, newDesktopChatHref } from "@/features/desktops/routes";
import { useDesktops } from "@/features/desktops/store";
import { WorkspaceSwitcher } from "@/features/desktops/WorkspaceSwitcher";
import { useAuth } from "@/providers/AuthProvider";
import { useSidebarDrawer } from "@/components/shell/sidebarDrawer";
import { ChatList } from "./ChatList";

/**
 * The app's sidebar: a drawer over every screen on phones, always open on the left on split layouts. At the top, the
 * workspace switcher: Phaseo shows search, New chat and the chats on this device; a paired computer shows its
 * projects and threads, with New thread. Then Models, Providers and Usage and the profile row for Account. Signed
 * out, it keeps only the public screens and a way to sign in.
 */
export function ChatSidebar() {
  const pathname = usePathname();
  const drawer = useSidebarDrawer();
  const signedIn = Boolean(useAuth().session);
  const openScreen = useOpenScreen();
  const desktops = useDesktops();
  const desktop = workspaceDesktop(desktops, workspaceStore.use());

  const go = useCallback((href: string) => {
    drawer?.close();
    openScreen(href);
  }, [drawer, openScreen]);

  return (
    <Screen>
      {signedIn ? (
        <>
          <WorkspaceSwitcher />
          {desktop ? <Computer key={desktop.desktopId} desktop={desktop} pathname={pathname} go={go} /> : <Chats pathname={pathname} go={go} />}
        </>
      ) : <SignedOut />}
      <SidebarFooter pathname={pathname} go={go} />
    </Screen>
  );
}

/**
 * Opens a chat or thread from the list. Inside its own section it takes the open one's place, so Chat (or the
 * computer's thread) stays one screen and back leaves the app; from anywhere else it opens the way the sidebar opens
 * screens.
 */
function useOpenFromList(pathname: string, go: (href: string) => void, section: string) {
  const router = useRouter();
  const drawer = useSidebarDrawer();
  return useCallback((href: Href) => {
    drawer?.close();
    const inPlace = section === "/chat" ? chatOpens(pathname) === "replace" : sectionOf(pathname) === section;
    if (inPlace) router.replace(href);
    else go(String(href));
  }, [drawer, go, router, pathname, section]);
}

function Chats({ pathname, go }: { pathname: string; go(href: string): void }) {
  const drawer = useSidebarDrawer();
  const open = useOpenFromList(pathname, go, "/chat");
  const [query, setQuery] = useState("");
  const newChat = () => {
    // Chat's own screen is already a new chat.
    if (pathname === "/chat" || pathname === "/chat/new") { drawer?.close(); return; }
    open("/chat/new");
  };
  return (
    <>
      <View className="flex-row items-center gap-1 pb-2 pl-4 pr-2">
        <SearchField className="flex-1" value={query} onChangeText={setQuery} placeholder="Search chats" />
        <IconButton icon={SquarePen} label="New chat" onPress={newChat} />
      </View>
      <View className="flex-1"><ChatList query={query} open={open} /></View>
    </>
  );
}

/** A paired computer's projects and threads, as its own sidebar lists them. */
function Computer({ desktop, pathname, go }: { desktop: SavedDesktop; pathname: string; go(href: string): void }) {
  const open = useOpenFromList(pathname, go, CODE_HREF);
  const [query, setQuery] = useState("");
  const selected = desktopChatInPath(pathname);
  return (
    <>
      <View className="flex-row items-center gap-1 pb-2 pl-4 pr-2">
        <SearchField className="flex-1" value={query} onChangeText={setQuery} placeholder="Search threads" />
        <IconButton icon={SquarePen} label={`New thread on ${desktop.desktopName}`} onPress={() => open(newDesktopChatHref(desktop.desktopId))} />
      </View>
      <View className="flex-1">
        <CodeThreadList desktop={desktop} query={query} selectedChatId={selected?.desktopId === desktop.desktopId ? selected.chatId : null} open={open} />
      </View>
    </>
  );
}

/** Before signing in, the sidebar keeps the public screens below this, and a way to sign in. */
function SignedOut() {
  const router = useRouter();
  const drawer = useSidebarDrawer();
  return (
    <View className="flex-1 px-4 pt-4">
      <Text variant="heading">Phaseo</Text>
      <Text variant="muted" className="mt-1">Sign in to chat with any model. Chats stay on this device.</Text>
      <Button label="Sign in to chat" className="mt-4" onPress={() => { drawer?.close(); router.push("/sign-in"); }} />
    </View>
  );
}
