import { LegendList } from "@legendapp/list/react-native";
import { usePathname, useRouter } from "expo-router";
import { MessageSquare, Pin, SquarePen } from "lucide-react-native";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { EmptyState, Header, Icon, IconButton, pointAnchor, Screen, SearchField, showActions, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import { perf } from "@/perf";
import { chatActions } from "./chatActions";
import { searchChats } from "./db";
import { groupChats, type ChatListItem } from "./groups";
import { ModelLogoStack } from "./ModelChips";
import { useModelLabels } from "./models";
import { useChats } from "./state";

export function ChatList() {
  perf?.chatListRender();
  const router = useRouter();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/chat");
  const chats = useChats();
  const labels = useModelLabels();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const visible = useMemo(() => {
    if (!deferred) return chats;
    const matches = new Set(searchChats(deferred));
    const lower = deferred.toLocaleLowerCase();
    return chats.filter((chat) => matches.has(chat.id) || chat.title.toLocaleLowerCase().includes(lower));
  }, [chats, deferred]);
  const items = useMemo(() => groupChats(visible), [visible]);
  const selectedId = pathname.startsWith("/chat/") ? pathname.slice("/chat/".length) : null;
  const extraData = useMemo(() => ({ selectedId, labels }), [selectedId, labels]);

  const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === "header") return <Text variant="label" className="px-4 pb-1.5 pt-5 text-muted-foreground">{item.title}</Text>;
    const chat = item.chat;
    const models = chat.models.map((model) => labels(model, chat.modelSettings[model]).label);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chat.title}
        accessibilityHint="Long press for rename, pin and delete"
        onPress={() => { perf?.chatTapped(chat.id); openDetail(`/chat/${chat.id}`); }}
        onLongPress={(event) => showActions({ title: chat.title, anchor: pointAnchor(event), actions: chatActions(chat, { router, onDeleted: () => { if (selectedId === chat.id) router.replace("/chat"); } }) })}
        delayLongPress={300}
        className={cn("mx-2 rounded-md px-3 py-2.5 active:bg-accent", selectedId === chat.id && "bg-accent")}
      >
        <View className="flex-row items-center gap-2">
          {chat.pinned ? <Icon icon={Pin} tone="muted" size={13} /> : null}
          <Text variant="body" numberOfLines={1} className="flex-1 font-semibold">{chat.title}</Text>
          <Text variant="caption">{formatRelativeDay(chat.updatedAt)}</Text>
        </View>
        <View className="mt-1 flex-row items-center gap-2">
          {chat.models.length ? <ModelLogoStack models={chat.models} size={14} /> : null}
          <Text variant="caption" numberOfLines={1} className="flex-1">{chat.preview || (models.length > 1 ? `${models.length} models` : models[0] ?? "")}</Text>
        </View>
      </Pressable>
    );
  }, [openDetail, router, selectedId, labels]);

  return (
    <Screen>
      <Header large title="Chat" right={<IconButton icon={SquarePen} label="New chat" onPress={() => openDetail("/chat/new")} />} />
      <View className="px-4 pb-1"><SearchField value={query} onChangeText={setQuery} placeholder="Search chats" /></View>
      <LegendList
        data={items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        renderItem={renderItem}
        extraData={extraData}
        estimatedItemSize={60}
        onLoad={perf ? () => perf?.chatListLoaded(items.length) : undefined}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={deferred
          ? <EmptyState title="No chats match" body="Search looks through titles and messages." />
          : <EmptyState icon={MessageSquare} title="No chats yet" body="Chats are saved only on this device. Ask one model, or several side by side." action="Start a chat" onAction={() => openDetail("/chat/new")} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </Screen>
  );
}
