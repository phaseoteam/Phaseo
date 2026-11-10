import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, CircleAlert, FileDiff, FolderTree, GitBranch, GitCompareArrows, GitPullRequest, List, ListOrdered, MoreHorizontal, SquareTerminal, Wrench } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Markdown } from "@/components/Markdown";
import { EmptyState, ErrorState, Header, Icon, IconButton, Screen, showActions, SkeletonRows, Text, toast, useToneColor } from "@/components/ui";
import { useChatModelOptions } from "@/features/chat/models";
import type { ModelLabel } from "@/features/chat/modelSheetRows";
import { Composer, type ComposerModel } from "@/features/composer/Composer";
import { ComposerErrorNotice } from "@/features/composer/ComposerNotices";
import { resolveSendPresentation, type FollowUpAction } from "@/features/composer/sendPresentation";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { useChatDraft } from "./chatDraft";
import { changesLabel, chatItems, chatStatusLabel, settingsChange, workLogSummary, type ChatItem } from "./chatState";
import { DesktopRequestError, type DesktopClient } from "./client";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { openDesktopChat } from "./DesktopConnections";
import { DesktopModelSheet, ModeSheet, modelLogo, type ModeControl } from "./DesktopModelSheet";
import { knownModelsOf, useDesktopChat, useDesktopModels } from "./hooks";
import { choiceLabel, listAgents, permissionLabel, threadModel, type ModelChoice, type ModelList } from "./newThread";
import { PendingCards } from "./PendingCards";
import { chooseDesktop } from "./picked";
import type { PhoneActivity, PhoneChatDetail, PhoneMessage, PhoneQueueAction, PhoneTurnChanges } from "./protocol";
import { readsFiles } from "./files/fileTree";
import { readsGit } from "./git/gitState";
import { readsCode } from "./review/diffLines";
import { useTerminalMenu } from "./terminal/TerminalMenu";
import { usesTerminals } from "./terminal/terminalState";
import { desktopFilesHref, desktopGitHref, desktopPullRequestsHref, desktopReviewHref } from "./routes";
import { useDesktop } from "./store";
import { organises } from "./threadActions";

const problemText = (error: unknown) => (error instanceof Error ? error.message : "That didn't work.");

/** Tells the person what happened to an action; a held one isn't a failure, so it reads as a note. */
function reportFailure(title: string, error: unknown) {
  haptic("error");
  if (error instanceof DesktopRequestError && error.code === "held") toast(error.message, { title: "Waiting for the computer" });
  else toast(problemText(error), { title, tone: "error" });
}

/**
 * A thread on a paired computer. Like a chat in Chat, it leads with the sidebar, which lists the computer's threads;
 * opening one (from the sidebar, a notification or a link) makes its computer the app's workspace.
 */
export function DesktopChatScreen({ desktopId, chatId }: { desktopId: string; chatId: string }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  useEffect(() => {
    openDesktopChat.set({ desktopId, chatId });
    return () => openDesktopChat.set((current) => (current?.chatId === chatId && current.desktopId === desktopId ? null : current));
  }, [desktopId, chatId]);
  const paired = Boolean(desktop);
  useEffect(() => { if (paired) chooseDesktop(desktopId); }, [paired, desktopId]);
  if (desktop === undefined) return <Screen><Header sidebar back title="Thread" /><SkeletonRows count={5} /></Screen>;
  if (!client || !desktop) {
    return (
      <Screen>
        <Header sidebar back title="Thread" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="It may have been removed from this phone. Pair it again from Account → Desktops." />
      </Screen>
    );
  }
  return <ChatView client={client} desktopId={desktopId} chatId={chatId} desktopName={desktop.desktopName} />;
}

const STATE_WORDS = { open: "Open", closed: "Closed", merged: "Merged" } as const;

