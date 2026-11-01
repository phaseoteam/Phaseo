import { LegendList } from "@legendapp/list/react-native";
import { ChevronDown, ChevronRight, CircleAlert, Wrench } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { EmptyState, ErrorState, Header, Icon, Screen, SkeletonRows, Text, toast, useToneColor } from "@/components/ui";
import type { ModelLabel } from "@/features/chat/modelSheetRows";
import { Composer } from "@/features/composer/Composer";
import { ComposerErrorNotice } from "@/features/composer/ComposerNotices";
import { resolveSendPresentation, type FollowUpAction } from "@/features/composer/sendPresentation";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { chatItems, chatStatusLabel, type ChatItem } from "./chatState";
import { DesktopRequestError, type DesktopClient } from "./client";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { openDesktopChat } from "./DesktopConnections";
import { knownModelsOf, useDesktopChat } from "./hooks";
import { threadModel } from "./newThread";
import { PendingCards } from "./PendingCards";
import type { PhoneActivity, PhoneMessage } from "./protocol";
import { useDesktop } from "./store";

const problemText = (error: unknown) => (error instanceof Error ? error.message : "That didn't work.");

/** Tells the person what happened to an action; a held one isn't a failure, so it reads as a note. */
function reportFailure(title: string, error: unknown) {
  haptic("error");
  if (error instanceof DesktopRequestError && error.code === "held") toast(error.message, { title: "Waiting for the computer" });
  else toast(problemText(error), { title, tone: "error" });
}

/** A thread on a paired computer, as its own screen over the Code list: back returns there. */
export function DesktopChatScreen({ desktopId, chatId }: { desktopId: string; chatId: string }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  useEffect(() => {
    openDesktopChat.set({ desktopId, chatId });
    return () => openDesktopChat.set((current) => (current?.chatId === chatId && current.desktopId === desktopId ? null : current));
  }, [desktopId, chatId]);
  if (desktop === undefined) return <Screen><Header back title="Thread" /><SkeletonRows count={5} /></Screen>;
  if (!client || !desktop) {
    return (
      <Screen>
        <Header back title="Thread" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="It may have been removed from this phone. Pair it again from Account → Desktops." />
      </Screen>
    );
  }
  return <ChatView client={client} chatId={chatId} desktopName={desktop.desktopName} />;
}

