import { usePathname, useRouter } from "expo-router";
import { Bell, Building2, ChartNoAxesColumn, Info, KeyRound, LogOut, Palette } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Button, confirm, Header, Row, Screen, Section, Text } from "@/components/ui";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

const ITEMS = {
  usage: { href: "/account/usage", title: "Usage", icon: ChartNoAxesColumn },
  workspace: { href: "/account/workspace", title: "Workspace", icon: Building2 },
  keys: { href: "/account/keys", title: "API keys", icon: KeyRound },
  notifications: { href: "/account/notifications", title: "Notifications", icon: Bell },
  appearance: { href: "/account/appearance", title: "Appearance", icon: Palette },
  about: { href: "/account/about", title: "About", icon: Info },
} as const;

export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/account");
  const { session, signOut } = useAuth();
  const { workspace } = useWorkspace();
  const item = (key: keyof typeof ITEMS, extra: { subtitle?: string | null; last?: boolean } = {}) => {
    const entry = ITEMS[key];
    return <Row key={key} icon={entry.icon} title={entry.title} subtitle={extra.subtitle} selected={pathname === entry.href} onPress={() => openDetail(entry.href)} last={extra.last} />;
  };

  return (
    <Screen>
      <Header large title="Account" />
      <ScrollView contentContainerClassName="pb-16">
        {session ? (
          <View className="px-4 pb-2">
            <Text variant="label">{session.user.email ?? "Signed in"}</Text>
            <Text variant="muted">{workspace?.name ? `Workspace: ${workspace.name}` : "Loading workspace…"}</Text>
          </View>
        ) : (
          <View className="px-4 pb-2">
            <Text variant="muted">Sign in once to chat, follow your usage and get notified about new models.</Text>
            <Button label="Sign in" className="mt-3" onPress={() => router.push("/sign-in")} />
          </View>
        )}
        {session ? (
          <Section title="Workspace">
            {item("usage")}
            {item("workspace", { subtitle: workspace?.name })}
            {item("keys", { last: true })}
          </Section>
        ) : null}
        <Section title="App">
          {item("notifications")}
          {item("appearance")}
          {item("about", { last: true })}
        </Section>
        {session ? (
          <Section>
            <Row
              icon={LogOut}
              title="Sign out"
              destructive
              chevron={false}
              last
              onPress={() => void confirm({ title: "Sign out?", body: "Chats stay on this phone. You'll need to sign in again to send messages or see usage.", confirmLabel: "Sign out", destructive: true }).then((ok) => { if (ok) void signOut(); })}
            />
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
