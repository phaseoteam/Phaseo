import { usePathname, useRouter, type Href } from "expo-router";
import { SquarePen } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { sectionOf } from "@/components/shell/navigation";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { useOpenScreen } from "@/components/shell/useOpenScreen";
import { Button, IconButton, Screen, SearchField, Segmented, SkeletonRows, Text } from "@/components/ui";
import { DesktopChatList, DesktopPicker, PairPrompt } from "@/features/desktops/DesktopChatList";
import { useNeedsYouCount } from "@/features/desktops/needsYou";
import type { SavedDesktop } from "@/features/desktops/reach";
import { desktopChatInPath } from "@/features/desktops/routes";
import { useDesktops } from "@/features/desktops/store";
import { useAuth } from "@/providers/AuthProvider";
import { useChatDrawer } from "./ChatDrawer";
import { ChatList } from "./ChatList";
import { chooseDesktop, chooseSidebarMode, chosenDesktop, newChatHref, sidebarStore, type SidebarMode } from "./sidebar";

/**
 * The app's sidebar: a drawer over Chat on phones, always open on the left on split layouts. Search and New chat, the
 * Chat | Code switch between Phaseo's chats on this device and those on a paired computer, the chats, then Models,
 * Providers and Usage and the profile row for Account. Signed out, it keeps only the public screens and a way to sign in.
 */
export function ChatSidebar() {
  const pathname = usePathname();
  const drawer = useChatDrawer();
  const signedIn = Boolean(useAuth().session);
  const openDetail = useOpenDetail("/chat", { swap: true });
  const openScreen = useOpenScreen();

  const go = useCallback((href: string) => {
    drawer?.close();
    openScreen(href);
  }, [drawer, openScreen]);

  // Inside Chat a chat swaps into its stack; from another screen, back to Chat with it open.
  const open = useCallback((href: Href) => {
    if (sectionOf(pathname) !== "/chat") return go(String(href));
    drawer?.close();
    openDetail(href);
  }, [drawer, go, openDetail, pathname]);

  return (
    <Screen>
      {signedIn ? <Chats pathname={pathname} open={open} /> : <SignedOut />}
      <SidebarFooter pathname={pathname} go={go} />
    </Screen>
  );
}

function Chats({ pathname, open }: { pathname: string; open(href: Href): void }) {
  const router = useRouter();
  const drawer = useChatDrawer();
  const { mode, desktopId } = sidebarStore.use();
  const desktops = useDesktops();
  const desktop = desktops ? chosenDesktop(desktops, desktopId) : null;
  const needsYou = useNeedsYouCount();
  const [query, setQuery] = useState("");

  const newChat = () => {
    const href = newChatHref(mode, desktop?.desktopId ?? null);
    if (href === "/pair") { router.push(href); return; }
    // Chat's own screen is already a new chat.
    if (pathname === href || (mode === "chat" && pathname === "/chat")) { drawer?.close(); return; }
    open(href);
  };

  return (
    <>
      <View className="flex-row items-center gap-1 pb-2 pl-4 pr-2 pt-2">
        <SearchField className="flex-1" value={query} onChangeText={setQuery} placeholder="Search chats" />
        <IconButton icon={SquarePen} label={mode === "code" && desktop ? `New chat on ${desktop.desktopName}` : "New chat"} onPress={newChat} />
      </View>
      <Segmented<SidebarMode>
        className="mx-4 mb-1"
        value={mode}
        onChange={chooseSidebarMode}
        options={[
          { value: "chat", label: "Chat" },
          { value: "code", label: "Code", count: needsYou, accessibilityLabel: needsYou ? `Code, ${needsYou} need you` : undefined },
        ]}
      />
      <View className="flex-1">
        {mode === "chat" ? <ChatList query={query} open={open} /> : <CodeChats desktops={desktops} desktop={desktop} query={query} pathname={pathname} open={open} />}
      </View>
    </>
  );
}

function CodeChats({ desktops, desktop, query, pathname, open }: { desktops: SavedDesktop[] | null; desktop: SavedDesktop | null; query: string; pathname: string; open(href: Href): void }) {
  if (desktops == null) return <SkeletonRows count={4} />;
  if (!desktop) return <PairPrompt />;
  const selected = desktopChatInPath(pathname);
  return (
    <>
      <DesktopPicker desktops={desktops} chosenId={desktop.desktopId} onPick={desktops.length > 1 ? chooseDesktop : undefined} />
      <View className="mx-4 mb-1 h-px bg-border" />
      <DesktopChatList key={desktop.desktopId} desktop={desktop} query={query} selectedChatId={selected?.desktopId === desktop.desktopId ? selected.chatId : null} open={open} />
    </>
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
