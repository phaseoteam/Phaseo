import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { BookOpenText, Code2, Lightbulb, MessageSquareOff, MoreHorizontal, PenLine, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, EmptyState, Header, Icon, IconButton, measureAnchor, Screen, showActions, Text, type ViewRef } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { useAuth } from "@/providers/AuthProvider";
import { perf } from "@/perf";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { chatActions } from "./chatActions";
import { Composer } from "./Composer";
import { toTurns, type Turn } from "./groups";
import { TurnView } from "./Messages";
import { ModelChipRow, useOpenModelPicker } from "./ModelChips";
import { useChatModelOptions, useModelLabels } from "./models";
import { onChatError, sendMessage, startChat, stopChat } from "./runner";
import { chatModelStore, draftSettingsStore, useChat } from "./state";

/** Routes account errors from any running answer to the screen that can fix them. */
function useChatErrors(chatId: string | null) {
  const router = useRouter();
  useEffect(() => onChatError((id, error) => {
    if (chatId && id !== chatId) return;
    if (error.code === "chat_privacy_review_required") router.push({ pathname: "/sheets/[kind]", params: { kind: "privacy" } });
    else if (error.code === "unauthorized" || error.code === "signed_out") router.push("/sign-in");
  }), [chatId, router]);
}

export function Conversation({ chatId }: { chatId: string }) {
  const router = useRouter();
  const { split, wide } = useLayout();
  const { session } = useAuth();
  const { workspaceId } = useWorkspace();
  const labels = useModelLabels();
  const openPicker = useOpenModelPicker(chatId);
  const moreRef = useRef<ViewRef>(null);
  const { chat, messages } = useChat(chatId);
  const turns = useMemo(() => toTurns(messages, chat?.models ?? []), [messages, chat?.models]);
  const running = messages.some((message) => message.status === "streaming");
  const settings = useMemo(() => chat?.modelSettings ?? {}, [chat?.modelSettings]);
  useChatErrors(chatId);

  const renderItem = useCallback(({ item }: { item: Turn }) => <TurnView turn={item} side={wide && item.answers.length > 1} labels={labels} settings={settings} workspaceId={workspaceId} />, [wide, labels, settings, workspaceId]);

  if (!chat) return <Screen><Header back={!split} /><EmptyState className="flex-1" icon={MessageSquareOff} title="Chat not found" body="It may have been deleted on this device." action="New chat" onAction={() => router.replace("/chat/new")} /></Screen>;

  const openMenu = async () => showActions({ title: chat.title, anchor: await measureAnchor(moreRef), actions: chatActions(chat, { router, onDeleted: () => router.replace("/chat") }) });

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
        <LegendList
          data={turns}
          keyExtractor={(turn) => turn.key}
          renderItem={renderItem}
          extraData={settings}
          estimatedItemSize={240}
          initialScrollAtEnd
          maintainScrollAtEnd
          alignItemsAtEnd
          maintainVisibleContentPosition
          onLoad={perf ? () => perf?.chatShown(chatId, { messages: messages.length, turns: turns.length }) : undefined}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 8 }}
        />
        <Composer
          models={chat.models}
          settings={settings}
          onModelPress={openPicker}
          running={running}
          disabledReason={session || perf?.chatOrigin() ? null : "Sign in to send messages"}
          onSend={(text, attachments) => sendMessage({ chatId, text, attachments, workspaceId })}
          onStop={() => stopChat(chatId)}
        />
      </KeyboardAvoidingView>
    </Screen>
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
