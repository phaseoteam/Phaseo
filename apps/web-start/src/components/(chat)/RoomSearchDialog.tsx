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

export type RoomSearchConversation = {
	id: string;
	title: string;
	pinned?: boolean;
};

type RoomSearchDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	conversations: RoomSearchConversation[];
	onSelectConversation: (conversation: RoomSearchConversation) => void;
	title?: string;
	placeholder?: string;
	emptyLabel?: string;
	groupLabel?: string;
};

export function RoomSearchDialog({
	open,
	onOpenChange,
	conversations,
	onSelectConversation,
	title = "Search chats",
	placeholder = "Search chats...",
	emptyLabel = "No chats found.",
	groupLabel = "Chats",
}: RoomSearchDialogProps) {
	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader className="sr-only">
				<DialogTitle>{title}</DialogTitle>
			</DialogHeader>
			<CommandInput placeholder={placeholder} />
			<CommandList>
				<CommandEmpty>{emptyLabel}</CommandEmpty>
				<CommandGroup heading={groupLabel}>
					{conversations.map((conversation) => (
						<CommandItem
							key={conversation.id}
							value={conversation.title}
							onSelect={() => onSelectConversation(conversation)}
						>
							<MessageSquare className="mr-2 h-4 w-4" />
							<span className="flex-1 truncate">{conversation.title}</span>
							{conversation.pinned ? (
								<Pin className="h-4 w-4 text-muted-foreground" />
							) : null}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
