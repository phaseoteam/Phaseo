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
};

export function RoomSearchDialog({
	open,
	onOpenChange,
	conversations,
	onSelectConversation,
}: RoomSearchDialogProps) {
	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader className="sr-only">
				<DialogTitle>Search chats</DialogTitle>
			</DialogHeader>
			<CommandInput placeholder="Search chats..." />
			<CommandList>
				<CommandEmpty>No chats found.</CommandEmpty>
				<CommandGroup heading="Chats">
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

