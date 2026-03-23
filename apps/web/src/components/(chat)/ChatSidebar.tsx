"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
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
import type { ChatThread } from "@/lib/indexeddb/chats";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import { cn } from "@/lib/utils";
import {
	ArrowUpRight,
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
	onRequestDelete: (thread: ChatThread) => void;
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
	onRequestDelete,
	authUser,
	authLoading,
	onSignOut,
}: ChatSidebarProps) {
	const { toggleSidebar, state: sidebarState, isMobile } = useSidebar();
	const { resolvedTheme } = useTheme();
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

	return (
		<>
			<SidebarHeader className="gap-0 px-0 pt-3.5 pb-0">
				<div
					className={cn(
						"mb-3.5 flex w-full items-center gap-2 px-2",
						collapsed ? "justify-center pb-1" : "ml-2",
					)}
				>
					<Link href="/">
						<img
							src={brandSrc}
							alt="AI Stats"
							className={cn(
								"select-none",
								collapsed ? "h-7" : "h-8",
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
				<div className="mb-2 h-px w-full bg-border" />
			</SidebarHeader>
			<SidebarContent>
				<ChatRoomSwitcher />
				<SidebarSeparator className="my-0" />
				<div className="px-2 py-1.5">
					{withCollapsedTooltip(
						"New Chat",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 w-full truncate",
								collapsed ? "justify-center px-0" : "flex-1 justify-start pr-2",
							)}
							onClick={onCreateThread}
							aria-label="New Chat"
						>
							<SquarePen
								className={cn("h-4 w-4", collapsed ? "mr-0" : "mr-2")}
							/>
							{collapsed ? null : "New Chat"}
						</Button>,
					)}
					{withCollapsedTooltip(
						"Database",
						<Button
							variant="ghost"
							className={cn(
								"h-8 min-w-0 w-full truncate",
								collapsed ? "justify-center px-0" : "flex-1 justify-start pr-2",
							)}
							asChild
							aria-label="Database"
						>
							<Link
								href="/"
								className="group/db flex w-full items-center min-w-0"
							>
								<Database
									className={cn(
										"h-4 w-4 shrink-0",
										collapsed ? "mr-0" : "mr-2",
									)}
								/>
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
								"h-8 min-w-0 w-full truncate",
								collapsed ? "justify-center px-0" : "flex-1 justify-start pr-2",
							)}
							onClick={onSearch}
							aria-label="Search Chats"
						>
							<Search className={cn("h-4 w-4", collapsed ? "mr-0" : "mr-2")} />
							{collapsed ? null : "Search Chats"}
						</Button>,
					)}
				</div>
				<SidebarSeparator className="my-0" />
				<ScrollArea className="h-full group-data-[collapsible=icon]:hidden">
					<SidebarGroup className="pt-0 px-2 pb-2">
						<SidebarGroupLabel>Chats</SidebarGroupLabel>
						<SidebarGroupContent className="overflow-hidden">
							<SidebarMenu>
								{groupedThreads.pinned.length > 0 && (
									<div>
										<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
											Pinned
										</p>
										{groupedThreads.pinned.map((thread) => (
											<SidebarMenuItem
												key={thread.id}
												className="w-full overflow-hidden"
											>
												<SidebarMenuButton
													isActive={
														activeId === thread.id
													}
													onClick={() =>
														onSelectThread(thread)
													}
												>
													<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
														{thread.title}
													</span>
												</SidebarMenuButton>
												<DropdownMenu>
													<DropdownMenuTrigger
														asChild
													>
														<SidebarMenuAction
															showOnHover
														>
															<MoreHorizontal className="h-4 w-4" />
														</SidebarMenuAction>
													</DropdownMenuTrigger>
													<DropdownMenuContent side="right">
														<DropdownMenuItem
															onClick={() =>
																onRenameThread(
																	thread
																)
															}
														>
															<PencilLine className="mr-2 h-4 w-4" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																onPinToggle(
																	thread
																)
															}
														>
															<PinOff className="mr-2 h-4 w-4" />
															Unpin
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																onRequestDelete(
																	thread
																)
															}
															className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</SidebarMenuItem>
										))}
									</div>
								)}
								{groupedThreads.today.length > 0 && (
									<div>
										<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
											Today
										</p>
										{groupedThreads.today.map((thread) => (
											<SidebarMenuItem
												key={thread.id}
												className="w-full overflow-hidden"
											>
												<SidebarMenuButton
													isActive={
														activeId === thread.id
													}
													onClick={() =>
														onSelectThread(thread)
													}
												>
													<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
														{thread.title}
													</span>
												</SidebarMenuButton>
												<DropdownMenu>
													<DropdownMenuTrigger
														asChild
													>
														<SidebarMenuAction
															showOnHover
														>
															<MoreHorizontal className="h-4 w-4" />
														</SidebarMenuAction>
													</DropdownMenuTrigger>
													<DropdownMenuContent side="right">
														<DropdownMenuItem
															onClick={() =>
																onRenameThread(
																	thread
																)
															}
														>
															<PencilLine className="mr-2 h-4 w-4" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																onPinToggle(
																	thread
																)
															}
														>
															<Pin className="mr-2 h-4 w-4" />
															Pin
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																onRequestDelete(
																	thread
																)
															}
															className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</SidebarMenuItem>
										))}
									</div>
								)}
								{groupedThreads.yesterday.length > 0 && (
									<div>
										<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
											Yesterday
										</p>
										{groupedThreads.yesterday.map(
											(thread) => (
												<SidebarMenuItem
													key={thread.id}
													className="w-full overflow-hidden"
												>
													<SidebarMenuButton
														isActive={
															activeId ===
															thread.id
														}
														onClick={() =>
															onSelectThread(
																thread
															)
														}
													>
														<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
															{thread.title}
														</span>
													</SidebarMenuButton>
													<DropdownMenu>
														<DropdownMenuTrigger
															asChild
														>
															<SidebarMenuAction
																showOnHover
															>
																<MoreHorizontal className="h-4 w-4" />
															</SidebarMenuAction>
														</DropdownMenuTrigger>
														<DropdownMenuContent side="right">
															<DropdownMenuItem
																onClick={() =>
																	onRenameThread(
																		thread
																	)
																}
															>
																<PencilLine className="mr-2 h-4 w-4" />
																Rename
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() =>
																	onPinToggle(
																		thread
																	)
																}
															>
																<Pin className="mr-2 h-4 w-4" />
																Pin
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																onClick={() =>
																	onRequestDelete(
																		thread
																	)
																}
																className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
															>
																<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</SidebarMenuItem>
											)
										)}
									</div>
								)}
								{groupedThreads.week.length > 0 && (
									<div>
										<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
											This week
										</p>
										{groupedThreads.week.map((thread) => (
											<SidebarMenuItem
												key={thread.id}
												className="w-full overflow-hidden"
											>
												<SidebarMenuButton
													isActive={
														activeId === thread.id
													}
													onClick={() =>
														onSelectThread(thread)
													}
												>
													<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
														{thread.title}
													</span>
												</SidebarMenuButton>
												<DropdownMenu>
													<DropdownMenuTrigger
														asChild
													>
														<SidebarMenuAction
															showOnHover
														>
															<MoreHorizontal className="h-4 w-4" />
														</SidebarMenuAction>
													</DropdownMenuTrigger>
													<DropdownMenuContent side="right">
														<DropdownMenuItem
															onClick={() =>
																onRenameThread(
																	thread
																)
															}
														>
															<PencilLine className="mr-2 h-4 w-4" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																onPinToggle(
																	thread
																)
															}
														>
															<Pin className="mr-2 h-4 w-4" />
															Pin
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																onRequestDelete(
																	thread
																)
															}
															className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</SidebarMenuItem>
										))}
									</div>
								)}
								{groupedThreads.month.length > 0 && (
									<div>
										<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
											This month
										</p>
										{groupedThreads.month.map((thread) => (
											<SidebarMenuItem
												key={thread.id}
												className="w-full overflow-hidden"
											>
												<SidebarMenuButton
													isActive={
														activeId === thread.id
													}
													onClick={() =>
														onSelectThread(thread)
													}
												>
													<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
														{thread.title}
													</span>
												</SidebarMenuButton>
												<DropdownMenu>
													<DropdownMenuTrigger
														asChild
													>
														<SidebarMenuAction
															showOnHover
														>
															<MoreHorizontal className="h-4 w-4" />
														</SidebarMenuAction>
													</DropdownMenuTrigger>
													<DropdownMenuContent side="right">
														<DropdownMenuItem
															onClick={() =>
																onRenameThread(
																	thread
																)
															}
														>
															<PencilLine className="mr-2 h-4 w-4" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																onPinToggle(
																	thread
																)
															}
														>
															<Pin className="mr-2 h-4 w-4" />
															Pin
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																onRequestDelete(
																	thread
																)
															}
															className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</SidebarMenuItem>
										))}
									</div>
								)}
								{groupedThreads.older.length > 0 && (
									<div>
										<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
											Older
										</p>
										{groupedThreads.older.map((thread) => (
											<SidebarMenuItem
												key={thread.id}
												className="w-full overflow-hidden"
											>
												<SidebarMenuButton
													isActive={
														activeId === thread.id
													}
													onClick={() =>
														onSelectThread(thread)
													}
												>
													<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
														{thread.title}
													</span>
												</SidebarMenuButton>
												<DropdownMenu>
													<DropdownMenuTrigger
														asChild
													>
														<SidebarMenuAction
															showOnHover
														>
															<MoreHorizontal className="h-4 w-4" />
														</SidebarMenuAction>
													</DropdownMenuTrigger>
													<DropdownMenuContent side="right">
														<DropdownMenuItem
															onClick={() =>
																onRenameThread(
																	thread
																)
															}
														>
															<PencilLine className="mr-2 h-4 w-4" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																onPinToggle(
																	thread
																)
															}
														>
															<Pin className="mr-2 h-4 w-4" />
															Pin
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																onRequestDelete(
																	thread
																)
															}
															className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</SidebarMenuItem>
										))}
									</div>
								)}
								{threads.length === 0 && (
									<p className="px-2 py-4 text-xs text-muted-foreground">
										No chats yet.
									</p>
								)}
							</SidebarMenu>
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
										Usage
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
