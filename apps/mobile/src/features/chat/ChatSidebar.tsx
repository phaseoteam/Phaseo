import { usePathname, useRouter, type Href } from "expo-router";
import { SquarePen } from "lucide-react-native";
import { useCallback } from "react";
import { View } from "react-native";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { IconButton, Screen, Segmented, SkeletonRows } from "@/components/ui";
import { DesktopChatList, DesktopPicker, PairPrompt } from "@/features/desktops/DesktopChatList";
import { useNeedsYouCount } from "@/features/desktops/needsYou";
import type { SavedDesktop } from "@/features/desktops/reach";
import { desktopChatInPath } from "@/features/desktops/routes";
import { useDesktops } from "@/features/desktops/store";
import { useChatDrawer } from "./ChatDrawer";
import { ChatList } from "./ChatList";
import { chooseDesktop, chooseSidebarMode, chosenDesktop, newChatHref, sidebarStore, type SidebarMode } from "./sidebar";

/**
 * Chat's sidebar: a drawer on phones, the list column on split layouts. Chat | Code switches between Phaseo's chats on
 * this device and the chats on a paired computer; New chat starts one on whichever side is showing.
 */
export function ChatSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const drawer = useChatDrawer();
  const openDetail = useOpenDetail("/chat", { swap: true });
  const { mode, desktopId } = sidebarStore.use();
  const desktops = useDesktops();
  const desktop = desktops ? chosenDesktop(desktops, desktopId) : null;
  const needsYou = useNeedsYouCount();

  const open = useCallback((href: Href) => {
    drawer?.close();
    openDetail(href);
  }, [drawer, openDetail]);

  const newChat = () => {
    const href = newChatHref(mode, desktop?.desktopId ?? null);
    if (href === "/pair") { router.push(href); return; }
    // Chat's own screen is already a new chat.
    if (pathname === href || (mode === "chat" && pathname === "/chat")) { drawer?.close(); return; }
    open(href);
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-1 pb-2 pl-4 pr-2 pt-2">
        <Segmented<SidebarMode>
          className="flex-1"
          value={mode}
          onChange={chooseSidebarMode}
          options={[
            { value: "chat", label: "Chat" },
            { value: "code", label: "Code", count: needsYou, accessibilityLabel: needsYou ? `Code, ${needsYou} need you` : undefined },
          ]}
        />
        <IconButton icon={SquarePen} label={mode === "code" && desktop ? `New chat on ${desktop.desktopName}` : "New chat"} onPress={newChat} />
      </View>
      {mode === "chat" ? <ChatList open={open} /> : <CodeChats desktops={desktops} desktop={desktop} pathname={pathname} open={open} />}
    </Screen>
  );
}

function CodeChats({ desktops, desktop, pathname, open }: { desktops: SavedDesktop[] | null; desktop: SavedDesktop | null; pathname: string; open(href: Href): void }) {
  if (desktops == null) return <SkeletonRows count={4} />;
  if (!desktop) return <PairPrompt />;
  const selected = desktopChatInPath(pathname);
  return (
    <>
      <DesktopPicker desktops={desktops} chosenId={desktop.desktopId} onPick={desktops.length > 1 ? chooseDesktop : undefined} />
      <View className="mx-4 mb-1 h-px bg-border" />
      <DesktopChatList key={desktop.desktopId} desktop={desktop} selectedChatId={selected?.desktopId === desktop.desktopId ? selected.chatId : null} open={open} />
    </>
  );
}
