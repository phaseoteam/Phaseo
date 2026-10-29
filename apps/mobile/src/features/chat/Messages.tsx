import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { ArrowRight, AudioLines, Check, ChevronDown, ChevronRight, CircleAlert, Copy, FileText, GitBranch, Info, Layers, MoreHorizontal, Pencil, RefreshCw, RotateCcw, SlidersHorizontal, WalletCards } from "lucide-react-native";
import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View, type GestureResponderEvent } from "react-native";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { Button, Icon, measureAnchor, pointAnchor, showActions, Text, toast, useToneColor, type ViewRef } from "@/components/ui";
import { WEB_ORIGIN } from "@/lib/config";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { createStore } from "@/lib/store";
import { perf } from "@/perf";
import type { ConversationItem } from "./conversationItems";
import { chatErrorPresentation } from "./errors";
import type { Turn } from "./groups";
import { getLive, useLive } from "./live";
import { liveBlocks } from "./markdownChunks";
import { useOpenModelPicker, useOpenModelSettings } from "./ModelChips";
import { forkChat, retryAnswer } from "./runner";
import type { ModelSettings } from "./settings";
import { setModelsFor } from "./state";
import type { ChatMessage, ChatSummary, MessageUsage } from "./types";

export type ModelLabel = (modelId: string | null, settings?: ModelSettings) => { label: string; orgId: string; orgName: string };

/** What every row needs from its conversation, so rows stay memoised on their own data. */
export type ConversationContextValue = { chatId: string; labels: ModelLabel; settings: Record<string, ModelSettings>; workspaceId: string | null; focus: string | null };
export const ConversationContext = createContext<ConversationContextValue>({ chatId: "", labels: () => ({ label: "Model", orgId: "phaseo", orgName: "" }), settings: {}, workspaceId: null, focus: null });

/** Which answer each multi-model turn shows on phones (its tab), by model. */
export const selectedAnswers = createStore<Record<string, string>>({});

const FREE_ROUTER = "phaseo/free";

/**
 * Android 13 and later show their own clipboard confirmation, so the app only confirms copies on older versions; the
 * success haptic plays either way.
 */
function copyWithNotice(text: string, what: string) {
  void Clipboard.setStringAsync(text);
  haptic("success");
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) toast(`Copied the ${what}.`, { tone: "success" });
}

/** Copies text and shows a check on the button for a moment, like the website's copy buttons. */
function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return { copied, copy: (text: string) => { void Clipboard.setStringAsync(text); haptic("success"); setCopied(true); } };
}

/** A message reached from a link or a search is marked for a moment. */
function useFocused(id: string) {
  const { focus } = useContext(ConversationContext);
  const [on, setOn] = useState(focus === id);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), 2400);
    return () => clearTimeout(timer);
  }, [on]);
  return on;
}

/** One row of the conversation list (see conversationItems.ts). */
export const ConversationRow = memo(function ConversationRow({ item }: { item: ConversationItem }) {
  switch (item.type) {
    case "summary": return <SummaryRow summaries={item.summaries} />;
    case "user": return <UserRow turn={item.turn} last={item.last} />;
    case "columns": return <ColumnsRow turn={item.turn} />;
    case "answer": return <AnswerRow item={item} />;
  }
});

const statusLabel = (status: ChatMessage["status"]) => (status === "streaming" ? "answering" : status === "error" ? "failed" : status === "stopped" ? "stopped" : "done");

function StatusDot({ status }: { status: ChatMessage["status"] }) {
  const muted = useToneColor("muted");
  if (status === "streaming") return <ActivityIndicator size={10} color={muted} />;
  return <View className={cn("h-1.5 w-1.5 rounded-[2px]", status === "error" ? "bg-destructive" : status === "stopped" ? "bg-warning" : "bg-success")} />;
}

