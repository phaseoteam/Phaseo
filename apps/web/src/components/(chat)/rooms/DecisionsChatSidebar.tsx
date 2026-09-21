"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
	MoreHorizontal,
	PencilLine,
	Pin,
	PinOff,
	SquarePen,
	Tag,
	Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDeleteDialog } from "@/components/(chat)/ChatDeleteDialog";
import { ChatRenameDialog } from "@/components/(chat)/ChatRenameDialog";
import { ChatTagsDialog } from "@/components/(chat)/ChatTagsDialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
	CHAT_SIDEBAR_ACTIONS_CLASS,
	CHAT_SIDEBAR_HISTORY_GROUP_CLASS,
} from "@/components/(chat)/chatSidebarStyles";
import { ROOM_SIDEBAR_SLOT_ID } from "@/components/(chat)/RoomScaffold";
import type { ChatTag } from "@/lib/indexeddb/chats";
import type { DecisionConversation } from "@/components/(chat)/rooms/decisionChatConversations";

type DecisionsChatSidebarProps = {
	conversations: DecisionConversation[];
	activeConversationId: string | null;
	historyLoaded: boolean;
	collapsed: boolean;
	availableTags: ChatTag[];
	onCreate: () => void;
	onSelect: (conversation: DecisionConversation) => void;
	onRename: (conversation: DecisionConversation, title: string) => Promise<boolean>;
	onTogglePin: (conversation: DecisionConversation) => void;
	onSaveTags: (conversation: DecisionConversation, tags: ChatTag[]) => Promise<boolean>;
	onDelete: (conversation: DecisionConversation) => Promise<boolean>;
};

export function DecisionsChatSidebar({
	conversations,
	activeConversationId,
	historyLoaded,
	collapsed,
	availableTags,
	onCreate,
	onSelect,
	onRename,
	onTogglePin,
	onSaveTags,
	onDelete,
}: DecisionsChatSidebarProps) {
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(null);
	const [renameTarget, setRenameTarget] = useState<DecisionConversation | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [renameOpen, setRenameOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<DecisionConversation | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [tagsTarget, setTagsTarget] = useState<DecisionConversation | null>(null);
	const [tagsOpen, setTagsOpen] = useState(false);

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			setSidebarSlotEl(document.getElementById(ROOM_SIDEBAR_SLOT_ID));
		});
		return () => window.cancelAnimationFrame(frame);
	}, []);

	async function saveRename() {
		if (!renameTarget || !renameValue.trim()) return;
		if (await onRename(renameTarget, renameValue.trim())) {
			setRenameOpen(false);
			setRenameTarget(null);
		}
	}

	async function saveTags(tags: ChatTag[]) {
		if (!tagsTarget) return;
		if (await onSaveTags(tagsTarget, tags)) {
			setTagsOpen(false);
			setTagsTarget(null);
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		if (await onDelete(deleteTarget)) {
			setDeleteOpen(false);
			setDeleteTarget(null);
		}
	}

	if (!sidebarSlotEl) return null;

	return createPortal(
		<>
			<div data-chat-sidebar-actions="true" className={CHAT_SIDEBAR_ACTIONS_CLASS}>
				<Button
					type="button"
					variant="ghost"
					className="h-8 min-w-0 w-full justify-start gap-2 px-2 text-sm font-medium"
					onClick={onCreate}
					disabled={!historyLoaded}
					aria-label="New Chat"
				>
					<SquarePen className="h-4 w-4 shrink-0" />
					{collapsed ? null : <span className="truncate text-left">New Chat</span>}
				</Button>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<SidebarGroup className={CHAT_SIDEBAR_HISTORY_GROUP_CLASS}>
					<SidebarGroupLabel>Chats</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{conversations.map((conversation) => (
								<SidebarMenuItem
									key={conversation.id}
									className="mb-1 w-full overflow-hidden last:mb-0"
								>
									<SidebarMenuButton
										className="rounded-md"
										isActive={activeConversationId === conversation.id}
										onClick={() => onSelect(conversation)}
									>
										{conversation.pinned ? (
											<Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										) : null}
										<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
											{conversation.title}
										</span>
									</SidebarMenuButton>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<SidebarMenuAction
													showOnHover
													aria-label={`Open actions for ${conversation.title}`}
												/>
										}
										>
											<MoreHorizontal className="h-4 w-4" />
										</DropdownMenuTrigger>
										<DropdownMenuContent
											side="right"
											className="rounded-md [&_[data-slot=dropdown-menu-item]]:rounded-md"
										>
											<DropdownMenuItem
												onClick={() => {
													setRenameTarget(conversation);
													setRenameValue(conversation.title);
													setRenameOpen(true);
												}}
											>
												<PencilLine className="mr-2 h-4 w-4" />
												Rename
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => onTogglePin(conversation)}>
												{conversation.pinned ? (
													<PinOff className="mr-2 h-4 w-4" />
												) : (
													<Pin className="mr-2 h-4 w-4" />
												)}
												{conversation.pinned ? "Unpin" : "Pin"}
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => {
													setTagsTarget(conversation);
													setTagsOpen(true);
												}}
											>
												<Tag className="mr-2 h-4 w-4" />
												Tags
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													setDeleteTarget(conversation);
													setDeleteOpen(true);
												}}
											>
												<Trash2 className="mr-2 h-4 w-4" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</SidebarMenuItem>
							))}
							{historyLoaded && conversations.length === 0 ? (
								<p className="px-2 py-3 text-xs text-muted-foreground">
									No chats yet.
								</p>
							) : null}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</ScrollArea>
			<ChatRenameDialog
				open={renameOpen}
				onOpenChange={(open) => {
					setRenameOpen(open);
					if (!open) setRenameTarget(null);
				}}
				value={renameValue}
				onChange={setRenameValue}
				onSave={() => void saveRename()}
			/>
			<ChatDeleteDialog
				open={deleteOpen}
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) setDeleteTarget(null);
				}}
				onConfirm={() => void confirmDelete()}
			/>
			<ChatTagsDialog
				key={tagsTarget?.id ?? "decisions-chat-tags"}
				open={tagsOpen}
				thread={tagsTarget}
				availableTags={availableTags}
				onOpenChange={(open) => {
					setTagsOpen(open);
					if (!open) setTagsTarget(null);
				}}
				onSave={(tags) => void saveTags(tags)}
			/>
		</>,
		sidebarSlotEl,
	);
}
