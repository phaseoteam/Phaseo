import { LegendList } from "@legendapp/list/react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter, type Href } from "expo-router";
import { Camera, ClipboardPaste, MessageSquare, Monitor } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button, Callout, CALLOUT_TONES, EmptyState, ErrorState, Icon, SkeletonRows, Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import { chatStatusLabel } from "./chatState";
import type { DesktopClient } from "./client";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useDesktopChats } from "./hooks";
import { useNeedsYouCount } from "./needsYou";
import type { PhoneChat } from "./protocol";
import type { SavedDesktop } from "./reach";
import { desktopChatHref, newDesktopChatHref } from "./routes";

const PAIR_LINK = "phaseo://pair?p=";

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

/** The paired computers, each with how it's reached and how many chats need you; `onPick` is left out with only one. */
export function DesktopPicker({ desktops, chosenId, onPick }: { desktops: SavedDesktop[]; chosenId: string; onPick?(desktopId: string): void }) {
  return (
    <View className="gap-0.5 pb-2">
      {desktops.map((desktop) => <DesktopOption key={desktop.desktopId} desktop={desktop} selected={Boolean(onPick) && desktop.desktopId === chosenId} onPick={onPick} />)}
    </View>
  );
}

function DesktopOption({ desktop, selected, onPick }: { desktop: SavedDesktop; selected: boolean; onPick?(desktopId: string): void }) {
  const state = useConnection(clientFor(desktop));
  const count = useNeedsYouCount(desktop.desktopId);
  const label = connectionLabel(state);
  const content = (
    <>
      <Icon icon={Monitor} tone="muted" size={18} />
      <View className="flex-1">
        <Text variant="body" numberOfLines={1} className={cn(selected && "font-semibold")}>{desktop.desktopName}</Text>
        <Text variant="caption" numberOfLines={1} className={cn(state.status === "refused" && "text-destructive")}>{label}</Text>
      </View>
      {count ? <Text variant="caption" className="font-semibold text-warning">{count}</Text> : null}
    </>
  );
  const className = cn("mx-2 flex-row items-center gap-3 rounded-md px-3 py-2", selected && "bg-accent");
  const accessibilityLabel = [desktop.desktopName, label, count ? `${count} need you` : null].filter(Boolean).join(", ");
  if (!onPick) return <View accessible accessibilityLabel={accessibilityLabel} className={className}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel} onPress={() => onPick(desktop.desktopId)} className={cn(className, "active:bg-accent")}>
      {content}
    </Pressable>
  );
}

/** With no computer paired: what pairing gives, and the two ways to do it. */
export function PairPrompt() {
  const router = useRouter();
  // A copied pairing link pairs at once; anything else opens the pairing screen to scan or paste there.
  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => "")).replace(/\s+/g, "");
    const p = text.startsWith(PAIR_LINK) ? text.slice(PAIR_LINK.length) : "";
    router.push(p ? { pathname: "/pair", params: { p } } : "/pair");
  };
  return (
    <View className="items-center gap-2 px-8 py-12">
      <View className="mb-1"><Icon icon={Monitor} tone="muted" size={28} /></View>
      <Text variant="heading" className="text-center">Pair a computer</Text>
      <Text variant="muted" className="text-center">Use your chats on Phaseo for desktop from this phone. On the computer, open Settings → Phone, turn on Allow phone access and choose Pair a phone.</Text>
      <View className="mt-3 flex-row flex-wrap justify-center gap-2">
        <Button label="Scan the code" icon={Camera} variant="outline" size="sm" onPress={() => router.push("/pair")} />
        <Button label="Paste the link" icon={ClipboardPaste} variant="outline" size="sm" onPress={() => void paste()} />
      </View>
    </View>
  );
}

/** A paired computer's chats, those that need you first. `open` shows one in the main area. */
export function DesktopChatList({ desktop, selectedChatId, open }: { desktop: SavedDesktop; selectedChatId: string | null; open(href: Href): void }) {
  const client = clientFor(desktop);
  const { desktopId } = desktop;
  const state = useConnection(client);
  const { chats, error, reload, loadMore, loadingMore } = useDesktopChats(client);
  const openChat = useCallback((chat: PhoneChat) => open(desktopChatHref(desktopId, chat.id)), [open, desktopId]);
  const renderItem = useCallback(({ item }: { item: PhoneChat }) => <ChatRow chat={item} selected={item.id === selectedChatId} onOpen={openChat} />, [openChat, selectedChatId]);
  const extraData = useMemo(() => ({ selectedChatId }), [selectedChatId]);
  return (
    <>
      <ConnectionNotice client={client} />
      {chats == null ? (error && state.status === "connected" ? <ErrorState error={new Error(error)} onRetry={reload} /> : <SkeletonRows count={6} />) : (
        <LegendList
          data={chats}
          keyExtractor={(chat) => chat.id}
          renderItem={renderItem}
          extraData={extraData}
          estimatedItemSize={64}
          recycleItems
          onEndReached={loadMore ?? undefined}
          ListFooterComponent={loadingMore ? <SkeletonRows count={2} /> : null}
          ListEmptyComponent={<EmptyState icon={MessageSquare} title="No chats on this computer yet" action="Start a chat" onAction={() => open(newDesktopChatHref(desktopId))} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </>
  );
}

const ChatRow = memo(function ChatRow({ chat, selected, onOpen }: { chat: PhoneChat; selected: boolean; onOpen(chat: PhoneChat): void }) {
  const muted = useToneColor("muted");
  const status = chatStatusLabel(chat);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${chat.title}, ${status}`} onPress={() => onOpen(chat)} className={cn("mx-2 rounded-md px-3 py-2.5 active:bg-accent", selected && "bg-accent")}>
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
