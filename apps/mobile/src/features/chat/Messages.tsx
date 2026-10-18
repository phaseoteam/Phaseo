import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, Copy, FileText, GitBranch, RotateCcw } from "lucide-react-native";
import { memo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { Icon, Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import type { Turn } from "./groups";
import { forkChat, retryAnswer } from "./runner";
import { useLive } from "./state";
import type { ChatMessage } from "./types";

export const TurnView = memo(function TurnView({ turn, side, modelName, workspaceId }: { turn: Turn; side: boolean; modelName(id: string | null): string; workspaceId: string | null }) {
  const [selected, setSelected] = useState(0);
  const answers = turn.answers;
  const active = answers[Math.min(selected, answers.length - 1)];
  return (
    <View className="pb-4">
      <UserMessage message={turn.user} workspaceId={workspaceId} />
      {answers.length > 1 && !side ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4 pb-1 pt-3">
          {answers.map((answer, index) => (
            <Pressable key={answer.id} onPress={() => setSelected(index)} className={cn("h-8 flex-row items-center gap-1.5 rounded-full border px-3", index === selected ? "border-foreground" : "border-border")}>
              <StatusDot status={answer.status} />
              <Text variant="small" className={cn("font-semibold", index === selected ? "text-foreground" : "text-muted-foreground")}>{modelName(answer.model)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {side && answers.length > 1 ? (
        <View className="flex-row gap-3 px-4 pt-3">
          {answers.map((answer) => (
            <View key={answer.id} className="flex-1">
              <AnswerView message={answer} label={modelName(answer.model)} showLabel workspaceId={workspaceId} compact />
            </View>
          ))}
        </View>
      ) : active ? (
        <View className="px-4 pt-3">
          <AnswerView message={active} label={modelName(active.model)} showLabel={answers.length === 1} workspaceId={workspaceId} />
        </View>
      ) : null}
    </View>
  );
});

function StatusDot({ status }: { status: ChatMessage["status"] }) {
  return <View className={cn("h-1.5 w-1.5 rounded-full", status === "streaming" ? "bg-primary" : status === "error" ? "bg-destructive" : status === "stopped" ? "bg-warning" : "bg-success")} />;
}

function UserMessage({ message, workspaceId }: { message: ChatMessage; workspaceId: string | null }) {
  const router = useRouter();
  const actions = () => Alert.alert("Message", undefined, [
    { text: "Copy", onPress: () => void Clipboard.setStringAsync(message.content) },
    { text: "Edit and resend", onPress: () => router.push({ pathname: "/sheets/[kind]", params: { kind: "edit-message", id: message.id, chatId: message.chatId } }) },
    { text: "Fork from here", onPress: () => { const id = forkChat(message, workspaceId); if (id) router.push(`/chat/${id}`); } },
    { text: "Cancel", style: "cancel" },
  ]);
  return (
    <Pressable onLongPress={actions} className="items-end px-4 pt-2">
      {message.attachments.length ? (
        <View className="mb-1.5 flex-row flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => attachment.kind === "image" ? (
            <Image key={attachment.id} source={{ uri: attachment.uri }} style={{ width: 120, height: 120, borderRadius: 12 }} contentFit="cover" />
          ) : (
            <View key={attachment.id} className="flex-row items-center gap-1.5 rounded-lg bg-muted px-2.5 py-2">
              <Icon icon={FileText} tone="muted" size={15} />
              <Text variant="caption" numberOfLines={1} className="max-w-40">{attachment.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {message.content ? (
        <View className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2.5">
          <Text variant="body" selectable>{message.content}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function AnswerView({ message, label, showLabel, workspaceId, compact }: { message: ChatMessage; label: string; showLabel?: boolean; workspaceId: string | null; compact?: boolean }) {
  const router = useRouter();
  const live = useLive(message.id);
  const content = live?.content ?? message.content;
  const reasoning = live?.reasoning ?? message.reasoning;
  const streaming = message.status === "streaming";
  const spinner = useToneColor("muted");
  return (
    <View>
      {showLabel ? (
        <View className="mb-1.5 flex-row items-center gap-2">
          <Logo id={message.model?.split("/")[0]} size={18} />
          <Text variant="caption" className="font-semibold">{label}</Text>
        </View>
      ) : null}
      {reasoning ? <Thinking text={reasoning} streaming={streaming && !content} /> : null}
      {content ? <Markdown text={content} streaming={streaming} /> : streaming ? (
        <View className="flex-row items-center gap-2 py-2"><ActivityIndicator size="small" color={spinner} /><Text variant="muted">{reasoning ? "Thinking…" : "Waiting for the model…"}</Text></View>
      ) : null}
      {message.status === "error" ? (
        <View className="mt-2 border-l-2 border-destructive pl-3">
          <Text variant="small" className="text-destructive">{message.error ?? "The answer failed."}</Text>
        </View>
      ) : null}
      {message.status === "stopped" ? <Text variant="caption" className="mt-1">Stopped</Text> : null}
      {!streaming ? (
        <View className={cn("mt-1 flex-row items-center", compact ? "gap-0" : "gap-1")}>
          <Action icon={Copy} label="Copy" onPress={() => void Clipboard.setStringAsync(content)} />
          <Action icon={RotateCcw} label="Retry" onPress={() => retryAnswer(message, workspaceId)} />
          {!compact ? <Action icon={GitBranch} label="Fork" onPress={() => { const id = forkChat(message, workspaceId); if (id) router.push(`/chat/${id}`); }} /> : null}
          {message.usage?.costUsd != null || message.usage?.outputTokens != null ? (
            <Text variant="caption" className="ml-1">{[message.usage.outputTokens != null ? `${message.usage.outputTokens.toLocaleString()} tokens` : null, message.usage.costUsd != null ? formatUsd(message.usage.costUsd, { precise: true }) : null].filter(Boolean).join(" · ")}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: typeof Copy; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} hitSlop={6} className="h-8 w-8 items-center justify-center rounded-full active:bg-accent">
      <Icon icon={icon} tone="muted" size={15} />
    </Pressable>
  );
}

function Thinking({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-2">
      <Pressable onPress={() => setOpen(!open)} className="flex-row items-center gap-1 py-1" accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
        <Text variant="caption" className="font-semibold">{streaming ? "Thinking…" : "Thought process"}</Text>
      </Pressable>
      {open ? <View className="border-l-2 border-border pl-3"><Text variant="small" className="text-muted-foreground" selectable>{text}</Text></View> : null}
    </View>
  );
}

