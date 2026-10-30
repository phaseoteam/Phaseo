import { Link } from "expo-router";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { LogIn } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV_ITEMS, SIDEBAR_SHORTCUTS } from "@/components/shell/navigation";
import { TabButton } from "@/components/shell/TabButton";
import { Icon, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

/**
 * One tab navigator, two looks: a bottom bar on phones, and a sidebar on tablets and
 * unfolded foldables (an icon rail below 1024 dp, labelled above). The hidden TabList
 * declares the routes; the visible bars are TabTriggers that switch between them.
 */
export default function AppLayout() {
  const { split, wide } = useLayout();
  return (
    <Tabs style={{ flex: 1, flexDirection: split ? "row" : "column" }}>
      {split ? <Sidebar labelled={wide} /> : null}
      <View className="flex-1 bg-background">
        <TabSlot />
      </View>
      {!split ? <BottomBar /> : null}
      <TabList style={{ display: "none" }}>
        {NAV_ITEMS.map((item) => <TabTrigger key={item.name} name={item.name} href={item.href} />)}
      </TabList>
    </Tabs>
  );
}

function BottomBar() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-row border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
      {NAV_ITEMS.filter((item) => item.phone).map((item) => (
        <TabTrigger key={item.name} name={item.name} asChild>
          <TabButton label={item.label} icon={item.icon} layout="bar" />
        </TabTrigger>
      ))}
    </View>
  );
}

function Sidebar({ labelled }: { labelled: boolean }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { workspace } = useWorkspace();
  return (
    <View
      className={cn("border-r border-sidebar-border bg-sidebar", labelled ? "w-60 px-3" : "w-20 items-center")}
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}
    >
      {labelled ? <Text variant="heading" className="mb-4 px-3">Phaseo</Text> : <Text variant="heading" className="mb-4">P</Text>}
      <View className={cn(labelled ? "gap-0.5" : "gap-1")}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <TabButton label={item.label} icon={item.icon} layout={labelled ? "sidebar" : "rail"} />
          </TabTrigger>
        ))}
      </View>
      {labelled && session ? (
        <View className="mt-4 gap-0.5 border-t border-sidebar-border pt-4">
          {SIDEBAR_SHORTCUTS.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href} asChild>
              <Pressable className="h-10 flex-row items-center gap-3 rounded-md px-3 active:bg-sidebar-accent">
                <Icon icon={shortcut.icon} tone="muted" size={19} />
                <Text variant="body" className="text-muted-foreground">{shortcut.label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      ) : null}
      <View className="flex-1" />
      {labelled ? (
        session ? (
          <Link href="/account/workspace" asChild>
            <Pressable className="rounded-md px-3 py-2 active:bg-sidebar-accent">
              <Text variant="caption">Workspace</Text>
              <Text variant="label" numberOfLines={1}>{workspace?.name ?? "Choose a workspace"}</Text>
            </Pressable>
          </Link>
        ) : (
          <Link href="/sign-in" asChild>
            <Pressable className="h-10 flex-row items-center gap-3 rounded-md px-3 active:bg-sidebar-accent">
              <Icon icon={LogIn} tone="muted" size={19} />
              <Text variant="body" className="text-muted-foreground">Sign in</Text>
            </Pressable>
          </Link>
        )
      ) : null}
    </View>
  );
}
