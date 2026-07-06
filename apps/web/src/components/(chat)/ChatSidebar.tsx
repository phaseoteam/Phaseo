"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { ThemeSelector } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
	ArrowUpRight,
	ChevronRight,
	Database,
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
	tags: ChatTag[];
	activeTagId: string | null;
	onTagFilterChange: (tagId: string | null) => void;
	authUser: {
		id: string;
		email: string | null;
		name: string;
		avatarUrl: string | null;
	} | null;
	authLoading: boolean;
	onSignOut: () => void;
};

type ThreadDateGroup = {
	key: string;
	label: string;
	threads: ChatThread[];
};

function getOrdinalDay(day: number) {
	const remainder = day % 100;
	if (remainder >= 11 && remainder <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

function getThreadDate(thread: ChatThread) {
	const date = new Date(thread.updatedAt);
	return Number.isNaN(date.getTime()) ? null : date;
}

function getThreadDateKey(date: Date | null) {
	if (!date) return "unknown";
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function formatThreadDate(date: Date | null) {
	if (!date) return "Unknown date";
	const month = date.toLocaleDateString("en-GB", { month: "long" });
	return `${getOrdinalDay(date.getDate())} ${month} ${date.getFullYear()}`;
}

function buildThreadDateGroups(groupedThreads: GroupedThreads) {
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
				label: labelOverride ?? formatThreadDate(date),
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
		<div className="flex items-center gap-2 px-2 pb-1 pt-2.5 text-xs font-semibold text-foreground">
			<span className="h-px min-w-3 flex-1 bg-border" />
			<span className="shrink-0">{children}</span>
			<span className="h-px min-w-3 flex-1 bg-border" />
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
	onRequestDelete,
	tags,
	activeTagId,
	onTagFilterChange,
	authUser,
	authLoading,
	onSignOut,
}: ChatSidebarProps) {
	const { toggleSidebar, state: sidebarState, isMobile } = useSidebar();
	const [tagsOpen, setTagsOpen] = useState(true);
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const brandLightSrc = collapsed ? "/logo_light.svg" : "/wordmark_light.svg";
	const brandDarkSrc = collapsed ? "/logo_dark.svg" : "/wordmark_dark.svg";
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
	const activeTag = tags.find((tag) => tag.id === activeTagId) ?? null;
	const dateThreadGroups = buildThreadDateGroups(groupedThreads);
	const renderThreadItem = (thread: ChatThread, pinned = false) => (
		<SidebarMenuItem key={thread.id} className="w-full overflow-hidden">
			<SidebarMenuButton
				isActive={activeId === thread.id}
				onClick={() => onSelectThread(thread)}
			>
				<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
					{thread.title}
				</span>
			</SidebarMenuButton>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<SidebarMenuAction
						showOnHover
						aria-label={`Open actions for ${thread.title}`}
					>
						<MoreHorizontal className="h-4 w-4" />
					</SidebarMenuAction>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="right">
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
						onClick={() => onRequestDelete(thread)}
						className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
					>
						<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);

	return (
		<>
			<SidebarHeader className="h-[57px] gap-0 border-b border-border px-0 py-0">
				<div
					className={cn(
						"flex h-full w-full items-center gap-2 px-2",
						collapsed ? "justify-center" : "ml-2",
					)}
				>
					<Link href="/" aria-label="Phaseo">
						<img
							src={brandLightSrc}
							alt=""
							aria-hidden="true"
							className={cn(
								"select-none",
								collapsed ? "h-7" : "h-8",
								"block dark:hidden",
							)}
						/>
						<img
							src={brandDarkSrc}
							alt=""
							aria-hidden="true"
							className={cn(
								"select-none",
								collapsed ? "h-7" : "h-8",
								"hidden dark:block",
							)}
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
				<div className="px-2 py-1.5">
					{withCollapsedTooltip(
						"New Chat",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 w-full gap-2 text-sm font-medium",
								collapsed
									? "justify-center px-0"
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
						"Database",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 w-full gap-2 text-sm font-medium",
								collapsed
									? "justify-center px-0"
									: "w-full flex-1 justify-start px-2",
							)}
							asChild
							aria-label="Database"
						>
							<Link
								href="/"
								className={cn(
									"group/db flex w-full min-w-0 items-center gap-2",
									collapsed && "justify-center",
								)}
							>
								<Database className="h-4 w-4 shrink-0" />
								{collapsed ? null : (
									<>
										<span className="flex-1 min-w-0 truncate text-left">
											Database
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
								"h-8 min-w-0 w-full gap-2 text-sm font-medium",
								collapsed
									? "justify-center px-0"
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
				<ScrollArea className="h-full group-data-[collapsible=icon]:hidden">
					<SidebarGroup className="px-2 pb-2 pt-3.5">
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
											className="flex h-8 min-w-0 flex-1 items-center justify-between rounded-md text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
														onClick={() =>
															onTagFilterChange(selected ? null : tag.id)
														}
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
						<SidebarGroupLabel className="h-3.5 px-3 text-[13px] font-semibold leading-none text-foreground/80">
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
			<SidebarFooter className="border-t border-border px-3 py-3">
				{authUser ? (
					<div className="grid gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									className={cn(
										"h-auto min-h-14 w-full touch-manipulation items-center gap-3 rounded-2xl py-2 active:bg-muted data-open:bg-muted",
										collapsed ? "justify-center px-0" : "justify-start",
									)}
									aria-label="Open account menu"
								>
									<Avatar className="pointer-events-none h-8 w-8 rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
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
											"pointer-events-none flex min-w-0 flex-col items-start text-left",
											collapsed && "hidden",
										)}
									>
										<span className="truncate text-sm font-medium">
											{firstName}
										</span>
										<span className="truncate text-[11px] font-normal text-muted-foreground">
											{temporaryMode
												? "Temporary chat is active."
												: "All data is stored locally."}
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
										Usage
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<div className="flex min-h-10 items-center justify-between gap-3 px-2 py-1.5">
									<span className="text-sm">Theme</span>
									<ThemeSelector className="shrink-0" showSelectedLabel={false} />
								</div>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={onSignOut}>
									<LogOut className="mr-2 h-4 w-4" />
									Sign out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						{temporaryMode && !collapsed && (
							<p className="text-[11px] text-muted-foreground">
								Messages will not be saved.
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
