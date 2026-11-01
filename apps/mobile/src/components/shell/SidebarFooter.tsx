import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/components/Logo";
import { Icon, Text } from "@/components/ui";
import { profileAvatar, profileName } from "@/features/account/profile";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { sidebarItems } from "./navigation";

/** The foot of the sidebar: Models, Providers and Usage (Compare too on tablets), then the profile row for Account. */
export function SidebarFooter({ pathname, go }: { pathname: string; go(href: string): void }) {
  const insets = useSafeAreaInsets();
  const { split } = useLayout();
  const { session } = useAuth();
  const items = sidebarItems({ split, signedIn: Boolean(session) });
  return (
    <View className="gap-0.5 border-t border-border pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
      {items.map((item) => {
        // Only split layouts show the sidebar beside these screens, so only they mark the open one.
        const selected = split && (pathname === item.href || (item.href !== "/account/usage" && pathname.startsWith(`${item.href}/`)));
        return (
          <Pressable
            key={item.href}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => go(item.href)}
            className={cn("mx-2 h-10 flex-row items-center gap-3 rounded-md px-3 active:bg-accent", selected && "bg-accent")}
          >
            <Icon icon={item.icon} tone={selected ? "foreground" : "muted"} size={19} />
            <Text variant="body" className={cn(selected && "font-semibold")}>{item.label}</Text>
          </Pressable>
        );
      })}
      <ProfileRow selected={split && pathname.startsWith("/account") && pathname !== "/account/usage"} onPress={() => go("/account")} />
    </View>
  );
}

/** Who's signed in and to which workspace; opens Account, where the workspace can be switched. */
function ProfileRow({ selected, onPress }: { selected: boolean; onPress(): void }) {
  const { session } = useAuth();
  const { workspace } = useWorkspace();
  const user = session?.user ?? null;
  const name = user ? profileName(user) ?? user.email ?? "Signed in" : "Account";
  const avatar = user ? profileAvatar(user) : null;
  const detail = user ? workspace?.name ?? null : "Not signed in";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, detail, "Opens Account"].filter(Boolean).join(", ")}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn("mx-2 mt-1 flex-row items-center gap-3 rounded-md px-3 py-2 active:bg-accent", selected && "bg-accent")}
    >
      {avatar ? <Image source={{ uri: avatar }} style={{ width: 32, height: 32, borderRadius: 6 }} contentFit="cover" /> : <Logo label={name} size={32} />}
      <View className="flex-1">
        <Text variant="label" numberOfLines={1}>{name}</Text>
        {detail ? <Text variant="caption" numberOfLines={1}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
