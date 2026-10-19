import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { ArrowDown, BookOpenText, Code2, Lightbulb, MessageSquareOff, MoreHorizontal, PenLine, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, EmptyState, Header, Icon, IconButton, measureAnchor, Screen, showActions, Text, useToneColor, type ViewRef } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { useAuth } from "@/providers/AuthProvider";
import { perf } from "@/perf";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { chatActions } from "./chatActions";
import { Composer } from "./Composer";
import { buildItems, reconcileItems, type ConversationItem } from "./conversationItems";
import { newestMatch } from "./db";
import { getLive, liveShapes } from "./live";
import { ConversationContext, ConversationRow, selectedAnswers } from "./Messages";
import { ModelChipRow, useOpenModelPicker } from "./ModelChips";
import { useChatModelOptions, useModelLabels } from "./models";
import { onChatError, sendMessage, startChat, stopChat } from "./runner";
import { chatModelStore, draftSettingsStore, useChat, useChatRunning } from "./state";
import { chatReloaded, useChatWindow } from "./window";

/** Routes account errors from any running answer to the screen that can fix them. */
function useChatErrors(chatId: string | null) {
  const router = useRouter();
  useEffect(() => onChatError((id, error) => {
    if (chatId && id !== chatId) return;
    if (error.code === "chat_privacy_review_required") router.push({ pathname: "/sheets/[kind]", params: { kind: "privacy" } });
    else if (error.code === "unauthorized" || error.code === "signed_out") router.push("/sign-in");
  }), [chatId, router]);
}

const EMPTY: string[] = [];

