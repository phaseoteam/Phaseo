import { LegendList } from "@legendapp/list/react-native";
import { Archive } from "lucide-react-native";
import { View } from "react-native";
import { Button, EmptyState, ErrorState, Header, Screen, SkeletonRows, Text } from "@/components/ui";
import { formatRelativeDay } from "@/lib/format";
import type { DesktopClient } from "./client";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useArchivedChats } from "./hooks";
import { changeChat } from "./organise";
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
  const { chats, error, reload, loadMore, loadingMore } = useArchivedChats(organises(protocol) ? client : null);
  const subtitle = `${desktopName} · ${connectionLabel(connection)}`;
  const older = connection.status === "connected" && !organises(protocol);
  return (
    <Screen>
      <Header back title="Archived threads" subtitle={subtitle} />
      <ConnectionNotice client={client} />
      {older ? <EmptyState className="flex-1" icon={Archive} title="Update Phaseo on the computer" body="This computer's version of Phaseo can't list archived threads yet." />
        : chats == null ? (error ? <ErrorState className="flex-1" error={new Error(error)} onRetry={reload} /> : <SkeletonRows count={6} />) : (
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
            onEndReached={loadMore ?? undefined}
            ListFooterComponent={loadingMore ? <SkeletonRows count={2} /> : null}
            ListEmptyComponent={<EmptyState icon={Archive} title="No archived threads" body="Threads you archive on the computer or from this phone are kept here." />}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
    </Screen>
  );
}
