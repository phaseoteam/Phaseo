import { AudioLines, Camera, FileCode2, ImageIcon, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, showActions, Text, type Anchor, type MenuAction } from "@/components/ui";
import { useOpenScreen } from "@/components/shell/useOpenScreen";
import { Composer } from "@/features/composer/Composer";
import { ComposerErrorNotice, ComposerQueue, ComposerQueuedEditBanner } from "@/features/composer/ComposerNotices";
import type { ComposerCommand } from "@/features/composer/commands";
import { resolveSendPresentation } from "@/features/composer/sendPresentation";
import { useBalance, useWeekSpend } from "@/features/account/queries";
import { formatUsd, nanosToUsd } from "@/lib/format";
import { pickAudioFile, pickImages, pickTextFile, removeAttachmentFiles } from "./attachments";
import { useChatModelLabel } from "./ChatModelSheet";
import { beginEdit, cancelEdit, chatQueues, enqueue, removeQueued, resumeQueue, saveEdit } from "./chatQueue";
import { sendNextQueued } from "./chatQueueDispatch";
import { ModelLogoStack, useOpenModelPicker, useOpenModelSettings } from "./ModelChips";
import { useChatModelOptions, useModelLabels } from "./models";
import type { ModelSettings } from "./settings";
import type { ChatAttachment } from "./types";

const MAX_ATTACHMENTS = 6;
type Draft = { text: string; attachments: ChatAttachment[] };
const EMPTY_DRAFT: Draft = { text: "", attachments: [] };

/**
 * The composer for a Phaseo chat (or the new chat with no `chatId`): attachments the selected models can read, the
 * first model and its effort ("+2" when more answer side by side), `/` commands, and, while answers run, a queue on
 * the phone that sends each message when the answers before it finish, with its messages editable in the composer.
 */
