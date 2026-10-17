import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { MessageSquare } from "lucide-react-native";
import { useCallback, useEffect, useMemo } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, EmptyState, Header, Screen, Text } from "@/components/ui";
import { useCatalogueIndex } from "@/features/models/state";
import { useLayout } from "@/hooks/useLayout";
import { isChatModel, modelName } from "@/lib/catalogue";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { Composer } from "./Composer";
import { toTurns, type Turn } from "./groups";
import { TurnView } from "./Messages";
import { onChatError, sendMessage, startChat, stopChat } from "./runner";
import { chatModelStore, useChat } from "./state";

export function useModelLabel() {
  const { index } = useCatalogueIndex();
  return useCallback((id: string | null) => {
    if (!id) return "Model";
    const card = index.get(id);
    return card ? modelName(card) : id.split("/").at(-1) ?? id;
  }, [index]);
}

export function modelsLabel(models: string[], label: (id: string) => string) {
  if (!models.length) return "Choose a model";
  if (models.length === 1) return label(models[0]!);
  return `${label(models[0]!)} +${models.length - 1}`;
}

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
  const label = useModelLabel();
  const { chat, messages } = useChat(chatId);
  const turns = useMemo(() => toTurns(messages, chat?.models ?? []), [messages, chat?.models]);
  const running = messages.some((message) => message.status === "streaming");
  useChatErrors(chatId);

  const renderItem = useCallback(({ item }: { item: Turn }) => <TurnView turn={item} side={wide && item.answers.length > 1} modelName={label} workspaceId={workspaceId} />, [wide, label, workspaceId]);

  if (!chat) return <Screen><Header back={!split} /><EmptyState className="flex-1" title="Chat not found" body="It may have been deleted on this phone." /></Screen>;

  return (
    <Screen>
      <Header back={!split} title={chat.title} subtitle={chat.models.map(label).join(", ")} />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <LegendList
          data={turns}
          keyExtractor={(turn) => turn.key}
          renderItem={renderItem}
          estimatedItemSize={240}
          initialScrollAtEnd
          maintainScrollAtEnd
          alignItemsAtEnd
          maintainVisibleContentPosition
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
        />
        <Composer
          modelLabel={modelsLabel(chat.models, label)}
          onModelPress={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "chat-models", chatId } })}
          running={running}
          disabledReason={session ? null : "Sign in to send messages"}
          onSend={(text, attachments) => sendMessage({ chatId, text, attachments, workspaceId })}
          onStop={() => stopChat(chatId)}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function NewChat({ initialModel }: { initialModel?: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { session } = useAuth();
  const { workspaceId } = useWorkspace();
  const label = useModelLabel();
  const { index } = useCatalogueIndex();
  const models = chatModelStore.use();
  useChatErrors(null);

  useEffect(() => {
    if (initialModel) chatModelStore.set([initialModel]);
  }, [initialModel]);

  // With no saved choice, start on Phaseo's free router so a first chat costs nothing.
  useEffect(() => {
    if (!models.length && index.size) chatModelStore.set([index.has("phaseo/free") ? "phaseo/free" : [...index.values()].find(isChatModel)?.model_id ?? ""].filter(Boolean));
  }, [models.length, index]);

  return (
    <Screen>
      <Header back={!split} title="New chat" />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 items-center justify-center px-8">
          <EmptyState icon={MessageSquare} title={models.length > 1 ? "Ask several models at once" : "What can I help with?"} body="This chat is saved only on this phone. Messages go through your Phaseo workspace." />
          {!session ? <Button label="Sign in to chat" onPress={() => router.push("/sign-in")} /> : null}
          {models.length > 1 ? <Text variant="caption" className="mt-2 text-center">{models.map(label).join(" · ")}</Text> : null}
        </View>
        <Composer
          autoFocus={Boolean(session)}
          modelLabel={modelsLabel(models, label)}
          onModelPress={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "chat-models" } })}
          running={false}
          disabledReason={!session ? "Sign in to send messages" : !models.length ? "Choose a model first" : null}
          onSend={(text, attachments) => {
            const id = startChat({ text, attachments, models, workspaceId });
            router.replace(`/chat/${id}`);
          }}
          onStop={() => undefined}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