/** The question, and on phones the tabs for several models' answers. */
function UserRow({ turn, last }: { turn: Turn; last: boolean }) {
  const { chatId, labels, settings } = useContext(ConversationContext);
  const selectedModel = selectedAnswers.use((value) => value[turn.key]);
  perf?.count("render.turn");
  useEffect(() => { perf?.turnShown(chatId, turn.user.position); }, [chatId, turn.user.position]);
  const answers = turn.answers;
  const selected = Math.max(0, answers.findIndex((answer) => answer.model === selectedModel));
  return (
    <View className={cn(last && "pb-5")}>
      <UserMessage message={turn.user} />
      {answers.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4 pb-1 pt-4">
          {answers.map((answer, index) => {
            const { label, orgId, orgName } = labels(answer.model, settings[answer.model ?? ""]);
            const current = index === selected;
            return (
              <Pressable key={answer.id} accessibilityRole="tab" accessibilityState={{ selected: current }} accessibilityLabel={`${label}, ${statusLabel(answer.status)}`} onPress={() => selectedAnswers.set((value) => ({ ...value, [turn.key]: answer.model ?? "" }))} className={cn("h-9 flex-row items-center gap-2 rounded-md border px-2.5", current ? "border-foreground bg-accent" : "border-border active:bg-accent")}>
                <Logo id={orgId} label={orgName} size={16} bare />
                <Text variant="small" numberOfLines={1} className={cn("max-w-[160px] font-semibold", current ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
                <StatusDot status={answer.status} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  const router = useRouter();
  const { workspaceId } = useContext(ConversationContext);
  const focused = useFocused(message.id);
  const branch = () => { const id = forkChat(message, workspaceId); if (id) router.push(`/chat/${id}`); };
  const actions = (event: GestureResponderEvent) => showActions({
    anchor: pointAnchor(event),
    actions: [
      { key: "copy", label: "Copy", icon: Copy, onPress: () => copyWithNotice(message.content, "message") },
      { key: "edit", label: "Edit and resend", icon: Pencil, description: "Answers after it are replaced", onPress: () => router.push({ pathname: "/sheets/[kind]", params: { kind: "edit-message", id: message.id, chatId: message.chatId } }) },
      { key: "branch", label: "Branch from here", icon: GitBranch, description: "A new chat with the messages up to here", onPress: branch },
    ],
  });
  return (
    <Pressable onLongPress={(event) => { haptic("longPress"); actions(event); }} delayLongPress={300} accessibilityHint="Long press for copy, edit and branch" className={cn("items-end px-4 pt-3", focused && "bg-accent")}>
      {message.attachments.length ? (
        <View className="mb-1.5 max-w-[85%] flex-row flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => attachment.kind === "image" ? (
            <Image key={attachment.id} source={{ uri: attachment.uri }} style={{ width: 120, height: 120, borderRadius: 6 }} contentFit="cover" recyclingKey={attachment.id} accessibilityLabel={attachment.name} />
          ) : (
            <View key={attachment.id} className="flex-row items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-2">
              <Icon icon={attachment.kind === "audio" ? AudioLines : FileText} tone="muted" size={15} />
              <Text variant="caption" numberOfLines={1} className="max-w-40 font-medium text-foreground">{attachment.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {message.content ? (
        // The website's user bubble: foreground fill, background text, rounded-md.
        <View className="max-w-[85%] rounded-md bg-foreground px-4 py-2.5">
          <Text variant="body" className="text-background">{message.content}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** An answer's commands (long press anywhere on it, or its More button). */
function useAnswerMenu(message: ChatMessage) {
  const router = useRouter();
  const { labels, settings, workspaceId } = useContext(ConversationContext);
  const openSettings = useOpenModelSettings(message.chatId);
  const { label } = labels(message.model, settings[message.model ?? ""]);
  const streaming = message.status === "streaming";
  const branch = () => { const id = forkChat(message, workspaceId); if (id) router.push(`/chat/${id}`); };
  const menu = (anchor: Parameters<typeof showActions>[0]["anchor"]) => {
    const text = answerText(message);
    showActions({
      title: label,
      anchor,
      actions: [
        { key: "copy", label: "Copy answer", icon: Copy, disabled: !text, onPress: () => copyWithNotice(text, "answer") },
        { key: "retry", label: "Retry", icon: RotateCcw, description: "Ask the same model again", disabled: streaming, onPress: () => retryAnswer(message, workspaceId) },
        { key: "branch", label: "Branch from here", icon: GitBranch, description: `A new chat with ${label}`, disabled: streaming, onPress: branch },
        ...(message.model ? [{ key: "settings", label: `${label} settings`, icon: SlidersHorizontal, onPress: () => openSettings(message.model!) }] : []),
      ],
    });
  };
  return { menu, branch };
}

/** One chunk of the shown answer: the header and thinking with the first, the actions with the last. */
function AnswerRow({ item }: { item: Extract<ConversationItem, { type: "answer" }> }) {
  const { message } = item;
  perf?.count("render.answer");
  const focused = useFocused(item.first ? message.id : "");
  const { menu } = useAnswerMenu(message);
  return (
    <Pressable onLongPress={(event) => { haptic("longPress"); menu(pointAnchor(event)); }} delayLongPress={350} accessibilityHint="Long press for answer actions" className={cn("px-4", item.first && "pt-4", item.last && "pb-5", focused && "bg-accent")}>
      {item.first ? <AnswerTop message={message} header={item.header} /> : null}
      {item.text != null ? (item.text ? <Markdown text={item.text} /> : null) : <LiveTail message={message} />}
      {item.last ? <AnswerBottom message={message} /> : null}
    </Pressable>
  );
}

function AnswerTop({ message, header, compact }: { message: ChatMessage; header: boolean; compact?: boolean }) {
  const { labels, settings } = useContext(ConversationContext);
  const { label, orgId, orgName } = labels(message.model, settings[message.model ?? ""]);
  return (
    <>
      {header || compact ? (
        <View className="mb-2 flex-row items-center gap-2">
          <Logo id={orgId} label={orgName} size={18} bare />
          <Text variant="caption" numberOfLines={1} className="shrink">{label}</Text>
          {compact ? <StatusDot status={message.status} /> : null}
        </View>
      ) : null}
      {message.status === "streaming" ? <LiveThinking message={message} /> : message.reasoning ? <Thinking text={message.reasoning} streaming={false} /> : null}
    </>
  );
}

function LiveThinking({ message }: { message: ChatMessage }) {
  const live = useLive(message.id);
  const reasoning = live?.reasoning ?? message.reasoning;
  return reasoning ? <Thinking text={reasoning} streaming={!live?.content} /> : null;
}

/** A streaming answer's unfinished chunk: its finished blocks render once; only the block still arriving re-renders. */
function LiveTail({ message }: { message: ChatMessage }) {
  const live = useLive(message.id);
  const spinner = useToneColor("muted");
  if (!live) return message.content ? <Markdown text={message.content} /> : null;
  const tail = live.content.slice(live.boundaries.at(-1) ?? 0);
  if (!tail) {
    if (live.boundaries.length) return null;
    return (
      <View className="flex-row items-center gap-2 py-2">
        <ActivityIndicator size="small" color={spinner} />
        <Text variant="muted">{live.phase === "summarising" ? "Summarising earlier messages…" : live.reasoning ? "Thinking…" : "Waiting for the model…"}</Text>
      </View>
    );
  }
  const { done, live: arriving } = liveBlocks(tail);
  return (
    <>
      {done.map((block, index) => <Markdown key={index} text={block} />)}
      <Markdown text={arriving} streaming />
    </>
  );
}

const formatUsage = (usage: MessageUsage | null) => {
  if (!usage) return null;
  const cost = usage.costUsd != null || usage.summary?.costUsd != null ? (usage.costUsd ?? 0) + (usage.summary?.costUsd ?? 0) : null;
  const parts = [
    usage.outputTokens != null ? `${usage.outputTokens.toLocaleString("en-GB")} tokens` : null,
    cost != null ? formatUsd(cost, { precise: true }) : null,
    usage.summary ? (usage.summary.costUsd != null ? `includes ${formatUsd(usage.summary.costUsd, { precise: true })} to summarise earlier messages` : "includes a summary of earlier messages") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

function AnswerBottom({ message, compact }: { message: ChatMessage; compact?: boolean }) {
  const { workspaceId } = useContext(ConversationContext);
  const { copied, copy } = useCopy();
  const { menu, branch } = useAnswerMenu(message);
  const moreRef = useRef<ViewRef>(null);
  if (message.status === "streaming") return null;
  const content = message.content;
  const usage = formatUsage(message.usage);
  return (
    <>
      {message.status === "error" ? <ErrorNotice message={message} /> : null}
      {message.status === "stopped" ? <Text variant="caption" className="mt-1.5">Stopped</Text> : null}
      {message.notice ? (
        <View className="mt-2 flex-row items-start gap-2">
          <View className="pt-px"><Icon icon={Info} tone="warning" size={14} /></View>
          <Text variant="caption" className="flex-1">{message.notice}</Text>
        </View>
      ) : null}
      <View className={cn("mt-1.5 flex-row flex-wrap items-center", compact ? "-ml-1.5" : "-ml-2")}>
        {content ? <Action icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy answer"} onPress={() => copy(content)} /> : null}
        <Action icon={RotateCcw} label="Retry" onPress={() => retryAnswer(message, workspaceId)} />
        {!compact ? <Action icon={GitBranch} label="Branch from here" onPress={branch} /> : null}
        <View ref={moreRef} collapsable={false}>
          <Action icon={MoreHorizontal} label="More actions" onPress={() => void measureAnchor(moreRef).then(menu)} />
        </View>
        {usage ? <Text variant="caption" className="ml-1 shrink">{usage}</Text> : null}
      </View>
    </>
  );
}

/** Wide tablets: every model's answer side by side in one row. Very long answers show their start until expanded. */
function ColumnsRow({ turn }: { turn: Turn }) {
  return (
    <View className="flex-row px-4 pb-5 pt-4">
      {turn.answers.map((answer, index) => (
        <View key={answer.id} className={cn("flex-1", index > 0 && "ml-3 border-l border-border pl-3")}>
          <AnswerColumn message={answer} />
        </View>
      ))}
    </View>
  );
}

const COLUMN_PREVIEW_CHARS = 24_000;

function AnswerColumn({ message }: { message: ChatMessage }) {
  const [full, setFull] = useState(false);
  const { menu } = useAnswerMenu(message);
  const streaming = message.status === "streaming";
  const long = !streaming && message.content.length > COLUMN_PREVIEW_CHARS * 1.25;
  const shown = long && !full ? message.content.slice(0, message.content.lastIndexOf("\n\n", COLUMN_PREVIEW_CHARS) > 0 ? message.content.lastIndexOf("\n\n", COLUMN_PREVIEW_CHARS) : COLUMN_PREVIEW_CHARS) : message.content;
  return (
    <Pressable onLongPress={(event) => { haptic("longPress"); menu(pointAnchor(event)); }} delayLongPress={350} accessibilityHint="Long press for answer actions">
      <AnswerTop message={message} header compact />
      {streaming ? <LiveTail message={message} /> : shown ? <Markdown text={shown} /> : null}
      {long ? (
        <Pressable accessibilityRole="button" onPress={() => setFull(!full)} className="mt-1 self-start rounded-md px-1 py-1 active:bg-accent">
          <Text variant="caption" className="font-semibold text-link">{full ? "Show less" : `Show the rest (${Math.round((message.content.length - shown.length) / 1024)} KB)`}</Text>
        </Pressable>
      ) : null}
      <AnswerBottom message={message} compact />
    </Pressable>
  );
}

/** Where a model's earlier messages were summarised; tap to read the summary it sends instead. */
function SummaryRow({ summaries }: { summaries: ChatSummary[] }) {
  const { labels, settings } = useContext(ConversationContext);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View className="px-4 pt-4">
      {summaries.map((summary) => {
        const { label } = labels(summary.model, settings[summary.model]);
        const expanded = open === summary.model;
        return (
          <View key={summary.model} className="mb-1">
            <View className="flex-row items-center gap-2">
              <View className="h-px flex-1 bg-border" />
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityHint="Shows the summary this model is sent instead of the earlier messages" onPress={() => setOpen(expanded ? null : summary.model)} className="flex-row items-center gap-1.5 rounded-md px-2 py-1.5 active:bg-accent">
                <Icon icon={Layers} tone="muted" size={13} />
                <Text variant="caption" numberOfLines={1} className="shrink font-semibold">{`Earlier messages summarised for ${label}`}</Text>
                <Icon icon={expanded ? ChevronDown : ChevronRight} tone="muted" size={13} />
              </Pressable>
              <View className="h-px flex-1 bg-border" />
            </View>
            {expanded ? (
              <View className="mt-2 rounded-md border border-border bg-muted/40 px-3 pb-1 pt-3">
                <Markdown text={summary.summary} />
                <Text variant="caption" className="mb-2">{[`Written ${new Date(summary.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, summary.usage?.costUsd != null ? formatUsd(summary.usage.costUsd, { precise: true }) : null].filter(Boolean).join(" · ")}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A failed answer, like the website's ChatRequestErrorNotice: what happened, and the buttons that help. */
function ErrorNotice({ message }: { message: ChatMessage }) {
  const router = useRouter();
  const { workspaceId } = useContext(ConversationContext);
  const openPicker = useOpenModelPicker(message.chatId);
  const openSettings = useOpenModelSettings(message.chatId);
  const presentation = chatErrorPresentation({ code: message.errorCode, status: message.errorStatus });
  const payment = presentation.kind === "payment";
  const detail = message.error && message.error !== presentation.title ? message.error : null;
  return (
    <View className={cn("mt-2 rounded-md border px-3.5 py-3", payment ? "border-primary/25 bg-primary/5" : "border-destructive/25 bg-destructive/5")}>
      <View className="flex-row items-start gap-2.5">
        <View className="pt-0.5"><Icon icon={payment ? WalletCards : CircleAlert} tone={payment ? "link" : "destructive"} size={16} /></View>
        <View className="flex-1">
          <Text variant="label">{presentation.title}</Text>
          {presentation.description ? <Text variant="caption" className="mt-0.5">{presentation.description}</Text> : null}
          {detail ? <Text variant="caption" selectable className={cn("mt-1", payment ? undefined : "text-destructive")}>{detail}</Text> : null}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {payment ? (
              <>
                <Button label="Add credits" size="sm" icon={ArrowRight} onPress={() => void Linking.openURL(`${WEB_ORIGIN}/settings/credits`)} />
                <Button label="Try a free model" size="sm" variant="outline" onPress={() => { setModelsFor(message.chatId, [FREE_ROUTER]); toast("Switched this chat to the free models router. Send again to use it.", { tone: "success" }); }} />
              </>
            ) : null}
            {presentation.kind === "authentication" ? <Button label="Sign in" size="sm" icon={ArrowRight} onPress={() => router.push("/sign-in")} /> : null}
            {presentation.canOpenSettings && message.model ? <Button label="Model settings" size="sm" variant="outline" icon={SlidersHorizontal} onPress={() => openSettings(message.model!)} /> : null}
            {presentation.canRetry ? <Button label="Try again" size="sm" icon={RefreshCw} onPress={() => retryAnswer(message, workspaceId)} /> : null}
            {presentation.canChooseModel ? <Button label="Choose another model" size="sm" variant="outline" onPress={openPicker} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: typeof Copy; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} className="h-8 w-8 items-center justify-center rounded-md active:bg-accent">
      <Icon icon={icon} tone="muted" size={15} />
    </Pressable>
  );
}

function Thinking({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-2">
      <Pressable onPress={() => setOpen(!open)} className="-ml-1 flex-row items-center gap-1 self-start rounded-md px-1 py-1 active:bg-accent" accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
        <Text variant="caption" className="font-semibold">{streaming ? "Thinking…" : "Thought process"}</Text>
      </Pressable>
      {open ? <View className="mt-1 border-l-2 border-border pl-3"><Text variant="small" className="text-muted-foreground" selectable>{text}</Text></View> : null}
    </View>
  );
}

/** The text of an answer as the reader sees it now (streaming or saved), for copying while it streams. */
export const answerText = (message: ChatMessage) => getLive(message.id)?.content ?? message.content;
