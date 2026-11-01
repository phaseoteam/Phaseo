import { useRouter } from "expo-router";
import { Monitor, Plus } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { Button, confirm, EmptyState, Header, IconButton, LoadingState, Row, Screen, Section, Text } from "@/components/ui";
import { clientFor, connectionLabel, useConnection } from "./connections";
import type { SavedDesktop } from "./reach";
import { forgetDesktop, useDesktops } from "./store";

/** The computers this phone is paired with, how each is reached right now, and Remove. */
export function DesktopsScreen() {
  const router = useRouter();
  const desktops = useDesktops();
  return (
    <Screen>
      <Header back title="Desktops" right={<IconButton icon={Plus} label="Pair a computer" onPress={() => router.push("/pair")} />} />
      {desktops == null ? <LoadingState /> : desktops.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={Monitor}
          title="No computers yet"
          body="Use your chats on Phaseo for desktop from this phone. On the computer, open Settings → Phone, turn on Allow phone access, choose Pair a phone and scan the code."
          action="Pair a computer"
          onAction={() => router.push("/pair")}
        />
      ) : (
        <ScrollView contentContainerClassName="pb-16">
          <Section>
            {desktops.map((desktop, index) => <DesktopRow key={desktop.desktopId} desktop={desktop} last={index === desktops.length - 1} />)}
          </Section>
          <Text variant="caption" className="mt-4 px-4">
            {"This phone tries the computer's own addresses first (the same Wi-Fi, or a Tailscale tailnet), then Phaseo Connect when the computer has it on."}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

function DesktopRow({ desktop, last }: { desktop: SavedDesktop; last: boolean }) {
  const router = useRouter();
  const state = useConnection(clientFor(desktop));
  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${desktop.desktopName}?`,
      body: "This phone forgets the computer and its keys. To stop the computer accepting this phone, remove it there too, in Settings → Phone.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) await forgetDesktop(desktop.desktopId);
  };
  return (
    <Row
      icon={Monitor}
      title={desktop.desktopName}
      subtitle={connectionLabel(state)}
      onPress={() => router.push({ pathname: "/desktops/[desktopId]", params: { desktopId: desktop.desktopId } })}
      chevron={false}
      trailing={<View><Button label="Remove" variant="destructive" size="sm" onPress={() => void remove()} /></View>}
      last={last}
    />
  );
}