function ChatView({ client, chatId, desktopName }: { client: DesktopClient; chatId: string; desktopName: string }) {
  const connection = useConnection(client);
  const { view, error, reload, loadEarlier, loadingEarlier, settle } = useDesktopChat(client, chatId);
  const items = useMemo(() => (view ? chatItems(view.entries) : []), [view]);
  const chat = view?.chat;
  const running = chat?.status === "running";
  const lastId = view?.entries.at(-1)?.id;
  const model = chat ? threadModel(chat, knownModelsOf(client)) : null;

  const stop = async () => {
    haptic("press");
    try { await client.request("stop", { chatId }); } catch (problem) { reportFailure("Couldn't stop it", problem); }
  };

  const renderItem = useCallback(({ item }: { item: ChatItem }) => (item.kind === "message"
    ? <MessageRow message={item.message} streaming={running && item.message.id === lastId && item.message.role === "assistant" && !item.message.completedAt} />
    : <ActivityGroup activities={item.activities} />), [running, lastId]);

  return (
    <Screen>
      <Header
        back
        title={chat?.title ?? "Thread"}
        subtitle={[chat ? chatStatusLabel(chat) : connectionLabel(connection), chat?.project, desktopName].filter(Boolean).join(" · ")}
      />
      <ConnectionNotice client={client} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {!view ? (error && connection.status === "connected" ? <ErrorState className="flex-1" error={new Error(error)} onRetry={reload} /> : <SkeletonRows count={5} />) : (
          <LegendList
            data={items}
            keyExtractor={(item) => (item.kind === "message" ? item.message.id : item.id)}
            getItemType={(item) => item.kind}
            renderItem={renderItem}
            extraData={`${running}:${lastId}`}
            estimatedItemSize={80}
            initialScrollAtEnd
            maintainScrollAtEnd
            alignItemsAtEnd
            onStartReached={loadEarlier ?? undefined}
            onStartReachedThreshold={1}
            ListHeaderComponent={loadingEarlier ? <SkeletonRows count={2} /> : view.earlier > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => void loadEarlier?.()} className="self-center rounded-md px-3 py-2 active:bg-accent">
                <Text variant="caption" className="font-semibold text-link">{`Show ${view.earlier} earlier ${view.earlier === 1 ? "message" : "messages"}`}</Text>
              </Pressable>
            ) : null}
            ListEmptyComponent={<EmptyState title="No messages yet" />}
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingBottom: 12 }}
          />
        )}
        {chat ? (
          <DesktopComposer
            client={client}
            chatId={chatId}
            running={running}
            model={model}
            // A Phaseo model id names its lab before the slash; another agent's model shows its initial.
            logo={model && chat.model ? <Logo id={chat.model.includes("/") ? chat.model.split("/")[0] : null} label={model.model} size={18} /> : null}
            onStop={() => void stop()}
            above={<PendingCards client={client} chatId={chatId} approvals={chat.approvals} questions={chat.questions} onSettled={settle} onStop={running ? () => void stop() : null} onFailure={reportFailure} />}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const MessageRow = memo(function MessageRow({ message, streaming }: { message: PhoneMessage; streaming: boolean }) {
  const cut = message.truncated ? <Text variant="caption" className="mt-1">Shortened for the phone. Open the chat on the computer to read all of it.</Text> : null;
  if (message.role === "user") {
    return (
      <View className="items-end px-4 pt-3">
        {message.delivery === "steer" ? <Text variant="caption" className="mb-1">Steered the running turn</Text> : null}
        <View className="max-w-[85%] rounded-md bg-foreground px-4 py-2.5">
          <Text variant="body" className="text-background" selectable>{message.text}</Text>
        </View>
        {message.attachments?.length ? <Text variant="caption" className="mt-1">{message.attachments.map((file) => file.name).join(", ")}</Text> : null}
        {cut}
      </View>
    );
  }
  if (message.role === "assistant") {
    return (
      <View className="px-4 pt-4">
        {message.text ? <Markdown text={message.text} streaming={streaming} /> : streaming ? <Waiting label="Working…" /> : null}
        {message.notice ? <Text variant="caption" className="mt-1">{message.notice}</Text> : null}
        {cut}
      </View>
    );
  }
  // System and tool messages are context, not conversation.
  return (
    <View className="px-4 pt-3">
      <Text variant="caption" numberOfLines={6} selectable>{message.notice ?? message.text}</Text>
    </View>
  );
});

function Waiting({ label }: { label: string }) {
  const color = useToneColor("muted");
  return (
    <View className="flex-row items-center gap-2 py-2">
      <ActivityIndicator size="small" color={color} />
      <Text variant="muted">{label}</Text>
    </View>
  );
}

/** A run of tool calls, reasoning and plan updates, folded to one line until opened. */
function ActivityGroup({ activities }: { activities: PhoneActivity[] }) {
  const [open, setOpen] = useState(false);
  const color = useToneColor("muted");
  const running = activities.some((activity) => activity.status === "running");
  const failed = activities.some((activity) => activity.status === "failed");
  const latest = activities.at(-1)!;
  const summary = activities.length === 1 ? latest.title : `${activities.length} steps · ${latest.title}`;
  return (
    <View className="px-4 pt-3">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="-ml-1 flex-row items-center gap-1.5 self-start rounded-md px-1 py-1 active:bg-accent">
        <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
        {running ? <ActivityIndicator size={10} color={color} /> : failed ? <Icon icon={CircleAlert} tone="destructive" size={13} /> : <Icon icon={Wrench} tone="muted" size={13} />}
        <Text variant="caption" numberOfLines={1} className="shrink font-semibold">{summary}</Text>
      </Pressable>
      {open ? (
        <View className="mt-1 gap-2 border-l-2 border-border pl-3">
          {activities.map((activity) => (
            <View key={activity.id}>
              <Text variant="small" className={cn("font-semibold", activity.status === "failed" && "text-destructive")}>{activity.title}</Text>
              {activity.summary || activity.text ? <Text variant="caption" numberOfLines={8} selectable>{activity.summary ?? activity.text}</Text> : null}
              {activity.steps?.map((step, index) => <Text key={index} variant="caption">{`${step.status === "completed" ? "✓" : "·"} ${step.text}`}</Text>)}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The thread's composer: send, or while a turn runs, steer it (a long press queues the message on the computer
 * instead). The model shows read-only: a phone can't change it on a thread that exists. Attachments and `/` commands
 * aren't offered, as the phone protocol carries neither.
 */
function DesktopComposer({ client, chatId, running, model, logo, above, onStop }: { client: DesktopClient; chatId: string; running: boolean; model: ModelLabel | null; logo: ReactNode; above: ReactNode; onStop(): void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presentation = resolveSendPresentation({ editingQueuedMessage: false, running, canSteer: running, followUpBehavior: "steer", deliveryDeferred: false });
  const send = async (action?: FollowUpAction) => {
    const value = text.trim();
    if (!value || sending) return;
    const steer = running && (action ?? presentation.action) === "steer";
    setSending(true);
    setText("");
    setError(null);
    try {
      await client.request("send", { chatId, text: value, ...(steer ? { steer: true } : {}) });
    } catch (problem) {
      // Not sent (or not known to be): the text comes back so nothing typed is lost.
      if (problem instanceof DesktopRequestError && problem.code === "held") {
        reportFailure("Couldn't send", problem);
      } else {
        haptic("error");
        setText((current) => current || value);
        setError(problemText(problem));
      }
    } finally {
      setSending(false);
    }
  };
  return (
    <Composer
      text={text}
      onChangeText={setText}
      placeholder="Ask anything"
      onAttach={null}
      model={model ? { label: model, logos: logo, readOnlyReason: "Change it on the computer" } : null}
      send={presentation}
      sendBlockedReason={sending ? "Sending…" : null}
      onSend={(action) => void send(action)}
      onStop={running ? onStop : null}
      above={(
        <>
          {above}
          {error ? <ComposerErrorNotice message={error} onDismiss={() => setError(null)} /> : null}
        </>
      )}
    />
  );
}