export function Conversation({ chatId, focusMessage, search }: { chatId: string; focusMessage?: string | null; search?: string | null }) {
  const router = useRouter();
  const { split, wide } = useLayout();
  const { session } = useAuth();
  const { workspaceId } = useWorkspace();
  const labels = useModelLabels();
  const openPicker = useOpenModelPicker(chatId);
  const moreRef = useRef<ViewRef>(null);
  const listRef = useRef<LegendListRef>(null);
  const { chat } = useChat(chatId);
  // A link to a message, or a search result, opens the chat around that message.
  const [focus] = useState(() => focusMessage ?? (search ? newestMatch(chatId, search) : null));
  const window = useChatWindow(chatId, focus);
  const running = useChatRunning(chatId);
  const selected = selectedAnswers.use();
  const shapes = liveShapes.use();
  const models = chat?.models ?? EMPTY;
  const settings = useMemo(() => chat?.modelSettings ?? {}, [chat?.modelSettings]);
  const built = useMemo(() => {
    void shapes;
    return buildItems({ messages: window.messages, summaries: window.summaries, models, side: wide, selected, live: getLive });
  }, [window.messages, window.summaries, models, wide, selected, shapes]);
  // Rows that didn't change keep their object, so memoised rows skip rendering (state adjusted during render).
  const [stable, setStable] = useState({ source: built, items: built });
  let items = stable.items;
  if (stable.source !== built) {
    items = reconcileItems(stable.items, built);
    setStable({ source: built, items });
  }
  const [initialIndex] = useState(() => (focus ? items.findIndex((item) => item.key === `user:${focus}` || item.key === `answer:${focus}:0`) : -1));
  const context = useMemo(() => ({ chatId, labels, settings, workspaceId, focus }), [chatId, labels, settings, workspaceId, focus]);
  const [away, setAway] = useState(false);
  useChatErrors(chatId);

  const renderItem = useCallback(({ item }: { item: ConversationItem }) => <ConversationRow item={item} />, []);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const next = contentSize.height - layoutMeasurement.height - contentOffset.y > layoutMeasurement.height * 1.5;
    setAway((current) => (current === next ? current : next));
  }, []);

  if (!chat) return <Screen><Header back={!split} /><EmptyState className="flex-1" icon={MessageSquareOff} title="Chat not found" body="It may have been deleted on this device." action="New chat" onAction={() => router.replace("/chat/new")} /></Screen>;

  const openMenu = async () => {
    const anchor = await measureAnchor(moreRef);
    showActions({ title: chat.title, anchor, actions: chatActions(chat, { router, anchor, onDeleted: () => router.replace("/chat") }) });
  };
  const jumpToLatest = () => {
    if (window.hasLater) window.latest();
    else void listRef.current?.scrollToEnd({ animated: true });
  };
  const atFocus = Boolean(focus) && window.generation === 0 && initialIndex >= 0;

  return (
    <Screen>
      <Header
        back={!split}
        title={chat.title}
        right={<View ref={moreRef} collapsable={false}><IconButton icon={MoreHorizontal} label="Chat actions" onPress={() => void openMenu()} /></View>}
      />
      <ModelChipRow chatId={chatId} models={chat.models} settings={settings} className="pb-2" />
      <View className="h-px bg-border" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1">
        <ConversationContext.Provider value={context}>
          <LegendList
            ref={listRef}
            data={items}
            dataKey={window.generation}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.type}
            renderItem={renderItem}
            estimatedItemSize={220}
            initialScrollAtEnd={!atFocus}
            initialScrollIndex={atFocus ? { index: initialIndex, viewPosition: 0 } : undefined}
            maintainScrollAtEnd={!window.hasLater}
            alignItemsAtEnd
            maintainVisibleContentPosition
            // Pages load ahead of either end as the reader scrolls towards it (desktop's paging), two screens early for fast flings.
            onStartReached={window.older}
            onStartReachedThreshold={2}
            onEndReached={window.newer}
            onEndReachedThreshold={2}
            onScroll={onScroll}
            onLoad={perf ? () => perf?.chatShown(chatId, { messages: window.messages.length, items: items.length }) : undefined}
            ListHeaderComponent={window.hasEarlier || window.error ? <PageEdge loading={window.loading === "older"} error={window.error} onRetry={window.older} /> : null}
            ListFooterComponent={window.hasLater ? <PageEdge loading={window.loading === "newer"} error={null} onRetry={window.newer} /> : null}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 8 }}
          />
        </ConversationContext.Provider>
        {away || window.hasLater ? (
          <View pointerEvents="box-none" className="absolute bottom-3 left-0 right-0 items-center">
            <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest" onPress={jumpToLatest} className="h-9 flex-row items-center gap-1.5 rounded-md border border-border bg-background px-3 shadow-sm active:bg-accent">
              <Icon icon={ArrowDown} tone="foreground" size={15} />
              <Text variant="small" className="font-semibold">Jump to latest</Text>
            </Pressable>
          </View>
        ) : null}
        </View>
        <Composer
          models={chat.models}
          settings={settings}
          onModelPress={openPicker}
          running={running}
          disabledReason={session || perf?.chatOrigin() ? null : "Sign in to send messages"}
          onSend={(text, attachments) => {
            const behind = window.hasLater;
            sendMessage({ chatId, text, attachments, workspaceId });
            if (behind) chatReloaded(chatId);
            else void listRef.current?.scrollToEnd({ animated: true });
          }}
          onStop={() => stopChat(chatId)}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The top or bottom of a window that has more beyond it: a spinner while the next page loads. */
function PageEdge({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry(): void }) {
  const muted = useToneColor("muted");
  return (
    <View className="h-12 items-center justify-center">
      {error ? (
        <Pressable accessibilityRole="button" onPress={onRetry} className="rounded-md px-3 py-2 active:bg-accent">
          <Text variant="caption" className="text-link">{"Couldn't load these messages. Try again"}</Text>
        </Pressable>
      ) : loading ? <ActivityIndicator size="small" color={muted} /> : null}
    </View>
  );
}