function ChatView({ client, desktopId, chatId, desktopName }: { client: DesktopClient; desktopId: string; chatId: string; desktopName: string }) {
  const connection = useConnection(client);
  const router = useRouter();
  const { view, error, reload, loadEarlier, loadingEarlier, settle, replaceChat } = useDesktopChat(client, chatId);
  const items = useMemo(() => (view ? chatItems(view.entries) : []), [view]);
  const chat = view?.chat;
  const running = chat?.status === "running";
  const lastId = view?.entries.at(-1)?.id;
  const model = chat ? threadModel(chat, knownModelsOf(client)) : null;
  // Review shows while the computer lets this phone read code, and goes the moment it's switched off there.
  const review = readsCode(connection) && Boolean(chat?.projectId);
  const openReview = useCallback((messageId?: string) => router.push(desktopReviewHref(desktopId, chatId, messageId ? "turn" : "uncommitted", messageId)), [router, desktopId, chatId]);
  // The composer floats over the feed, which scrolls on under it and ends above it.
  const [composerHeight, setComposerHeight] = useState(0);

  const stop = async () => {
    haptic("press");
    try { await client.request("stop", { chatId }); } catch (problem) { reportFailure("Couldn't stop it", problem); }
  };

  const renderItem = useCallback(({ item }: { item: ChatItem }) => (item.kind === "message"
    ? <MessageRow message={item.message} streaming={running && item.message.id === lastId && item.message.role === "assistant" && !item.message.completedAt} />
    : item.kind === "changes" ? <ChangesRow changes={item.changes} onPress={review ? () => openReview(item.messageId) : null} />
      : <WorkLog activities={item.activities} />), [running, lastId, review, openReview]);

  const pullRequests = chat?.pullRequests ?? [];
  const reviewButton = review ? <IconButton icon={GitCompareArrows} label="Review changes" onPress={() => openReview()} /> : null;
  // Files, like Review, shows only while the computer lets this phone read code.
  const filesButton = readsFiles(connection) && chat?.projectId ? <IconButton icon={FolderTree} label="Files" onPress={() => router.push(desktopFilesHref(desktopId, { chatId }, chat.project))} /> : null;
  const linkedActions = pullRequests.map((pr) => ({
    key: `${pr.repository}#${pr.number}`,
    label: `#${pr.number} ${pr.title ?? pr.repository}`,
    description: [pr.repository, pr.state ? STATE_WORDS[pr.state] : null].filter(Boolean).join(" · "),
    icon: GitPullRequest,
    onPress: () => void Linking.openURL(pr.url),
  }));
  // Git acts in the chat's own checkout: a worktree chat is listed under its parent project but works in the worktree.
  const workProjectId = chat?.workProjectId ?? chat?.projectId;
  // From protocol 6 the Git menu holds the linked pull requests too, so the header keeps three buttons.
  const gitMenu = readsGit(connection) && workProjectId ? (
    <IconButton
      icon={GitBranch}
      label="Git"
      onPress={() => showActions({
        title: "Git",
        actions: [
          { key: "git", label: "Commit, push and branches", icon: GitBranch, onPress: () => router.push(desktopGitHref(desktopId, workProjectId, chatId, chat?.project)) },
          ...linkedActions,
          { key: "all", label: "All pull requests", icon: List, onPress: () => router.push(desktopPullRequestsHref(desktopId, workProjectId, chat?.project)) },
        ],
      })}
    />
  ) : null;
  // Terminal shows only while the computer lets this phone use terminals, which is off until switched on there.
  const terminalMenu = useTerminalMenu(client, desktopId, chatId);
  const terminalButton = usesTerminals(connection) && chat?.projectId ? <IconButton icon={SquareTerminal} label="Terminal" onPress={() => void terminalMenu.open()} /> : null;
  const pullRequestMenu = gitMenu ? null : pullRequests.length ? (
    <IconButton
      icon={GitPullRequest}
      label={`Linked pull requests, ${pullRequests.length}`}
      onPress={() => showActions({
        title: "Linked pull requests",
        actions: linkedActions,
      })}
    />
  ) : null;

  return (
    <Screen>
      <Header
        sidebar
        back
        title={chat?.title ?? "Thread"}
        subtitle={[chat ? chatStatusLabel(chat) : connectionLabel(connection), chat?.project, desktopName].filter(Boolean).join(" · ")}
        right={terminalButton || filesButton || reviewButton || gitMenu || pullRequestMenu ? <View className="flex-row">{terminalButton}{filesButton}{reviewButton}{gitMenu ?? pullRequestMenu}</View> : null}
      />
      {terminalMenu.serversSheet}
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
            contentContainerStyle={{ paddingBottom: composerHeight + 12 }}
          />
        )}
        {chat ? (
          // In the layout (so the keyboard lifts it) but pulled up over the feed by its own height, so the feed scrolls on under it.
          <View pointerEvents="box-none" style={{ marginTop: -composerHeight }} onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}>
            <DesktopComposer
              client={client}
              desktopId={desktopId}
              chat={chat}
              running={running}
              label={model}
              onStop={() => void stop()}
              onSettings={replaceChat}
              above={<PendingCards client={client} chatId={chatId} approvals={chat.approvals} questions={chat.questions} onSettled={settle} onStop={running ? () => void stop() : null} onFailure={reportFailure} />}
            />
          </View>
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

/** What a finished turn changed in the project, as the window's changed-files row says it; it opens that turn's review when the phone may read code. */
function ChangesRow({ changes, onPress }: { changes: PhoneTurnChanges; onPress: (() => void) | null }) {
  const label = changesLabel(changes);
  const content = (
    <>
      <Icon icon={FileDiff} tone="muted" size={13} />
      <Text variant="caption" className={cn("font-semibold", onPress && "text-link")}>{label}</Text>
    </>
  );
  if (!onPress) return <View accessible accessibilityLabel={label.replace("−", "minus ")} className="mx-4 mt-3 flex-row items-center gap-1.5 self-start">{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label.replace("−", "minus ")}. Review this turn`} onPress={onPress} className="mx-3 mt-2 min-h-8 flex-row items-center gap-1.5 self-start rounded-md px-1 active:bg-accent">
      {content}
    </Pressable>
  );
}

/**
 * A run of tool calls, reasoning and plan updates in one line ("Ran 4 tools"), opened into tight rows of one step each,
 * whose output opens in turn.
 */
function WorkLog({ activities }: { activities: PhoneActivity[] }) {
  const [open, setOpen] = useState(false);
  const color = useToneColor("muted");
  const running = activities.some((activity) => activity.status === "running");
  const failed = activities.some((activity) => activity.status === "failed");
  return (
    <View className="px-4 pt-3">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="-ml-1 min-h-7 flex-row items-center gap-1.5 self-start rounded-md px-1 active:bg-accent">
        <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
        {running ? <ActivityIndicator size={10} color={color} /> : failed ? <Icon icon={CircleAlert} tone="destructive" size={13} /> : <Icon icon={Wrench} tone="muted" size={13} />}
        <Text variant="caption" numberOfLines={1} className="shrink font-semibold">{workLogSummary(activities)}</Text>
      </Pressable>
      {open ? <View className="ml-2 mt-0.5 border-l border-border pl-2">{activities.map((activity) => <WorkLogStep key={activity.id} activity={activity} />)}</View> : null}
    </View>
  );
}

function WorkLogStep({ activity }: { activity: PhoneActivity }) {
  const [open, setOpen] = useState(false);
  const color = useToneColor("muted");
  const detail = activity.summary || activity.text;
  const steps = activity.steps?.length ? activity.steps : null;
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} disabled={!detail && !steps} onPress={() => setOpen(!open)} className="min-h-7 flex-row items-center gap-1.5 rounded-md px-1 active:bg-accent">
        {activity.status === "running" ? <ActivityIndicator size={9} color={color} /> : null}
        <Text variant="caption" numberOfLines={1} className={cn("shrink", activity.status === "failed" && "text-destructive")}>{activity.title}</Text>
      </Pressable>
      {open ? (
        <View className="px-1 pb-1">
          {detail ? <Text variant="caption" numberOfLines={12} selectable className="font-mono">{detail}</Text> : null}
          {steps?.map((step, index) => <Text key={index} variant="caption">{`${step.status === "completed" ? "✓" : "·"} ${step.text}`}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

const QUEUE_ACTIONS: { action: PhoneQueueAction; label: string; destructive?: true }[] = [
  { action: "up", label: "Move up" },
  { action: "down", label: "Move down" },
  { action: "remove", label: "Remove", destructive: true },
];

/**
 * Messages waiting for the turn to end, over the composer: each sends now into the running turn, or from its menu is
 * edited (in the composer), moved or removed, through the computer's own queue.
 */
function QueueControl({ client, chat, running, onEdit }: { client: DesktopClient; chat: PhoneChatDetail; running: boolean; onEdit(message: { id: string; text: string }): void }) {
  const queue = chat.queue ?? [];
  if (!queue.length) return null;
  const act = async (messageId: string, action: PhoneQueueAction) => {
    haptic("press");
    try { await client.request("queue", { chatId: chat.id, messageId, action }); } catch (problem) { reportFailure("Couldn't change the queue", problem); }
  };
  return (
    <View className="mb-1.5 overflow-hidden rounded-md border border-border bg-card">
      <View className="flex-row items-center gap-1.5 px-3 pt-2">
        <Icon icon={ListOrdered} tone="muted" size={13} />
        <Text variant="caption" className="font-semibold">{queue.length === 1 ? "1 message queued" : `${queue.length} messages queued`}</Text>
      </View>
      {queue.map((message, index) => (
        <View key={message.id} className={cn("flex-row items-center gap-2 py-1 pl-3 pr-1", index < queue.length - 1 && "border-b border-border")}>
          <Text variant="small" numberOfLines={1} className="flex-1">{message.text}</Text>
          {running ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Send now: ${message.text}`} onPress={() => void act(message.id, "steer")} className="rounded-md px-2 py-1.5 active:bg-accent">
              <Text variant="caption" className="font-semibold text-link">Send now</Text>
            </Pressable>
          ) : null}
          <IconButton
            icon={MoreHorizontal}
            label={`More for: ${message.text}`}
            onPress={() => showActions({
              title: message.text,
              actions: [
                // The phone has only the start of a long message; saving it would cut the rest on the computer.
                ...(message.truncated ? [] : [{ key: "edit", label: "Edit", onPress: () => onEdit(message) }]),
                ...QUEUE_ACTIONS.filter((entry) => !(entry.action === "up" && index === 0) && !(entry.action === "down" && index === queue.length - 1))
                  .map((entry) => ({ key: entry.action, label: entry.label, ...(entry.destructive ? { destructive: true } : {}), onPress: () => void act(message.id, entry.action) })),
              ],
            })}
          />
        </View>
      ))}
    </View>
  );
}