export function ChatComposer({ chatId, models, settings, workspaceId, running, onModelPress, onSend, onStop, disabledReason, seed, autoFocus }: {
  chatId: string | null;
  models: string[];
  settings: Record<string, ModelSettings>;
  workspaceId: string | null;
  running: boolean;
  onModelPress(): void;
  onSend(text: string, attachments: ChatAttachment[]): void;
  onStop(): void;
  disabledReason?: string | null;
  /** Text to put in the box (a suggested prompt); a new `key` puts it in again. */
  seed?: { key: number; text: string } | null;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const stash = useRef<Draft>(EMPTY_DRAFT);
  const labels = useModelLabels();
  const { byId } = useChatModelOptions();
  const label = useChatModelLabel(models, settings);
  const openPicker = useOpenModelPicker(chatId);
  const openSettings = useOpenModelSettings(chatId);
  const queue = chatQueues.use(chatId);
  const editing = queue.editing ? queue.items.find((item) => item.id === queue.editing) ?? null : null;

  // A new suggested prompt replaces the text (state adjusted from a prop, not in an effect); the composer focuses.
  const [shownSeed, setShownSeed] = useState(seed);
  if (seed !== shownSeed) {
    setShownSeed(seed);
    if (seed) setDraft((current) => ({ ...current, text: seed.text }));
  }

  const send = resolveSendPresentation({ editingQueuedMessage: Boolean(editing), running, canSteer: false, followUpBehavior: "queue", deliveryDeferred: queue.items.length > 0 });

  // What every selected model accepts (images, audio), so the menu only offers what will work.
  const unsupported = (modality: string) => models.filter((model) => !(byId.get(model)?.inputModalities ?? ["text", "image"]).includes(modality)).map((model) => labels(model, settings[model]).label);
  const reason = (names: string[]) => (names.length ? `${names.slice(0, 2).join(" and ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""} can't read ${names.length === 1 ? "it" : "them"}` : undefined);

  const attach = async (kind: "library" | "camera" | "file" | "audio") => {
    try {
      const added = kind === "file" ? await pickTextFile() : kind === "audio" ? await pickAudioFile() : await pickImages(kind);
      setDraft((current) => ({ ...current, attachments: [...current.attachments, ...added].slice(0, MAX_ATTACHMENTS) }));
      setError(null);
    } catch (problem) {
      setError(`Couldn't attach that. ${problem instanceof Error ? problem.message : "Try another file."}`);
    }
  };

  const openAttach = (anchor: Anchor | null) => {
    const noImages = unsupported("image");
    const noAudio = unsupported("audio");
    const full = draft.attachments.length >= MAX_ATTACHMENTS;
    const actions: MenuAction[] = [
      { key: "library", label: "Photos", icon: ImageIcon, description: reason(noImages) ?? "From your photo library", disabled: full || noImages.length > 0, onPress: () => void attach("library") },
      { key: "camera", label: "Camera", icon: Camera, description: reason(noImages) ?? "Take a photo", disabled: full || noImages.length > 0, onPress: () => void attach("camera") },
      { key: "file", label: "Text or code file", icon: FileCode2, description: "Notes, code, CSV or JSON, up to 200 KB", disabled: full, onPress: () => void attach("file") },
    ];
    // Audio is offered only when every selected model takes it, as the website hides its audio input otherwise.
    if (!noAudio.length) actions.push({ key: "audio", label: "Audio file", icon: AudioLines, description: "A recording, up to 10 MB", disabled: full, onPress: () => void attach("audio") });
    showActions({ title: full ? `Up to ${MAX_ATTACHMENTS} attachments per message` : "Add to message", actions, anchor });
  };

  // A queued message's files stay on disk until the edit is saved without them; cancelling keeps them.
  const removeAttachment = (id: string) => {
    const attachment = draft.attachments.find((entry) => entry.id === id);
    if (!attachment) return;
    if (!editing?.attachments.some((entry) => entry.id === id)) removeAttachmentFiles([attachment]);
    setDraft((current) => ({ ...current, attachments: current.attachments.filter((entry) => entry.id !== id) }));
  };

  const finishEdit = (save: boolean) => {
    if (!chatId || !editing) return;
    const kept = new Set((save ? draft.attachments : editing.attachments).map((entry) => entry.id));
    removeAttachmentFiles([...editing.attachments, ...draft.attachments].filter((entry, index, all) => !kept.has(entry.id) && all.findIndex((other) => other.id === entry.id) === index));
    chatQueues.update(chatId, (current) => (save ? saveEdit(current, draft.text, draft.attachments) : cancelEdit(current)));
    setDraft(stash.current);
    stash.current = EMPTY_DRAFT;
    sendNextQueued(chatId);
  };

  const submit = () => {
    const text = draft.text.trim();
    if (editing) return finishEdit(true);
    if (chatId && (running || queue.items.length)) {
      chatQueues.update(chatId, (current) => enqueue(current, { id: `${Date.now()}:${Math.random().toString(36).slice(2)}`, text, attachments: draft.attachments, workspaceId }));
      sendNextQueued(chatId);
    } else {
      onSend(text, draft.attachments);
    }
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const edit = (id: string) => {
    if (!chatId || editing) return;
    const item = queue.items.find((entry) => entry.id === id);
    if (!item) return;
    stash.current = draft;
    chatQueues.update(chatId, (current) => beginEdit(current, id));
    setDraft({ text: item.text, attachments: item.attachments });
  };

  const remove = (id: string) => {
    if (!chatId) return;
    const item = queue.items.find((entry) => entry.id === id);
    if (item) removeAttachmentFiles(item.attachments);
    chatQueues.update(chatId, (current) => removeQueued(current, id));
  };

  const commands: ComposerCommand[] = [
    { id: "model", label: "/model", description: "Choose the model and its effort" },
    { id: "compare", label: "/compare", description: "Add models to answer side by side" },
    ...(models.length ? [{ id: "settings", label: "/settings", description: "This model's settings in the chat" }] : []),
    ...(workspaceId ? [{ id: "usage", label: "/usage", description: "Credit balance and recent spend" }] : []),
  ];
  const runCommand = (command: ComposerCommand) => {
    if (command.id === "model") onModelPress();
    else if (command.id === "compare") openPicker();
    else if (command.id === "settings" && models[0]) openSettings(models[0]);
    else if (command.id === "usage") setUsageOpen(true);
  };

  return (
    <Composer
      text={draft.text}
      onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
      placeholder={models.length > 1 ? `Ask ${models.length} models` : "Ask anything"}
      disabledReason={disabledReason}
      onAttach={openAttach}
      attachments={draft.attachments}
      onRemoveAttachment={removeAttachment}
      model={{ label, logos: models.length ? <ModelLogoStack models={models} size={18} /> : null, onPress: onModelPress }}
      send={send}
      onSend={submit}
      onStop={running ? onStop : null}
      onResume={chatId && queue.held && !running ? () => { chatQueues.update(chatId, resumeQueue); sendNextQueued(chatId); } : null}
      editingQueued={Boolean(editing)}
      commands={commands}
      onCommand={runCommand}
      autoFocus={autoFocus}
      focusKey={seed?.key}
      above={(
        <>
          <ComposerQueue rows={queue.items.map((item) => ({ id: item.id, text: item.text, attachments: item.attachments.length, editing: item.id === queue.editing }))} held={queue.held} onEdit={edit} onRemove={remove} />
          {editing ? <ComposerQueuedEditBanner onCancel={() => finishEdit(false)} /> : null}
          {error ? <ComposerErrorNotice message={error} onDismiss={() => setError(null)} /> : null}
          {usageOpen && workspaceId ? <ChatUsageCard workspaceId={workspaceId} onClose={() => setUsageOpen(false)} /> : null}
        </>
      )}
    />
  );
}

/** What `/usage` shows over the composer: the workspace's credit balance and the last week's spend. */
function ChatUsageCard({ workspaceId, onClose }: { workspaceId: string; onClose(): void }) {
  const balance = useBalance(workspaceId);
  const week = useWeekSpend(workspaceId);
  const openScreen = useOpenScreen();
  const value = (loading: boolean, amount: number | null | undefined) => (amount != null ? formatUsd(amount) : loading ? "…" : "Unavailable");
  return (
    <View className="mb-3 overflow-hidden rounded-md border border-border bg-card">
      <View className="flex-row items-center gap-3 px-4 pt-3">
        <Text className="min-w-0 flex-1 text-[16px] font-semibold text-foreground">Usage</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss usage" hitSlop={12} onPress={onClose} className="-mr-1 p-1 active:opacity-60">
          <Icon icon={X} tone="muted" size={14} />
        </Pressable>
      </View>
      <View className="flex-row items-center justify-between px-4 pt-2">
        <Text className="text-[14px] text-muted-foreground">Credit balance</Text>
        <Text className="text-[14px] font-medium text-foreground">{value(balance.isLoading, balance.data)}</Text>
      </View>
      <View className="flex-row items-center justify-between px-4 pt-1">
        <Text className="text-[14px] text-muted-foreground">Last 7 days</Text>
        <Text className="text-[14px] font-medium text-foreground">{value(week.isLoading, week.nanos != null ? nanosToUsd(week.nanos) : null)}</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={() => { onClose(); openScreen("/account/usage"); }} className="mt-2 border-t border-border px-4 py-2.5 active:bg-accent">
        <Text className="text-[14px] font-medium text-link">Open Usage</Text>
      </Pressable>
    </View>
  );
}
