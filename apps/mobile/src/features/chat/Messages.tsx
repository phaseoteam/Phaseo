import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { ArrowRight, AudioLines, Check, ChevronDown, ChevronRight, CircleAlert, Copy, FileText, GitBranch, MoreHorizontal, Pencil, RefreshCw, RotateCcw, SlidersHorizontal, WalletCards } from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View, type GestureResponderEvent } from "react-native";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { Button, Icon, measureAnchor, pointAnchor, showActions, Text, toast, useToneColor, type ViewRef } from "@/components/ui";
import { WEB_ORIGIN } from "@/lib/config";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { perf } from "@/perf";
import { chatErrorPresentation } from "./errors";
import type { Turn } from "./groups";
import { useOpenModelPicker, useOpenModelSettings } from "./ModelChips";
import { forkChat, retryAnswer } from "./runner";
import type { ModelSettings } from "./settings";
import { setModelsFor, useLive } from "./state";
import type { ChatMessage } from "./types";

export type ModelLabel = (modelId: string | null, settings?: ModelSettings) => { label: string; orgId: string; orgName: string };

const FREE_ROUTER = "phaseo/free";

/** Android 13 and later show their own clipboard confirmation, so the app only confirms copies on older versions. */
function copyWithNotice(text: string, what: string) {
  void Clipboard.setStringAsync(text);
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
  return { copied, copy: (text: string) => { void Clipboard.setStringAsync(text); setCopied(true); } };
}