const THREAD_MODES = ["code", "plan"] as const;

/**
 * The thread's settings, opened from the model in its composer as on the new-thread screen: the model (any its own
 * agent offers, with its efforts), Code or Plan (a Chat stays one) and the permissions, which only the computer
 * changes. While a turn runs they don't change; on a computer from before protocol 3 the model shows but doesn't press.
 */
function useThreadSettings({ client, chat, running, label: thread, onSettings }: { client: DesktopClient; chat: PhoneChatDetail; running: boolean; label: ModelLabel | null; onSettings(chat: PhoneChatDetail): void }): { model: ComposerModel | null; sheets: ReactNode } {
  const connection = useConnection(client);
  const changeable = connection.status === "connected" && organises(connection.protocol) && Boolean(chat.harness);
  const { list: loaded } = useDesktopModels(changeable ? client : null, chat.projectId ?? null, chat.mode);
  // Another mode lists its models again; until it has, the thread keeps the last list, so switching the mode in the
  // open sheet doesn't close it or drop the effort from the control.
  const [kept, setKept] = useState<{ chatId: string; list: ModelList } | null>(null);
  if (loaded && kept?.list !== loaded) setKept({ chatId: chat.id, list: loaded });
  const list = loaded ?? (changeable && kept?.chatId === chat.id ? kept.list : null);
  const [sheet, setSheet] = useState<"model" | "mode" | null>(null);
  // Only the thread's own agent: another one would be a handoff to a new thread, which the phone doesn't offer.
  const own: ModelList | null = useMemo(() => (list && chat.harness ? { ...list, agents: listAgents(list).filter((agent) => agent.harness === chat.harness && (agent.accountId ?? "") === (chat.accountId ?? "")) } : null), [list, chat.harness, chat.accountId]);
  const choice: ModelChoice | null = chat.model && chat.harness ? { harness: chat.harness, ...(chat.accountId ? { accountId: chat.accountId } : {}), model: chat.model, effort: chat.reasoningEffort ?? null } : null;
  const usable = Boolean(changeable && own?.agents?.length && choice);
  const blocked = running ? "Stop the turn to change this." : null;
  const set = async (change: { mode?: "code" | "plan"; model?: string; reasoningEffort?: string; defaultEffort?: true }) => {
    if (blocked) { toast(blocked); return; }
    try { onSettings((await client.request("set_chat", { chatId: chat.id, ...change })).chat); }
    catch (problem) { reportFailure("Couldn't change the thread", problem); }
  };
  const mode: ModeControl | null = changeable && chat.mode !== "chat"
    ? { value: chat.mode, options: THREAD_MODES, onChange: (value) => { if (value !== chat.mode && value !== "chat") void set({ mode: value }); } }
    : null;
  const permission = chat.permissionMode ?? null;
  const { byId } = useChatModelOptions();
  if (!thread) return { model: null, sheets: null };
  // Named as the sheet names it, with the default effort, once the computer lists its models; until then, a Phaseo
  // model by this phone's catalogue name rather than its id.
  const catalogued = chat.model ? byId.get(chat.model)?.label : undefined;
  const label = usable && own && choice ? choiceLabel(own, choice) : catalogued ? { ...thread, model: catalogued } : thread;
  const logos = chat.model ? modelLogo({ model: chat.model, harness: chat.harness, label: label.model }) : null;
  const opens = usable ? "model" : mode ? "mode" : null;
  const model: ComposerModel = opens
    ? { label, logos, hint: usable ? (mode ? "Choose the model, its effort and the mode" : "Choose the model and its effort") : "Choose the mode", onPress: () => (blocked ? toast(blocked) : setSheet(opens)) }
    : { label, logos, readOnlyReason: ["Change it on the computer", permission ? `Permissions: ${permissionLabel(permission)}` : null].filter(Boolean).join(". ") };
  const sheets = (
    <>
        {usable && own && choice ? (
          <DesktopModelSheet
            list={own}
            choice={choice}
            mode={mode}
            permission={permission}
            open={sheet === "model"}
            onClose={() => setSheet(null)}
            onChoose={(next) => {
              const change = settingsChange(chat, next);
              if (change) void set(change);
            }}
          />
        ) : null}
        {mode ? <ModeSheet mode={mode} open={sheet === "mode"} onClose={() => setSheet(null)} /> : null}
    </>
  );
  return { model, sheets };
}

