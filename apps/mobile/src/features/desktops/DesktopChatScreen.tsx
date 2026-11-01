import { LegendList } from "@legendapp/list/react-native";
import { ArrowUp, Check, ChevronDown, ChevronRight, CircleAlert, Square, Wrench, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Markdown } from "@/components/Markdown";
import { Button, Chip, EmptyState, ErrorState, Header, Icon, IconButton, Screen, SkeletonRows, Text, TextField, toast, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { chatItems, chatStatusLabel, type ChatItem } from "./chatState";
import { DesktopRequestError, type DesktopClient } from "./client";
import { ModelControl } from "@/features/chat/ModelSheet";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { openDesktopChat } from "./DesktopConnections";
import { knownModelsOf, useDesktopChat } from "./hooks";
import { threadModelLabel } from "./newThread";
import type { PhoneActivity, PhoneApproval, PhoneMessage, PhoneQuestionRequest } from "./protocol";
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
        right={running ? <IconButton icon={Square} label="Stop" onPress={() => void stop()} size={18} /> : null}
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
          <>
            <Pending client={client} chatId={chatId} approvals={chat.approvals} questions={chat.questions} onSettled={settle} />
            <DesktopComposer client={client} chatId={chatId} running={running} model={threadModelLabel(chat, knownModelsOf(client))} onStop={() => void stop()} />
          </>
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

/** What the chat waits on: approvals (accept or decline only; the phone can't change permissions) and questions. */
function Pending({ client, chatId, approvals, questions, onSettled }: { client: DesktopClient; chatId: string; approvals: PhoneApproval[]; questions: PhoneQuestionRequest[]; onSettled(kind: "approval" | "question", id: string): void }) {
  if (!approvals.length && !questions.length) return null;
  return (
    <ScrollView className="max-h-[50%] grow-0 border-t border-border" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-1">
      {approvals.map((approval) => <ApprovalCard key={approval.id} client={client} chatId={chatId} approval={approval} onSettled={() => onSettled("approval", approval.id)} />)}
      {questions.map((request) => <QuestionCard key={request.id} client={client} chatId={chatId} request={request} onSettled={() => onSettled("question", request.id)} />)}
    </ScrollView>
  );
}

function ApprovalCard({ client, chatId, approval, onSettled }: { client: DesktopClient; chatId: string; approval: PhoneApproval; onSettled(): void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const answer = async (decision: "accept" | "decline") => {
    setBusy(decision);
    haptic("press");
    try {
      await client.request("answer_approval", { chatId, approvalId: approval.id, decision });
      onSettled();
    } catch (problem) {
      reportFailure("Couldn't answer", problem);
    } finally {
      setBusy(null);
    }
  };
  return (
    <View className="border-b border-border px-4 py-3">
      <Text variant="label">{approval.plan ? "Proposed plan" : approval.title}</Text>
      {approval.plan ? <View className="mt-1"><Markdown text={approval.description} /></View> : approval.description ? <Text variant="small" className="mt-1 text-muted-foreground" selectable numberOfLines={12}>{approval.description}</Text> : null}
      <View className="mt-3 flex-row gap-2">
        <Button label={approval.plan ? "Accept the plan" : "Accept"} icon={Check} size="sm" loading={busy === "accept"} disabled={busy != null} onPress={() => void answer("accept")} />
        <Button label="Decline" icon={X} size="sm" variant="outline" loading={busy === "decline"} disabled={busy != null} onPress={() => void answer("decline")} />
      </View>
    </View>
  );
}

function QuestionCard({ client, chatId, request, onSettled }: { client: DesktopClient; chatId: string; request: PhoneQuestionRequest; onSettled(): void }) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const answers = Object.fromEntries(request.questions.map((question) => {
    const typed = other[question.id]?.trim();
    return [question.id, [...(chosen[question.id] ?? []), ...(typed ? [typed] : [])]];
  }));
  const complete = request.questions.every((question) => (answers[question.id]?.length ?? 0) > 0);
  const toggle = (questionId: string, label: string, multi: boolean) => setChosen((current) => {
    const now = current[questionId] ?? [];
    const next = now.includes(label) ? now.filter((value) => value !== label) : multi ? [...now, label] : [label];
    return { ...current, [questionId]: next };
  });
  const submit = async () => {
    setBusy(true);
    haptic("press");
    try {
      await client.request("answer_question", { chatId, questionId: request.id, answers });
      onSettled();
    } catch (problem) {
      reportFailure("Couldn't send the answers", problem);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-3 border-b border-border px-4 py-3">
      {request.questions.map((question) => (
        <View key={question.id} className="gap-2">
          <Text variant="label">{question.header || question.question}</Text>
          {question.header ? <Text variant="small" className="text-muted-foreground">{question.question}</Text> : null}
          {question.options?.length ? (
            <View className="flex-row flex-wrap gap-2">
              {question.options.map((option) => (
                <Chip key={option.label} label={option.label} selected={(chosen[question.id] ?? []).includes(option.label)} onPress={() => toggle(question.id, option.label, Boolean(question.multiSelect))} />
              ))}
            </View>
          ) : null}
          {question.isOther || !question.options?.length ? (
            <TextField
              value={other[question.id] ?? ""}
              onChangeText={(text) => setOther((current) => ({ ...current, [question.id]: text }))}
              placeholder={question.options?.length ? "Something else" : "Your answer"}
              secureTextEntry={question.isSecret}
              accessibilityLabel={question.question}
            />
          ) : null}
        </View>
      ))}
      <Button label="Send answers" size="sm" className="self-start" loading={busy} disabled={!complete} onPress={() => void submit()} />
    </View>
  );
}

/** Send, or while a turn runs, steer it now or queue the message for after it. The model shows read-only: a phone can't change it on a thread that exists. */
function DesktopComposer({ client, chatId, running, model, onStop }: { client: DesktopClient; chatId: string; running: boolean; model: string | null; onStop(): void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [steer, setSteer] = useState(true);
  const [sending, setSending] = useState(false);
  const canSend = text.trim().length > 0 && !sending;
  const send = async () => {
    if (!canSend) return;
    const value = text.trim();
    haptic("press");
    setSending(true);
    setText("");
    try {
      await client.request("send", { chatId, text: value, ...(running && steer ? { steer: true } : {}) });
    } catch (problem) {
      // Not sent (or not known to be): the text comes back so nothing typed is lost.
      if (!(problem instanceof DesktopRequestError && problem.code === "held")) setText((current) => current || value);
      reportFailure("Couldn't send", problem);
    } finally {
      setSending(false);
    }
  };
  return (
    <View className="border-t border-border bg-background px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      {running ? (
        <View className="mb-2 flex-row gap-2">
          <Chip label="Steer now" selected={steer} onPress={() => setSteer(true)} />
          <Chip label="After this turn" selected={!steer} onPress={() => setSteer(false)} />
        </View>
      ) : null}
      {model ? <View className="-ml-1.5 mb-1"><ModelControl label={model} disabledReason="Change it on the computer" /></View> : null}
      <View className="flex-row items-end gap-2 rounded-md border border-input bg-background px-1.5 py-1">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={running ? (steer ? "Steer this chat" : "Queue a message") : "Message"}
          multiline
          accessibilityLabel="Message"
          className="max-h-40 min-h-11 flex-1 px-2 py-2.5 font-sans text-[16px] leading-[22px] text-foreground"
          placeholderTextColorClassName="accent-muted-foreground"
          cursorColorClassName="accent-primary"
        />
        {running && !text.trim() ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={onStop} className="mb-1 h-9 w-9 items-center justify-center rounded-md bg-foreground">
            <Icon icon={Square} tone="background" size={14} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={running && steer ? "Steer" : "Send"} disabled={!canSend} onPress={() => void send()} className={cn("mb-1 h-9 w-9 items-center justify-center rounded-md", canSend ? "bg-primary" : "bg-muted")}>
            <Icon icon={ArrowUp} tone={canSend ? "primary-foreground" : "muted"} size={18} strokeWidth={2.4} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
