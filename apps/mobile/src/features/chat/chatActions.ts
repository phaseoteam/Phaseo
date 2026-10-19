import type { useRouter } from "expo-router";
import { PencilLine, Pin, PinOff, Trash2 } from "lucide-react-native";
import { confirm, toast, type MenuAction } from "@/components/ui";
import { deleteChat, updateChat } from "./db";
import { notifyChats } from "./state";
import type { Chat } from "./types";

/** A chat's commands, in the website sidebar's order: rename, pin, then delete with an in-app confirmation. */
export function chatActions(chat: Chat, args: { router: ReturnType<typeof useRouter>; onDeleted?(): void }): MenuAction[] {
  return [
    { key: "rename", label: "Rename", icon: PencilLine, onPress: () => args.router.push({ pathname: "/sheets/[kind]", params: { kind: "rename-chat", id: chat.id } }) },
    { key: "pin", label: chat.pinned ? "Unpin" : "Pin", icon: chat.pinned ? PinOff : Pin, onPress: () => { updateChat(chat.id, { pinned: !chat.pinned }); notifyChats(); } },
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