type DayPeriod = "morning" | "afternoon" | "evening";
const dayPeriod = (hour: number): DayPeriod => (hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");

/** The website's prompt starters (ChatMessagesEmptyState), which change with the time of day. */
const STARTERS: Record<DayPeriod, { label: string; prompt: string; icon: LucideIcon }[]> = {
  morning: [
    { label: "Plan my day", prompt: "Help me make a focused plan for today.", icon: Lightbulb },
    { label: "Draft something", prompt: "Help me draft something clear and concise.", icon: PenLine },
    { label: "Learn a topic", prompt: "Teach me something useful in simple terms.", icon: BookOpenText },
    { label: "Build an idea", prompt: "Help me turn an idea into a practical first version.", icon: Code2 },
  ],
  afternoon: [
    { label: "Solve a problem", prompt: "Help me work through a problem step by step.", icon: Lightbulb },
    { label: "Improve my writing", prompt: "Help me improve a piece of writing.", icon: PenLine },
    { label: "Explain anything", prompt: "Explain a complex topic in a clear way.", icon: BookOpenText },
    { label: "Prototype an idea", prompt: "Help me prototype an idea quickly.", icon: Code2 },
  ],
  evening: [
    { label: "Reflect on today", prompt: "Help me reflect on today and identify what matters next.", icon: Lightbulb },
    { label: "Write creatively", prompt: "Help me write something imaginative.", icon: PenLine },
    { label: "Explore a question", prompt: "Help me explore an interesting question.", icon: BookOpenText },
    { label: "Make something", prompt: "Help me make a small useful project.", icon: Code2 },
  ],
};

export function NewChat({ initialModel }: { initialModel?: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { session } = useAuth();
  const { workspaceId } = useWorkspace();
  const { options } = useChatModelOptions();
  const models = chatModelStore.use();
  const settings = draftSettingsStore.use();
  const openPicker = useOpenModelPicker(null);
  const [period] = useState(() => dayPeriod(new Date().getHours()));
  const [seed, setSeed] = useState<{ key: number; text: string } | null>(null);
  useChatErrors(null);

  useEffect(() => {
    if (initialModel) chatModelStore.set([initialModel]);
  }, [initialModel]);

  // With no saved choice, start on Phaseo's free router so a first chat costs nothing.
  useEffect(() => {
    if (models.length || !options.length) return;
    const first = options.find((option) => option.modelId === "phaseo/free") ?? options.find((option) => option.status === "active");
    if (first) chatModelStore.set([first.modelId]);
  }, [models.length, options]);

  return (
    <Screen>
      <Header back={!split} title="New chat" />
      <ModelChipRow chatId={null} models={models} settings={settings} className="pb-2" />
      <View className="h-px bg-border" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow justify-center px-5 py-8">
          <View className="w-full max-w-[560px] self-center">
            <Text variant="display" className="text-center text-[26px]">{`Good ${period}`}</Text>
            <Text variant="muted" className="mt-1.5 text-center">{models.length > 1 ? `${models.length} models will answer side by side.` : "What can I help you think through?"}</Text>
            {session ? (
              <View className="mt-7 gap-2">
                {STARTERS[period].map((starter) => (
                  <Pressable key={starter.label} accessibilityRole="button" accessibilityHint="Puts this prompt in the message box" onPress={() => setSeed({ key: Date.now(), text: starter.prompt })} className="min-h-12 flex-row items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 active:bg-accent">
                    <Icon icon={starter.icon} tone="muted" size={16} />
                    <Text variant="small" className="flex-1 font-medium">{starter.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View className="mt-7 items-center"><Button label="Sign in to chat" onPress={() => router.push("/sign-in")} /></View>
            )}
            <Text variant="caption" className="mt-6 text-center">Chats are saved only on this device. Messages go through your Phaseo workspace.</Text>
          </View>
        </ScrollView>
        <Composer
          autoFocus={false}
          seed={seed}
          models={models}
          settings={settings}
          onModelPress={openPicker}
          running={false}
          disabledReason={!session && !perf?.chatOrigin() ? "Sign in to send messages" : !models.length ? "Choose a model first" : null}
          onSend={(text, attachments) => {
            const id = startChat({ text, attachments, models, modelSettings: settings, workspaceId });
            draftSettingsStore.set({});
            router.replace(`/chat/${id}`);
          }}
          onStop={() => undefined}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
