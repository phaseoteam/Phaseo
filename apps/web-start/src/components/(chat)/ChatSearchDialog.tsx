"use client";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, Pin } from "lucide-react";
import type { ChatThread } from "@/lib/indexeddb/chats";
import { useTranslations } from "next-intl";

type ChatSearchDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    threads: ChatThread[];
    onSelectThread: (thread: ChatThread) => void;
};

export function ChatSearchDialog({
    open,
    onOpenChange,
    threads,
    onSelectThread,
}: ChatSearchDialogProps) {
	const t = useTranslations("Product.chat");
    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <DialogHeader className="sr-only">
                <DialogTitle>{t("searchChats")}</DialogTitle>
            </DialogHeader>
            <CommandInput placeholder={t("searchChatsPlaceholder")} />
            <CommandList>
                <CommandEmpty>{t("noChatsFound")}</CommandEmpty>
                <CommandGroup heading={t("chats")}>
                    {threads.map((thread) => (
                        <CommandItem
                            key={thread.id}
                            value={`${thread.title} ${thread.messages
                                .map((msg) => msg.content)
                                .join(" ")
                                .slice(0, 200)}`}
                            onSelect={() => onSelectThread(thread)}
                        >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            <span className="flex-1 truncate">{thread.title}</span>
                            {thread.pinned && (
                                <Pin className="h-4 w-4 text-muted-foreground" />
                            )}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
