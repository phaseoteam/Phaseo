"use client";

import Link from "next/link";
import { useMemo, useState, type ReactElement } from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	getChatThreadActivityDate,
	getChatThreadActivityTime,
} from "@/components/(chat)/playground/use-grouped-chat-threads";
import type { ChatTag, ChatThread } from "@/lib/indexeddb/chats";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import {
	MobileChatSidebarBrand,
	MobileChatSidebarTrigger,
} from "@/components/(chat)/MobileChatSidebarBrand";
import {
	CHAT_SIDEBAR_ACTIONS_CLASS,
	CHAT_SIDEBAR_HISTORY_GROUP_CLASS,
} from "@/components/(chat)/chatSidebarStyles";
import { cn } from "@/lib/utils";
import {
	Check,
	ChevronRight,
	MoreHorizontal,
	PencilLine,
	Pin,
	PinOff,
	Search,
	SquarePen,
	Tag,
	Trash2,
} from "lucide-react";

export type GroupedThreads = {
	pinned: ChatThread[];
	today: ChatThread[];
	yesterday: ChatThread[];
	week: ChatThread[];
	month: ChatThread[];
	older: ChatThread[];
};

type ChatSidebarProps = {
	groupedThreads: GroupedThreads;
	threads: ChatThread[];
	activeId: string | null;
	temporaryMode: boolean;
	onCreateThread: () => void;
	onSearch: () => void;
	onSelectThread: (thread: ChatThread) => void;
	onRenameThread: (thread: ChatThread) => void;
	onPinToggle: (thread: ChatThread) => void;
	onEditTags: (thread: ChatThread) => void;
	onEditSelectedTags: (threads: ChatThread[]) => void;
	onRequestDelete: (thread: ChatThread) => void;
	onRequestDeleteSelected: (threads: ChatThread[]) => void;
	tags: ChatTag[];
	activeTagId: string | null;
	onTagFilterChange: (tagId: string | null) => void;
};

type ThreadDateGroup = {
	key: string;
	label: string;
	threads: ChatThread[];
};

function getThreadDate(thread: ChatThread) {
	return getChatThreadActivityDate(thread);
}

