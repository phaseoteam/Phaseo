import { usePathname } from "expo-router";
import { PanelLeft } from "lucide-react-native";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler, Pressable } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { Icon, Text } from "@/components/ui";
import { useNeedsYouCount } from "@/features/desktops/needsYou";
import { useLayout } from "@/hooks/useLayout";

type ChatDrawerControls = { open(): void; close(): void };
const ChatDrawerContext = createContext<ChatDrawerControls | null>(null);

/** The phone drawer's controls; null on split layouts, where the sidebar is the list column and never hides. */
export const useChatDrawer = () => useContext(ChatDrawerContext);

/**
 * Phones: Chat's sidebar slides in from the left, from the header button or a swipe from the screen's edge. Split
 * layouts render the children alone, as their SplitStack shows the sidebar as its list column.
 */
export function ChatDrawer({ sidebar, children }: { sidebar: () => ReactNode; children: ReactNode }) {
  const { split, width } = useLayout();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(pathname);
  const controls = useMemo<ChatDrawerControls>(() => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);

  // A chat opening (from the sidebar, a link or a notification) closes the drawer. Pairing leaves Chat and keeps it
  // open, so coming back shows the new computer's chats.
  if (pathname !== shown && pathname.startsWith("/chat")) {
    setShown(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open || split) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open, split]);

  if (split) return children;
  return (
    <ChatDrawerContext.Provider value={controls}>
      <Drawer
        open={open}
        onOpen={controls.open}
        onClose={controls.close}
        renderDrawerContent={sidebar}
        drawerType="front"
        drawerStyle={{ width: Math.min(width - 56, 360) }}
        overlayAccessibilityLabel="Close chats"
      >
        {children}
      </Drawer>
    </ChatDrawerContext.Provider>
  );
}

/** The header button that opens the drawer, with how many computer chats need you; nothing on split layouts. */
export function useSidebarButton() {
  const drawer = useChatDrawer();
  return drawer ? <SidebarButton onPress={drawer.open} /> : undefined;
}

function SidebarButton({ onPress }: { onPress(): void }) {
  const count = useNeedsYouCount();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Chats, ${count} need you` : "Chats"}
      hitSlop={8}
      onPress={onPress}
      className="h-10 min-w-10 flex-row items-center justify-center gap-1 rounded-md px-2 active:bg-accent"
    >
      <Icon icon={PanelLeft} size={20} />
      {count ? <Text variant="caption" className="font-semibold text-warning">{count}</Text> : null}
    </Pressable>
  );
}
