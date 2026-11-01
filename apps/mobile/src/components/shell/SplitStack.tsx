import { Stack, usePathname, useRouter, type Href } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { EmptyState, Screen } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";

/**
 * A section's stack. On phones it is a plain stack whose index route is the list.
 * On split layouts the list stays mounted in a left pane and the stack becomes the
 * detail pane, so picking another item swaps the detail without losing the list.
 */
export function SplitStack({ list }: { list: ReactNode }) {
  const { split, listWidth } = useLayout();
  const stack = <Stack screenOptions={{ headerShown: false, animation: split ? "fade" : "default" }} />;
  if (!split) return stack;
  return (
    <View className="flex-1 flex-row">
      <View className="border-r border-border" style={{ width: listWidth }}>{list}</View>
      <View className="flex-1">{stack}</View>
    </View>
  );
}

/**
 * Opens a detail route: pushed on phones, swapped in place in the split detail pane. `swap` swaps on phones too, for
 * lists that sit beside the detail there as well (Chat's sidebar), so back still leads to the section's root.
 */
export function useOpenDetail(sectionRoot: string, { swap = false }: { swap?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { split } = useLayout();
  return useCallback((href: Href) => {
    if ((split || swap) && pathname !== sectionRoot) router.replace(href);
    else router.push(href);
  }, [router, pathname, sectionRoot, split, swap]);
}

/** The split layout's detail pane before anything is chosen. */
export function DetailPlaceholder({ title, body, icon }: { title: string; body: string; icon?: LucideIcon }) {
  return (
    <Screen>
      <EmptyState className="flex-1" icon={icon} title={title} body={body} />
    </Screen>
  );
}
