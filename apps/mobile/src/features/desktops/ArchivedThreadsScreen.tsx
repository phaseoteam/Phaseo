import { LegendList } from "@legendapp/list/react-native";
import { Archive } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, EmptyState, ErrorState, Header, Screen, SkeletonRows, Text } from "@/components/ui";
import { formatRelativeDay } from "@/lib/format";
import { mergeArchived } from "./chatState";
import type { ClientEvent, DesktopClient } from "./client";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useClientEvents, useConnection } from "./connections";
import { changeChat } from "./organise";
import type { PhoneChat } from "./protocol";
import { useDesktop } from "./store";
import { organises } from "./threadActions";

/** A computer's archived threads, newest first, each with Restore; restored ones go back to the sidebar. */
export function ArchivedThreadsScreen({ desktopId }: { desktopId: string }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title="Archived threads" /><SkeletonRows count={5} /></Screen>;
  if (!client || !desktop) {
    return (
      <Screen>
        <Header back title="Archived threads" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." />
      </Screen>
    );
  }
  return <ArchivedList client={client} desktopName={desktop.desktopName} />;
}

function ArchivedList({ client, desktopName }: { client: DesktopClient; desktopName: string }) {
  const connection = useConnection(client);
  const protocol = connection.status === "connected" ? connection.protocol : 0;
  const [chats, setChats] = useState<PhoneChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!organises(protocol)) return;
    client.request("list_chats", { archived: true }).then((page) => { setChats(page.chats); setError(null); }, (problem: unknown) => setError(problem instanceof Error ? problem.message : "Couldn't read the archive."));
  }, [client, protocol]);
  useEffect(load, [load]);
  useClientEvents(client, useCallback((event: ClientEvent) => {
    if (event.type === "chat_updated") setChats((current) => (current ? mergeArchived(current, event.chat) : current));
  }, []));
  const subtitle = `${desktopName} · ${connectionLabel(connection)}`;
  const older = connection.status === "connected" && !organises(protocol);
  return (
    <Screen>
      <Header back title="Archived threads" subtitle={subtitle} />
      <ConnectionNotice client={client} />
      {older ? <EmptyState className="flex-1" icon={Archive} title="Update Phaseo on the computer" body="This computer's version of Phaseo can't list archived threads yet." />
        : chats == null ? (error ? <ErrorState className="flex-1" error={new Error(error)} onRetry={load} /> : <SkeletonRows count={6} />) : (
          <LegendList
            data={chats}
            keyExtractor={(chat) => chat.id}
            renderItem={({ item }) => (
              <View className="flex-row items-center gap-3 border-b border-border px-5 py-2.5">
                <View className="flex-1">
                  <Text variant="body" numberOfLines={1}>{item.title}</Text>
                  <Text variant="caption" numberOfLines={1}>{[item.project ?? "No project", formatRelativeDay(item.updatedAt)].join(" · ")}</Text>
                </View>
                <Button label="Restore" size="sm" variant="outline" onPress={() => void changeChat(client, item, { action: "unarchive" })} />
              </View>
            )}
            estimatedItemSize={56}
            ListEmptyComponent={<EmptyState icon={Archive} title="No archived threads" body="Threads you archive on the computer or from this phone are kept here." />}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
    </Screen>
  );
}