/**
 * The thread's floating composer: send, or while a turn runs, steer it (a long press queues the message on the computer
 * instead), with the queue over it and the model beside send, which opens the thread's settings. Editing a queued message
 * puts it in the composer, and sending saves it back. Attachments and `/` commands aren't offered, as the phone protocol
 * carries neither.
 */
function DesktopComposer({ client, desktopId, chat, running, label, above, onStop, onSettings }: { client: DesktopClient; desktopId: string; chat: PhoneChatDetail; running: boolean; label: ModelLabel | null; above: ReactNode; onStop(): void; onSettings(chat: PhoneChatDetail): void }) {
  const chatId = chat.id;
  const settings = useThreadSettings({ client, chat, running, label, onSettings });
  // Kept outside the screen so a review comment lands here. A queued message being edited has its own text instead,
  // and the draft comes back when the edit ends (saved, cancelled, or the message sent or removed on the computer).
  const [draft, setDraft] = useChatDraft(desktopId, chatId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const editing = edit && chat.queue?.some((message) => message.id === edit.id) ? edit : null;
  const text = editing ? editing.text : draft;
  const setText = (value: string) => (editing ? setEdit({ ...editing, text: value }) : setDraft(value));
  const presentation = resolveSendPresentation({ editingQueuedMessage: Boolean(editing), running, canSteer: running, followUpBehavior: "steer", deliveryDeferred: false });
  const send = async (action?: FollowUpAction) => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    if (editing) {
      try {
        await client.request("queue", { chatId, messageId: editing.id, action: "edit", text: value });
        setEdit(null);
      } catch (problem) { reportFailure("Couldn't save the queued message", problem); }
      finally { setSending(false); }
      return;
    }
    const steer = running && (action ?? presentation.action) === "steer";
    setDraft("");
    try {
      await client.request("send", { chatId, text: value, ...(steer ? { steer: true } : {}) });
    } catch (problem) {
      // Not sent (or not known to be): the text comes back so nothing typed is lost.
      if (problem instanceof DesktopRequestError && problem.code === "held") {
        reportFailure("Couldn't send", problem);
      } else {
        haptic("error");
        setDraft((current) => current || value);
        setError(problemText(problem));
      }
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <Composer
        floating
        text={text}
        onChangeText={setText}
        placeholder={editing ? "Edit the queued message" : chat.mode === "plan" ? "What should it plan?" : "Ask anything"}
        onAttach={null}
        model={settings.model}
        send={editing ? { ...presentation, label: "Save queued message" } : presentation}
        editingQueued={Boolean(editing)}
        sendBlockedReason={sending ? "Sending…" : null}
        onSend={(action) => void send(action)}
        onStop={running ? onStop : null}
        above={(
          <>
            {above}
            <QueueControl client={client} chat={chat} running={running} onEdit={(message) => setEdit({ id: message.id, text: message.text })} />
            {editing ? (
              <Pressable accessibilityRole="button" onPress={() => setEdit(null)} className="mb-1.5 self-start rounded-md bg-background px-2 py-1 active:bg-accent">
                <Text variant="caption" className="font-semibold text-link">Cancel editing</Text>
              </Pressable>
            ) : null}
            {error ? <ComposerErrorNotice message={error} onDismiss={() => setError(null)} /> : null}
          </>
        )}
      />
      {settings.sheets}
    </>
  );
}
