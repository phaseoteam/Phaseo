import { LegendList } from "@legendapp/list/react-native";
import { usePathname, useRouter } from "expo-router";
import { MessageSquare, Pin, SquarePen } from "lucide-react-native";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, View } from "react-native";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { EmptyState, Header, Icon, IconButton, Screen, SearchField, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import { deleteChat, searchChats, updateChat } from "./db";
import { groupChats, type ChatListItem } from "./groups";
import { notifyChats, useChats } from "./state";
import type { Chat } from "./types";

export function ChatList() {
  const router = useRouter();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/chat");
  const chats = useChats();
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

  const actions = useCallback((chat: Chat) => {
    const run = (choice: "pin" | "rename" | "delete") => {
      if (choice === "pin") { updateChat(chat.id, { pinned: !chat.pinned }); notifyChats(); }
      if (choice === "rename") {
        if (Platform.OS === "ios") Alert.prompt("Rename chat", undefined, (title) => { if (title?.trim()) { updateChat(chat.id, { title: title.trim() }); notifyChats(); } }, "plain-text", chat.title);
        else router.push({ pathname: "/sheets/[kind]", params: { kind: "rename-chat", id: chat.id } });
      }
      if (choice === "delete") {
        Alert.alert("Delete this chat?", "It's only stored on this phone, so it can't be recovered.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => { deleteChat(chat.id); notifyChats(); if (selectedId === chat.id) router.replace("/chat"); } },
        ]);
      }
    };
    const labels = [chat.pinned ? "Unpin" : "Pin", "Rename", "Delete"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...labels, "Cancel"], destructiveButtonIndex: 2, cancelButtonIndex: 3 }, (index) => { if (index < 3) run((["pin", "rename", "delete"] as const)[index]!); });
    } else {
      Alert.alert(chat.title, undefined, [
        { text: labels[0]!, onPress: () => run("pin") },
        { text: "Rename", onPress: () => run("rename") },
        { text: "Delete", style: "destructive", onPress: () => run("delete") },
      ], { cancelable: true });
    }
  }, [router, selectedId]);

  const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === "header") return <Text variant="label" className="px-4 pb-1 pt-5">{item.title}</Text>;
    const chat = item.chat;
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => openDetail(`/chat/${chat.id}`)}
        onLongPress={() => actions(chat)}
        className={cn("mx-2 rounded-lg px-3 py-2.5 active:bg-accent", selectedId === chat.id && "bg-accent")}
      >
        <View className="flex-row items-center gap-2">
          {chat.pinned ? <Icon icon={Pin} tone="muted" size={13} /> : null}
          <Text variant="body" numberOfLines={1} className="flex-1 font-semibold">{chat.title}</Text>
          <Text variant="caption">{formatRelativeDay(chat.updatedAt)}</Text>
        </View>
        {chat.preview ? <Text variant="caption" numberOfLines={1} className="mt-0.5">{chat.models.length > 1 ? `${chat.models.length} models · ` : ""}{chat.preview}</Text> : null}
      </Pressable>
    );
  }, [openDetail, actions, selectedId]);

  return (
    <Screen>
      <Header large title="Chat" right={<IconButton icon={SquarePen} label="New chat" onPress={() => openDetail("/chat/new")} />} />
      <View className="px-4 pb-1"><SearchField value={query} onChangeText={setQuery} placeholder="Search chats" /></View>
      <LegendList
        data={items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        renderItem={renderItem}
        extraData={selectedId}
        estimatedItemSize={56}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={deferred
          ? <EmptyState title="No chats match" body="Search looks through titles and messages." />
          : <EmptyState icon={MessageSquare} title="No chats yet" body="Chats are saved only on this phone." action="Start a chat" onAction={() => openDetail("/chat/new")} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </Screen>
  );
}
