import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { MessageSquare, SquarePen } from "lucide-react-native";
import { memo, useCallback } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button, Callout, CALLOUT_TONES, EmptyState, ErrorState, Header, IconButton, Screen, SkeletonRows, Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import { chatStatusLabel } from "./chatState";
import type { DesktopClient } from "./client";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useDesktopChats } from "./hooks";
import type { PhoneChat } from "./protocol";
import { useDesktop } from "./store";

/** Why the desktop can't be used right now, with a way to try again; nothing while it's connected or connecting. */
export function ConnectionNotice({ client }: { client: DesktopClient }) {
  const state = useConnection(client);
  if (state.status !== "offline" && state.status !== "refused") return null;
  const tone = state.status === "refused" ? "critical" : "warning";
  return (
    <Callout tone={tone} role="status" title={state.status === "refused" ? "Can't use this computer" : "Not connected"} className="mx-4 mb-2">
      <View className="gap-2">
        <Text className={cn("text-[14px] leading-5", CALLOUT_TONES[tone].description)}>{state.message}</Text>
        <Button label="Try again" size="sm" variant="outline" className="self-start" onPress={() => client.retryNow()} />
      </View>
    </Callout>
  );
}

/** A paired desktop's chats, those that need you first. */
export function DesktopChatsScreen({ desktopId }: { desktopId: string }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title="Desktop" /><SkeletonRows count={6} /></Screen>;
  if (!desktop || !client) {
    return (
      <Screen>
        <Header back title="Desktop" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="It may have been removed from this phone. Pair it again from Desktops." />
      </Screen>
    );
  }
  return <ChatsList desktopId={desktopId} name={desktop.desktopName} client={client} />;
}

function ChatsList({ desktopId, name, client }: { desktopId: string; name: string; client: DesktopClient }) {
  const router = useRouter();
  const state = useConnection(client);
  const { chats, error, reload, loadMore, loadingMore } = useDesktopChats(client);
  const open = useCallback((chat: PhoneChat) => router.push({ pathname: "/desktops/[desktopId]/[chatId]", params: { desktopId, chatId: chat.id } }), [router, desktopId]);
  const renderItem = useCallback(({ item }: { item: PhoneChat }) => <ChatRow chat={item} onOpen={open} />, [open]);
  return (
    <Screen>
      <Header back title={name} subtitle={connectionLabel(state)} right={<IconButton icon={SquarePen} label="New chat" onPress={() => router.push({ pathname: "/desktops/[desktopId]/new", params: { desktopId } })} />} />
      <ConnectionNotice client={client} />
      {chats == null ? (error && state.status === "connected" ? <ErrorState error={new Error(error)} onRetry={reload} /> : <SkeletonRows count={6} />) : (
        <LegendList
          data={chats}
          keyExtractor={(chat) => chat.id}
          renderItem={renderItem}
          estimatedItemSize={64}
          recycleItems
          onEndReached={loadMore ?? undefined}
          ListFooterComponent={loadingMore ? <SkeletonRows count={2} /> : null}
          ListEmptyComponent={<EmptyState icon={MessageSquare} title="No chats on this computer yet" action="Start a chat" onAction={() => router.push({ pathname: "/desktops/[desktopId]/new", params: { desktopId } })} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </Screen>
  );
}

const ChatRow = memo(function ChatRow({ chat, onOpen }: { chat: PhoneChat; onOpen(chat: PhoneChat): void }) {
  const muted = useToneColor("muted");
  const status = chatStatusLabel(chat);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${chat.title}, ${status}`} onPress={() => onOpen(chat)} className="mx-2 rounded-md px-3 py-2.5 active:bg-accent">
      <View className="flex-row items-center gap-2">
        {chat.unread ? <View accessibilityLabel="Unread" className="h-2 w-2 rounded-[2px] bg-primary" /> : null}
        <Text variant="body" numberOfLines={1} className={cn("flex-1", chat.unread && "font-semibold")}>{chat.title}</Text>
        <Text variant="caption">{formatRelativeDay(chat.updatedAt)}</Text>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        {chat.status === "running" && !chat.needsYou ? <ActivityIndicator size={10} color={muted} /> : null}
        <Text variant="caption" numberOfLines={1} className={cn("shrink", chat.needsYou && "font-semibold text-warning", chat.status === "failed" && !chat.needsYou && "text-destructive")}>{status}</Text>
        {chat.project ? <Text variant="caption" numberOfLines={1} className="flex-1">{`· ${chat.project}`}</Text> : null}
      </View>
    </Pressable>
  );
});
