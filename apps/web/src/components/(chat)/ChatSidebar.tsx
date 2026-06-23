"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactElement, type UIEvent } from "react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatTag, ChatThread } from "@/lib/indexeddb/chats";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import { ChatSidebarModelsIcon } from "@/components/(chat)/ChatSidebarModelsIcon";
import { cn } from "@/lib/utils";
import {
	ArrowUpRight,
	ChevronRight,
	Download,
	Gauge,
	LogOut,
	MoreHorizontal,
	PanelLeftClose,
	PencilLine,
	Pin,
	PinOff,
	Search,
	SquarePen,
	Tag,
	Trash2,
	UserRound,
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
	onRequestDelete: (thread: ChatThread) => void;
	onExportThreads: (threads: ChatThread[]) => void;
	onDeleteThreads: (threads: ChatThread[]) => void | Promise<void>;
	tags: ChatTag[];
	activeTagId: string | null;
	onTagFilterChange: (tagId: string | null) => void;
	hasMoreThreads: boolean;
	isLoadingMoreThreads: boolean;
	onLoadMoreThreads: () => void;
	authUser: {
		id: string;
		email: string | null;
		name: string;
		avatarUrl: string | null;
	} | null;
	authLoading: boolean;
	onSignOut: () => void;
};

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
	onRequestDelete,
	onExportThreads,
	onDeleteThreads,
	tags,
	activeTagId,
	onTagFilterChange,
	hasMoreThreads,
	isLoadingMoreThreads,
	onLoadMoreThreads,
	authUser,
	authLoading,
	onSignOut,
}: ChatSidebarProps) {
	const { toggleSidebar, state: sidebarState, isMobile } = useSidebar();
	const { resolvedTheme } = useTheme();
	const [bulkMode, setBulkMode] = useState(false);
	const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
	const [tagsOpen, setTagsOpen] = useState(true);
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const isDarkTheme = resolvedTheme === "dark";
	const brandSrc = collapsed
		? isDarkTheme
			? "/logo_dark.svg"
			: "/logo_light.svg"
		: isDarkTheme
			? "/wordmark_dark.svg"
			: "/wordmark_light.svg";
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
	const nameParts = authUser?.name?.trim().split(" ").filter(Boolean) ?? [];
	const firstName = nameParts[0] ?? "Account";
	const initials = nameParts
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	const selectedThreadIdSet = useMemo(
		() => new Set(selectedThreadIds),
		[selectedThreadIds],
	);
	const selectedThreads = useMemo(
		() => threads.filter((thread) => selectedThreadIdSet.has(thread.id)),
		[threads, selectedThreadIdSet],
	);
	const activeTag = useMemo(
		() => tags.find((tag) => tag.id === activeTagId) ?? null,
		[activeTagId, tags],
	);
	const allSelected = threads.length > 0 && selectedThreadIds.length === threads.length;
	const selectionSummary =
		selectedThreadIds.length === 1
			? "1 selected"
			: `${selectedThreadIds.length} selected`;
	const enterBulkMode = () => {
		setBulkMode(true);
	};
	const exitBulkMode = () => {
		setBulkMode(false);
		setSelectedThreadIds([]);
	};
	const toggleThreadSelection = (threadId: string) => {
		setSelectedThreadIds((prev) =>
			prev.includes(threadId)
				? prev.filter((id) => id !== threadId)
				: [...prev, threadId],
		);
	};
	const setThreadsSelected = (targetThreads: ChatThread[], selected: boolean) => {
		const ids = targetThreads.map((thread) => thread.id);
		setSelectedThreadIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				if (selected) {
					next.add(id);
				} else {
					next.delete(id);
				}
			}
			return [...next];
		});
	};
	const setAllSelected = (selected: boolean) => {
		setSelectedThreadIds(selected ? threads.map((thread) => thread.id) : []);
	};
	const handleTagClick = (tagId: string) => {
		exitBulkMode();
		onTagFilterChange(activeTagId === tagId ? null : tagId);
	};
	const handleChatScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (!hasMoreThreads || isLoadingMoreThreads) return;
			const target = event.target as HTMLDivElement;
			const remaining =
				target.scrollHeight - target.scrollTop - target.clientHeight;
			if (remaining < 120) {
				onLoadMoreThreads();
			}
		},
		[hasMoreThreads, isLoadingMoreThreads, onLoadMoreThreads],
	);
	const handleBulkExport = () => {
		if (selectedThreads.length === 0) return;
		onExportThreads(selectedThreads);
	};
	const handleBulkDelete = async () => {
		if (selectedThreads.length === 0) return;
		await onDeleteThreads(selectedThreads);
		exitBulkMode();
	};
	const threadGroups = [
		{ key: "pinned", label: "Pinned", threads: groupedThreads.pinned },
		{ key: "today", label: "Today", threads: groupedThreads.today },
		{ key: "yesterday", label: "Yesterday", threads: groupedThreads.yesterday },
		{ key: "week", label: "This week", threads: groupedThreads.week },
		{ key: "month", label: "This month", threads: groupedThreads.month },
		{ key: "older", label: "Older", threads: groupedThreads.older },
	] as const;
	const renderThreadGroup = (
		label: string,
		groupThreads: ChatThread[],
		isPinnedGroup = false,
	) => {
		if (groupThreads.length === 0) return null;
		const groupSelected =
			groupThreads.length > 0 &&
			groupThreads.every((thread) => selectedThreadIdSet.has(thread.id));
		const groupPartlySelected =
			!groupSelected &&
			groupThreads.some((thread) => selectedThreadIdSet.has(thread.id));

		return (
			<div key={label}>
				<div className="flex items-center gap-2 px-2 pb-2 pt-3">
					{bulkMode ? (
						<Checkbox
							checked={
								groupSelected
									? true
									: groupPartlySelected
										? "indeterminate"
										: false
							}
							onCheckedChange={(checked) =>
								setThreadsSelected(groupThreads, checked === true)
							}
							aria-label={`Select ${label} chats`}
							className="h-3.5 w-3.5"
						/>
					) : null}
					<p className="min-w-0 flex-1 text-xs font-semibold uppercase text-muted-foreground">
						{label}
					</p>
				</div>
				{groupThreads.map((thread) => {
					const selected = selectedThreadIdSet.has(thread.id);
					return (
						<SidebarMenuItem
							key={thread.id}
							className="w-full overflow-hidden"
						>
							{bulkMode ? (
								<div
									role="button"
									tabIndex={0}
									className={cn(
										"flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
										selected &&
											"bg-sidebar-accent text-sidebar-accent-foreground",
									)}
									onClick={() => toggleThreadSelection(thread.id)}
									onKeyDown={(event) => {
										if (
											event.key === "Enter" ||
											event.key === " "
										) {
											event.preventDefault();
											toggleThreadSelection(thread.id);
										}
									}}
								>
									<Checkbox
										checked={selected}
										onCheckedChange={() =>
											toggleThreadSelection(thread.id)
										}
										onClick={(event) => event.stopPropagation()}
										aria-label={`Select ${thread.title}`}
										className="h-3.5 w-3.5"
									/>
									<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
										{thread.title}
									</span>
								</div>
							) : (
								<SidebarMenuButton
									isActive={activeId === thread.id}
									onClick={() => onSelectThread(thread)}
								>
									<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
										{thread.title}
									</span>
								</SidebarMenuButton>
							)}
							{bulkMode ? null : (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<SidebarMenuAction showOnHover>
											<MoreHorizontal className="h-4 w-4" />
										</SidebarMenuAction>
									</DropdownMenuTrigger>
									<DropdownMenuContent side="right">
										<DropdownMenuItem
											onClick={() => onRenameThread(thread)}
										>
											<PencilLine className="mr-2 h-4 w-4" />
											Rename
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => onExportThreads([thread])}
										>
											<Download className="mr-2 h-4 w-4" />
											Export
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => onEditTags(thread)}
										>
											<Tag className="mr-2 h-4 w-4" />
											Tags
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => onPinToggle(thread)}
										>
											{isPinnedGroup ? (
												<PinOff className="mr-2 h-4 w-4" />
											) : (
												<Pin className="mr-2 h-4 w-4" />
											)}
											{isPinnedGroup ? "Unpin" : "Pin"}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() => onRequestDelete(thread)}
											className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
										>
											<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</SidebarMenuItem>
					);
				})}
			</div>
		);
	};

	return (
		<>
			<SidebarHeader className="h-[61px] gap-0 border-b border-border px-0 py-0">
				<div
					className={cn(
						"flex h-full w-full items-center gap-2 px-3",
						collapsed ? "justify-center px-2 pb-1" : "",
					)}
				>
					<Link
						href="/"
						className={cn(
							"flex min-w-0 items-center",
							collapsed ? "justify-center" : "w-full",
						)}
						aria-label="AI Stats home"
					>
						<Image
							src={brandSrc}
							alt="AI Stats"
							className={cn(
								"select-none object-contain",
								collapsed ? "h-7 w-7" : "h-8 w-auto max-w-[132px]",
							)}
							width={collapsed ? 28 : 132}
							height={32}
							priority
						/>
					</Link>
					<Button
						variant="ghost"
						size="icon"
						className="ml-auto md:hidden"
						onClick={toggleSidebar}
						aria-label="Close sidebar"
					>
						<PanelLeftClose className="h-4 w-4" />
					</Button>
				</div>
			</SidebarHeader>
			<SidebarContent className="gap-0">
				<ChatRoomSwitcher />
				<SidebarSeparator className="my-0" />
				<div className="flex flex-col px-2 pb-1 pt-1.5">
					{withCollapsedTooltip(
						"New Chat",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 gap-2 text-sm font-medium",
								collapsed
									? "w-8 justify-center px-0"
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
						"Models",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 gap-2 text-sm font-medium",
								collapsed
									? "w-8 justify-center px-0"
									: "w-full flex-1 justify-start px-2",
							)}
							asChild
							aria-label="Models"
						>
							<Link
								href="/models"
								className={cn(
									"group/db flex min-w-0 items-center gap-2",
									collapsed
										? "justify-center"
									: "w-full justify-start",
								)}
							>
								<ChatSidebarModelsIcon />
								{collapsed ? null : (
									<>
										<span className="flex-1 min-w-0 truncate text-left">
											Models
										</span>
										<ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover/db:opacity-100" />
									</>
								)}
							</Link>
						</Button>,
					)}
					{withCollapsedTooltip(
						"Search Chats",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 gap-2 text-sm font-medium",
								collapsed
									? "w-8 justify-center px-0"
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
				<SidebarSeparator className="my-0" />
				<ScrollArea
					className="h-full group-data-[collapsible=icon]:hidden"
					viewportClassName="pr-1"
					onScrollCapture={handleChatScroll}
				>
					<SidebarGroup className="px-2 pb-2 pt-0">
						{tags.length > 0 ? (
							<Collapsible
								open={tagsOpen}
								onOpenChange={setTagsOpen}
								className="border-b border-border/70 pb-2"
							>
								<div className="flex h-8 items-center gap-2 px-2">
									<CollapsibleTrigger asChild>
										<button
											type="button"
											className="flex h-8 min-w-0 flex-1 items-center justify-between rounded-md text-xs font-semibold text-muted-foreground outline-hidden ring-sidebar-ring transition-colors hover:text-foreground focus-visible:ring-2"
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
									<SidebarMenu className="gap-0.5">
										{tags.map((tag) => {
											const selected = activeTagId === tag.id;
											return (
												<SidebarMenuItem key={tag.id}>
													<SidebarMenuButton
														isActive={selected}
														onClick={() => handleTagClick(tag.id)}
														className="h-8 px-2"
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
									</SidebarMenu>
								</CollapsibleContent>
							</Collapsible>
						) : null}
						<div className="group/bulk flex h-8 items-center gap-2 px-2">
							{bulkMode ? (
								<Checkbox
									checked={allSelected}
									onCheckedChange={(checked) => setAllSelected(checked === true)}
									aria-label="Select all chats"
									className="h-3.5 w-3.5"
								/>
							) : null}
							<SidebarGroupLabel className="h-auto flex-1 px-0">
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
							</SidebarGroupLabel>
							{activeTag && !bulkMode ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-xs text-muted-foreground"
									onClick={() => onTagFilterChange(null)}
								>
									All Chats
								</Button>
							) : null}
							{threads.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className={cn(
										"h-6 px-1.5 text-xs transition-colors",
										!bulkMode && "text-muted-foreground",
									)}
									onClick={bulkMode ? exitBulkMode : enterBulkMode}
									aria-label={bulkMode ? "Done editing chats" : "Edit chats"}
								>
									{bulkMode ? "Done" : "Edit"}
								</Button>
							) : null}
						</div>
						{bulkMode ? (
							<div className="mb-2 rounded-lg border border-border bg-muted/30 p-2">
								<div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
									<span>{selectionSummary}</span>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-6 px-1.5 text-xs"
										onClick={() => setAllSelected(!allSelected)}
									>
										{allSelected ? "Clear all" : "Select all"}
									</Button>
								</div>
								<div className="grid grid-cols-2 gap-1">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-7 gap-1.5 px-2 text-xs"
										disabled={selectedThreads.length === 0}
										onClick={handleBulkExport}
									>
										<Download className="h-3.5 w-3.5" />
										Export
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-7 gap-1.5 px-2 text-xs hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
										disabled={selectedThreads.length === 0}
										onClick={handleBulkDelete}
									>
										<Trash2 className="h-3.5 w-3.5" />
										Delete
									</Button>
								</div>
							</div>
						) : null}
						<SidebarGroupContent className="overflow-hidden">
							<SidebarMenu>
								{threadGroups.map((group) =>
									renderThreadGroup(
										group.label,
										group.threads,
										group.key === "pinned",
									),
								)}
								{threads.length === 0 && (
									<p className="px-2 py-4 text-xs text-muted-foreground">
										{activeTagId ? "No chats with this tag." : "No chats yet."}
									</p>
								)}
							</SidebarMenu>
							{hasMoreThreads ? (
								<div className="px-2 pt-2">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-8 w-full text-xs"
										disabled={isLoadingMoreThreads}
										onClick={onLoadMoreThreads}
									>
										{isLoadingMoreThreads ? "Loading..." : "Load more chats"}
									</Button>
								</div>
							) : null}
						</SidebarGroupContent>
					</SidebarGroup>
				</ScrollArea>
			</SidebarContent>
			<SidebarFooter className="border-t border-border px-3 py-3">
				{authUser ? (
					<div className="grid gap-3">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									className={cn(
										"w-full gap-3",
										collapsed ? "justify-center px-0" : "justify-start",
									)}
								>
									<Avatar className="h-8 w-8 rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
										{authUser.avatarUrl && (
											<AvatarImage
												src={authUser.avatarUrl}
												alt={authUser.name}
												className="object-cover"
											/>
										)}
										<AvatarFallback className="rounded-lg text-[11px] font-semibold">
											{initials || "U"}
										</AvatarFallback>
									</Avatar>
									<div
										className={cn(
											"flex min-w-0 flex-col items-start",
											collapsed && "hidden",
										)}
									>
										<span className="truncate text-sm font-medium">
											{firstName}
										</span>
									</div>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								side={collapsed ? "right" : "top"}
								align="start"
								sideOffset={8}
								className="w-56 z-[90]"
							>
								<DropdownMenuItem asChild>
									<Link href="/settings/account">
										<UserRound className="mr-2 h-4 w-4" />
										Account
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
								<Link href="/gateway/usage">
										<Gauge className="mr-2 h-4 w-4" />
										Observability
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={onSignOut}>
									<LogOut className="mr-2 h-4 w-4" />
									Sign out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						{!temporaryMode && !collapsed && (
							<p className="text-[11px] text-muted-foreground">
								All data is stored locally in your browser.
							</p>
						)}
						{temporaryMode && !collapsed && (
							<p className="text-[11px] text-muted-foreground">
								Temporary chat is active. Messages will not be
								saved.
							</p>
						)}
					</div>
				) : authLoading ? (
					<div className="h-9 w-full rounded-md bg-muted/40" />
				) : (
					<Button
						variant="ghost"
						className="w-full justify-start"
						asChild
					>
						<Link href="/sign-in">Sign in to chat</Link>
					</Button>
				)}
			</SidebarFooter>
		</>
	);
}