/** One user message and every model's answer to it: tabs on phones, columns on wide tablets. */
export const TurnView = memo(function TurnView({ turn, side, labels, settings, workspaceId }: { turn: Turn; side: boolean; labels: ModelLabel; settings: Record<string, ModelSettings>; workspaceId: string | null }) {
  const [selected, setSelected] = useState(0);
  perf?.count("render.turn");
  useEffect(() => { perf?.turnShown(turn.user.chatId, turn.user.position); }, [turn.user.chatId, turn.user.position]);
  const answers = turn.answers;
  const active = answers[Math.min(selected, answers.length - 1)];
  return (
    <View className="pb-5">
      <UserMessage message={turn.user} workspaceId={workspaceId} />
      {answers.length > 1 && !side ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4 pb-1 pt-4">
          {answers.map((answer, index) => {
            const { label, orgId, orgName } = labels(answer.model, settings[answer.model ?? ""]);
            const current = index === selected;
            return (
              <Pressable key={answer.id} accessibilityRole="tab" accessibilityState={{ selected: current }} accessibilityLabel={`${label}, ${statusLabel(answer.status)}`} onPress={() => setSelected(index)} className={cn("h-9 flex-row items-center gap-2 rounded-md border px-2.5", current ? "border-foreground bg-accent" : "border-border active:bg-accent")}>
                <Logo id={orgId} label={orgName} size={16} bare />
                <Text variant="small" numberOfLines={1} className={cn("max-w-[160px] font-semibold", current ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
                <StatusDot status={answer.status} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {side && answers.length > 1 ? (
        <View className="flex-row px-4 pt-4">
          {answers.map((answer, index) => (
            <View key={answer.id} className={cn("flex-1", index > 0 && "ml-3 border-l border-border pl-3")}>
              <AnswerView message={answer} labels={labels} settings={settings} workspaceId={workspaceId} compact />
            </View>
          ))}
        </View>
      ) : active ? (
        <View className="px-4 pt-4">
          <AnswerView message={active} labels={labels} settings={settings} workspaceId={workspaceId} showHeader={answers.length === 1} />
        </View>
      ) : null}
    </View>
  );
});

const statusLabel = (status: ChatMessage["status"]) => (status === "streaming" ? "answering" : status === "error" ? "failed" : status === "stopped" ? "stopped" : "done");

function StatusDot({ status }: { status: ChatMessage["status"] }) {
  const muted = useToneColor("muted");
  if (status === "streaming") return <ActivityIndicator size={10} color={muted} />;
  return <View className={cn("h-1.5 w-1.5 rounded-[2px]", status === "error" ? "bg-destructive" : status === "stopped" ? "bg-warning" : "bg-success")} />;
}

function UserMessage({ message, workspaceId }: { message: ChatMessage; workspaceId: string | null }) {
  const router = useRouter();
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
    <Pressable onLongPress={actions} delayLongPress={300} accessibilityHint="Long press for copy, edit and branch" className="items-end px-4 pt-3">
      {message.attachments.length ? (
        <View className="mb-1.5 max-w-[85%] flex-row flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => attachment.kind === "image" ? (
            <Image key={attachment.id} source={{ uri: attachment.uri }} style={{ width: 120, height: 120, borderRadius: 6 }} contentFit="cover" accessibilityLabel={attachment.name} />
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

export function AnswerView({ message, labels, settings, workspaceId, showHeader = true, compact }: { message: ChatMessage; labels: ModelLabel; settings: Record<string, ModelSettings>; workspaceId: string | null; showHeader?: boolean; compact?: boolean }) {
  const router = useRouter();
  perf?.count("render.answer");
  const live = useLive(message.id);
  const content = live?.content ?? message.content;
  const reasoning = live?.reasoning ?? message.reasoning;
  const streaming = message.status === "streaming";
  const spinner = useToneColor("muted");
  const { copied, copy } = useCopy();
  const openSettings = useOpenModelSettings(message.chatId);
  const { label, orgId, orgName } = labels(message.model, settings[message.model ?? ""]);
  const moreRef = useRef<ViewRef>(null);
  const branch = () => { const id = forkChat(message, workspaceId); if (id) router.push(`/chat/${id}`); };
  const menu = (anchor: Parameters<typeof showActions>[0]["anchor"]) => showActions({
    title: label,
    anchor,
    actions: [
      { key: "copy", label: "Copy answer", icon: Copy, disabled: !content, onPress: () => copyWithNotice(content, "answer") },
      { key: "retry", label: "Retry", icon: RotateCcw, description: "Ask the same model again", disabled: streaming, onPress: () => retryAnswer(message, workspaceId) },
      { key: "branch", label: "Branch from here", icon: GitBranch, description: `A new chat with ${label}`, disabled: streaming, onPress: branch },
      ...(message.model ? [{ key: "settings", label: `${label} settings`, icon: SlidersHorizontal, onPress: () => openSettings(message.model!) }] : []),
    ],
  });
  return (
    <Pressable onLongPress={(event) => menu(pointAnchor(event))} delayLongPress={350} accessibilityHint="Long press for answer actions">
      {showHeader || compact ? (
        <View className="mb-2 flex-row items-center gap-2">
          <Logo id={orgId} label={orgName} size={18} bare />
          <Text variant="caption" numberOfLines={1} className="shrink">{label}</Text>
          {compact ? <StatusDot status={message.status} /> : null}
        </View>
      ) : null}
      {reasoning ? <Thinking text={reasoning} streaming={streaming && !content} /> : null}
      {content ? <Markdown text={content} streaming={streaming} /> : streaming ? (
        <View className="flex-row items-center gap-2 py-2"><ActivityIndicator size="small" color={spinner} /><Text variant="muted">{reasoning ? "Thinking…" : "Waiting for the model…"}</Text></View>
      ) : null}
      {message.status === "error" ? <ErrorNotice message={message} workspaceId={workspaceId} /> : null}
      {message.status === "stopped" ? <Text variant="caption" className="mt-1.5">Stopped</Text> : null}
      {!streaming ? (
        <View className={cn("mt-1.5 flex-row flex-wrap items-center", compact ? "-ml-1.5" : "-ml-2")}>
          {content ? <Action icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy answer"} onPress={() => copy(content)} /> : null}
          <Action icon={RotateCcw} label="Retry" onPress={() => retryAnswer(message, workspaceId)} />
          {!compact ? <Action icon={GitBranch} label="Branch from here" onPress={branch} /> : null}
          <View ref={moreRef} collapsable={false}>
            <Action icon={MoreHorizontal} label="More actions" onPress={() => void measureAnchor(moreRef).then(menu)} />
          </View>
          {message.usage?.costUsd != null || message.usage?.outputTokens != null ? (
            <Text variant="caption" className="ml-1">{[message.usage.outputTokens != null ? `${message.usage.outputTokens.toLocaleString("en-GB")} tokens` : null, message.usage.costUsd != null ? formatUsd(message.usage.costUsd, { precise: true }) : null].filter(Boolean).join(" · ")}</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** A failed answer, like the website's ChatRequestErrorNotice: what happened, and the buttons that help. */
function ErrorNotice({ message, workspaceId }: { message: ChatMessage; workspaceId: string | null }) {
  const router = useRouter();
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
