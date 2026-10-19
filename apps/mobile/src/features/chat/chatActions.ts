import type { useRouter } from "expo-router";
import { FileJson, FileText, PencilLine, Pin, PinOff, Share2, Trash2 } from "lucide-react-native";
import { confirm, showActions, toast, toastError, type Anchor, type MenuAction } from "@/components/ui";
import { measure } from "@/lib/diagnostics";
import { removeAllAttachmentFiles } from "./attachments";
import { deleteAllChats, deleteChat, updateChat } from "./db";
import type { ExportFormat } from "./export";
import { exportChats, shareExport } from "./exportFile";
import { stopAllAnswers } from "./runner";
import { draftSettingsStore, notifyChats } from "./state";
import type { Chat } from "./types";
import { reloadAllWindows } from "./window";

/** Writes the export, then opens the system share sheet with it. */
export async function exportAndShare(chatIds: string[] | "all", format: ExportFormat) {
  try {
    await shareExport(await exportChats(chatIds, format));
  } catch (error) {
    toastError("Couldn't export", error);
  }
}

/** Markdown to read, or JSON to keep: asked before every export. */
export function askExportFormat(chatIds: string[] | "all", anchor?: Anchor | null) {
  showActions({
    title: "Export as",
    anchor,
    actions: [
      { key: "markdown", label: "Markdown", description: "Easy to read in any notes or text app.", icon: FileText, onPress: () => void exportAndShare(chatIds, "markdown") },
      { key: "json", label: "JSON", description: "Every message with its model, time and usage, to keep or use elsewhere.", icon: FileJson, onPress: () => void exportAndShare(chatIds, "json") },
    ],
  });
}

/** Deletes every chat and attachment on this device after an in-app confirmation. Nothing on phaseo.app changes. */
export async function confirmDeleteAllChats(count: number) {
  const ok = await confirm({
    title: count === 1 ? "Delete your chat?" : `Delete all ${count} chats?`,
    body: "Chats are only stored on this device, so they can't be recovered. Export them first if you want a copy. Your account and usage on phaseo.app aren't affected.",
    confirmLabel: count === 1 ? "Delete chat" : "Delete all chats",
    destructive: true,
  });
  if (!ok) return false;
  stopAllAnswers();
  measure("Delete all chats", () => {
    deleteAllChats();
    removeAllAttachmentFiles();
  });
  draftSettingsStore.set({});
  reloadAllWindows();
  notifyChats();
  toast(count === 1 ? "Your chat was deleted." : "All chats were deleted from this device.", { tone: "success" });
  return true;
}

/** A chat's commands, in the website sidebar's order: rename, pin, export, then delete with an in-app confirmation. */
export function chatActions(chat: Chat, args: { router: ReturnType<typeof useRouter>; onDeleted?(): void; anchor?: Anchor | null }): MenuAction[] {
  return [
    { key: "rename", label: "Rename", icon: PencilLine, onPress: () => args.router.push({ pathname: "/sheets/[kind]", params: { kind: "rename-chat", id: chat.id } }) },
    { key: "pin", label: chat.pinned ? "Unpin" : "Pin", icon: chat.pinned ? PinOff : Pin, onPress: () => { updateChat(chat.id, { pinned: !chat.pinned }); notifyChats(); } },
    { key: "export", label: "Export", icon: Share2, onPress: () => askExportFormat([chat.id], args.anchor) },
    {
      key: "delete",
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onPress: async () => {
        const ok = await confirm({ title: "Delete this chat?", body: `"${chat.title}" is only stored on this device, so it can't be recovered.`, confirmLabel: "Delete", destructive: true });
        if (!ok) return;
        deleteChat(chat.id);
        notifyChats();
        args.onDeleted?.();
        toast("Chat deleted.");
      },
    },
  ];
}