function getThreadDateKey(date: Date | null) {
	if (!date) return "unknown";
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function buildThreadDateGroups(
	groupedThreads: GroupedThreads,
	formatDate: (date: Date | null) => string,
) {
	const groups = new Map<string, ThreadDateGroup>();

	const appendThreads = (threads: ChatThread[], labelOverride?: string) => {
		for (const thread of threads) {
			const date = getThreadDate(thread);
			const key = getThreadDateKey(date);
			const existing = groups.get(key);
			if (existing) {
				existing.threads.push(thread);
				continue;
			}
			groups.set(key, {
				key,
				label: labelOverride ?? formatDate(date),
				threads: [thread],
			});
		}
	};

	appendThreads(groupedThreads.today, "Today");
	appendThreads(groupedThreads.yesterday, "Yesterday");
	appendThreads(groupedThreads.week);
	appendThreads(groupedThreads.month);
	appendThreads(groupedThreads.older);

	return Array.from(groups.values());
}

function ThreadDateHeading({ children }: { children: string }) {
	return (
		<div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
			<span className="h-px min-w-3 flex-1 bg-border/60" />
			<span className="shrink-0">{children}</span>
			<span className="h-px min-w-3 flex-1 bg-border/60" />
		</div>
	);
}

export function ChatSidebar({
	groupedThreads,
	threads,
	activeId,
	temporaryMode,
	onCreateThread,
	onSearch,
	onSelectThread,
	onRenameThread,
	onPinToggle,
	onEditTags,
	onEditSelectedTags,
	onRequestDelete,
	onRequestDeleteSelected,
	tags,
	activeTagId,
	onTagFilterChange,
}: ChatSidebarProps) {
	const format = useDisplayFormatters();
	const { state: sidebarState, isMobile } = useSidebar();
	const [tagsOpen, setTagsOpen] = useState(true);
	const [chatEditMode, setChatEditMode] = useState(false);
	const [visibleTagCount, setVisibleTagCount] = useState(5);
	const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(
		() => new Set(),
	);
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const withCollapsedTooltip = (label: string, button: ReactElement) =>
		collapsed ? (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent side="right" align="center" sideOffset={10}>
					{label}
				</TooltipContent>
			</Tooltip>
		) : (
			button
		);
	const activeTag = tags.find((tag) => tag.id === activeTagId) ?? null;
	const dateThreadGroups = buildThreadDateGroups(
		groupedThreads,
		(date) => date ? format.date(date) : "Unknown date",
	);
	const tagsByRecentUse = useMemo(() => {
		const latestUseByTagId = new Map<string, number>();
		for (const thread of threads) {
			const timestamp = getChatThreadActivityTime(thread) ?? 0;
			for (const tag of thread.tags ?? []) {
				latestUseByTagId.set(
					tag.id,
					Math.max(latestUseByTagId.get(tag.id) ?? 0, timestamp),
				);
			}
		}
		return [...tags].sort((first, second) => {
			const recentDiff =
				(latestUseByTagId.get(second.id) ?? 0) -
				(latestUseByTagId.get(first.id) ?? 0);
			if (recentDiff !== 0) return recentDiff;
			return first.name.localeCompare(second.name);
		});
	}, [tags, threads]);
	const visibleTags = tagsByRecentUse.slice(0, visibleTagCount);
	const canShowMoreTags = visibleTagCount < tagsByRecentUse.length;
	const selectedThreads = useMemo(
		() => threads.filter((thread) => selectedThreadIds.has(thread.id)),
		[threads, selectedThreadIds],
	);
	const selectedCount = selectedThreads.length;
	const toggleThreadSelection = (threadId: string) => {
		setSelectedThreadIds((prev) => {
			const next = new Set(prev);
			if (next.has(threadId)) {
				next.delete(threadId);
			} else {
				next.add(threadId);
			}
			return next;
		});
	};

	const renderThreadItem = (thread: ChatThread, pinned = false) => {
		const selected = selectedThreadIds.has(thread.id);
		return (
		<SidebarMenuItem key={thread.id} className="mb-1 w-full overflow-hidden last:mb-0">
			<SidebarMenuButton
				isActive={chatEditMode ? selected : activeId === thread.id}
				onClick={() =>
					chatEditMode
						? toggleThreadSelection(thread.id)
						: onSelectThread(thread)
				}
				className={cn("rounded-md", chatEditMode && "gap-2")}
			>
				{chatEditMode ? (
					<span
						className={cn(
							"flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
							selected
								? "border-primary bg-primary text-primary-foreground"
								: "border-border text-transparent",
						)}
					>
						<Check className="h-3 w-3" />
					</span>
				) : null}
				<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
					{thread.title}
				</span>
			</SidebarMenuButton>
			{chatEditMode ? null : (
				<DropdownMenu>
					<DropdownMenuTrigger render={<SidebarMenuAction
							showOnHover
							aria-label={`Open actions for ${thread.title}`} />}>

							<MoreHorizontal className="h-4 w-4" />

					</DropdownMenuTrigger>
					<DropdownMenuContent side="right" className="rounded-md [&_[data-slot=dropdown-menu-item]]:rounded-md">
						<DropdownMenuItem onClick={() => onRenameThread(thread)}>
							<PencilLine className="mr-2 h-4 w-4" />
							Rename
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onPinToggle(thread)}>
							{pinned ? (
								<PinOff className="mr-2 h-4 w-4" />
							) : (
								<Pin className="mr-2 h-4 w-4" />
							)}
							{pinned ? "Unpin" : "Pin"}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onEditTags(thread)}>
							<Tag className="mr-2 h-4 w-4" />
							Tags
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							className="cursor-pointer"
							onClick={() => onRequestDelete(thread)}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</SidebarMenuItem>
		);
	};

	return (
		<>
			<SidebarHeader className="h-[57px] gap-0 border-b border-border px-0 py-0">
				<div className="flex h-full min-w-0 items-center px-0">
					<MobileChatSidebarBrand />
					<ChatRoomSwitcher className="min-w-0 flex-1" />
					<MobileChatSidebarTrigger />
				</div>
			</SidebarHeader>
			<SidebarContent className="gap-0">
				<div data-chat-sidebar-actions="true" className={CHAT_SIDEBAR_ACTIONS_CLASS}>
					{withCollapsedTooltip(
						"New Chat",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 w-full gap-2 text-sm font-medium",
								collapsed
									? "justify-start px-2"
									: "w-full flex-1 justify-start px-2",
							)}
							onClick={onCreateThread}
							aria-label="New Chat"
						>
							<SquarePen className="h-4 w-4 shrink-0" />
							{collapsed ? null : (
								<span className="truncate text-left">New Chat</span>
							)}
						</Button>,
					)}
					{withCollapsedTooltip(
						"Search Chats",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 w-full gap-2 text-sm font-medium",
								collapsed
									? "justify-start px-2"
									: "w-full flex-1 justify-start px-2",
							)}
							onClick={onSearch}
							aria-label="Search Chats"
						>
							<Search className="h-4 w-4 shrink-0" />
							{collapsed ? null : (
								<span className="truncate text-left">Search Chats</span>
							)}
						</Button>,
					)}
				</div>
				<SidebarSeparator className="mx-0 my-0 w-full" />
				<ScrollArea className="h-full group-data-[collapsible=icon]:hidden">
					<SidebarGroup className={CHAT_SIDEBAR_HISTORY_GROUP_CLASS}>
						{tags.length > 0 ? (
							<Collapsible
								open={tagsOpen}
								onOpenChange={setTagsOpen}
								className="border-b border-border/70 pb-1"
							>
								<div className="flex h-7 items-center gap-2 px-3">
									<CollapsibleTrigger asChild>
										<button
											type="button"
											className="flex h-7 min-w-0 flex-1 items-center justify-between rounded-md text-[13px] font-semibold leading-none text-foreground/80 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
										>
											<span className="truncate">Tags</span>
											<ChevronRight
												className={cn(
													"h-3.5 w-3.5 shrink-0 transition-transform",
													tagsOpen && "rotate-90",
												)}
											/>
										</button>
									</CollapsibleTrigger>
									{activeTag ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-6 px-1.5 text-xs text-muted-foreground"
											onClick={() => onTagFilterChange(null)}
										>
											All
										</Button>
									) : null}
								</div>
								<CollapsibleContent>
									<SidebarMenu className="gap-0.5 pb-1 pt-0.5">
										{visibleTags.map((tag) => {
											const selected = activeTagId === tag.id;
											return (
												<SidebarMenuItem key={tag.id}>
													<SidebarMenuButton
														isActive={selected}
														onClick={() =>
															onTagFilterChange(selected ? null : tag.id)
														}
														className="h-8 px-3"
													>
														<span
															className="h-2.5 w-2.5 shrink-0 rounded-full"
															style={{ backgroundColor: tag.color }}
														/>
														<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
															{tag.name}
														</span>
													</SidebarMenuButton>
												</SidebarMenuItem>
											);
										})}
										{canShowMoreTags ? (
											<div className="flex justify-center pt-0.5">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
													onClick={() =>
														setVisibleTagCount((count) => count + 5)
													}
												>
													Show more
												</Button>
											</div>
										) : null}
									</SidebarMenu>
								</CollapsibleContent>
							</Collapsible>
						) : null}
						<div className="mt-1 flex h-7 items-center gap-2 px-3">
							<div className="min-w-0 flex-1 text-[13px] font-semibold leading-none text-foreground/80">
								{activeTag ? (
									<span className="flex min-w-0 items-center gap-1.5">
										<span
											className="h-2 w-2 shrink-0 rounded-full"
											style={{ backgroundColor: activeTag.color }}
										/>
										<span className="truncate">{activeTag.name}</span>
									</span>
								) : (
									"Chats"
								)}
							</div>
							{threads.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
									onClick={() => {
										setChatEditMode((open) => !open);
										setSelectedThreadIds(new Set());
									}}
								>
									{chatEditMode ? "Done" : "Edit"}
								</Button>
							) : null}
						</div>
						{chatEditMode ? (
							<div className="mx-2 mb-1 grid h-8 grid-cols-2 items-center gap-1 rounded-md border border-border/70 bg-muted/25 p-0.5">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 w-full px-1.5 text-xs"
									disabled={selectedCount === 0}
									onClick={() => onEditSelectedTags(selectedThreads)}
								>
									<Tag className="mr-1 h-3.5 w-3.5" />
									Tags
								</Button>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									className="h-7 w-full px-1.5 text-xs"
									disabled={selectedCount === 0}
									onClick={() => onRequestDeleteSelected(selectedThreads)}
								>
									<Trash2 className="mr-1 h-3.5 w-3.5" />
									Delete
								</Button>
							</div>
						) : null}
						<SidebarGroupContent className="overflow-hidden">
							<SidebarMenu>
								{groupedThreads.pinned.length > 0 && (
									<div className="pb-1">
										<p className="px-3 pb-1.5 pt-2 text-xs font-semibold text-muted-foreground">
											Pinned
										</p>
										{groupedThreads.pinned.map((thread) =>
											renderThreadItem(thread, true),
										)}
									</div>
								)}
								{dateThreadGroups.map((group) => (
									<div key={group.key} className="pb-1">
										<ThreadDateHeading>
											{group.label}
										</ThreadDateHeading>
										{group.threads.map((thread) =>
											renderThreadItem(thread),
										)}
									</div>
								))}
								{threads.length === 0 && (
									<p className="px-2 py-4 text-xs text-muted-foreground">
										{activeTagId ? "No chats with this tag." : "No chats yet."}
									</p>
								)}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</ScrollArea>
			</SidebarContent>
		</>
	);
}
