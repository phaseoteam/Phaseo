"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { UIEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const WORKSPACE_ROW_HEIGHT = 40;
const WORKSPACE_ROW_GAP = 4;
const WORKSPACE_LIST_PADDING = 16;
const WORKSPACE_SEARCH_HEADER_SPACE = 32;

export type WorkspaceOption = { id: string; name: string };

type WorkspacePage = {
	workspaces: WorkspaceOption[];
	hasMore: boolean;
};

type WorkspaceComboboxProps = {
	workspaces: WorkspaceOption[];
	activeWorkspaceId?: string;
	triggerVariant?: "header" | "icon";
	align?: "start" | "center" | "end";
	onSelect: (workspace: WorkspaceOption) => Promise<boolean> | boolean;
};

async function fetchWorkspacePage(path: string, signal?: AbortSignal): Promise<WorkspacePage> {
	const response = await fetch(path, {
		method: "GET",
		credentials: "same-origin",
		headers: { Accept: "application/json" },
		signal,
	});
	if (!response.ok) throw new Error("Workspace search failed");
	const payload = (await response.json()) as Partial<WorkspacePage>;
	return {
		workspaces: Array.isArray(payload.workspaces) ? payload.workspaces : [],
		hasMore: Boolean(payload.hasMore),
	};
}

export function WorkspaceCombobox({
	workspaces,
	activeWorkspaceId,
	triggerVariant = "header",
	align = "end",
	onSelect,
}: WorkspaceComboboxProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const normalizedSearch = search.trim();

	useEffect(() => {
		const timeout = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 250);
		return () => window.clearTimeout(timeout);
	}, [normalizedSearch]);

	const isSearching = normalizedSearch.length >= 2;
	const isDebouncing = isSearching && normalizedSearch !== debouncedSearch;
	const searchQuery = useInfiniteQuery({
		queryKey: ["workspace-switcher-search", debouncedSearch],
		queryFn: ({ pageParam, signal }) => {
			const params = new URLSearchParams({
				q: debouncedSearch,
				offset: String(pageParam),
			});
			return fetchWorkspacePage(`/api/search/workspace-switcher?${params.toString()}`, signal);
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length * PAGE_SIZE : undefined,
		enabled: open && isSearching && !isDebouncing,
		staleTime: 30_000,
		retry: false,
	});

	const listedWorkspaces = useMemo(() => {
		if (!isSearching) return workspaces;
		return (searchQuery.data?.pages.flatMap((page) => page.workspaces) ?? []).sort((left, right) =>
			left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id),
		);
	}, [isSearching, searchQuery.data, workspaces]);
	const hasMoreSearchResults = Boolean(searchQuery.hasNextPage);
	const isLoading = isDebouncing || searchQuery.isLoading;
	const isSearchingError = searchQuery.isError;

	function handleListScroll(event: UIEvent<HTMLDivElement>) {
		const element = event.currentTarget;
		const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 48;
		if (isSearching && nearBottom && hasMoreSearchResults && !searchQuery.isFetchingNextPage) {
			void searchQuery.fetchNextPage();
		}
	}

	async function selectWorkspace(workspace: WorkspaceOption) {
		try {
			if (await onSelect(workspace)) setOpen(false);
		} catch {
			// The caller reports switching errors; keep the picker open for another attempt.
		}
	}

	const activeWorkspace = workspaces.find(({ id }) => id === activeWorkspaceId) ?? workspaces[0];
	const isIconTrigger = triggerVariant === "icon";
	const showWorkspaceResults = !isSearching || (!isLoading && !isSearchingError);
	const scrollAreaHeight = showWorkspaceResults && listedWorkspaces.length > 0
		? listedWorkspaces.length * WORKSPACE_ROW_HEIGHT
			+ Math.max(0, listedWorkspaces.length - 1) * WORKSPACE_ROW_GAP
			+ WORKSPACE_LIST_PADDING
			+ (isSearching ? WORKSPACE_SEARCH_HEADER_SPACE : 0)
			+ (isSearching && searchQuery.isFetchingNextPage ? 32 : 0)
		: 72;
	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen);
		if (!nextOpen) {
			setSearch("");
			setDebouncedSearch("");
		}
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				{isIconTrigger ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={`Choose workspace: ${activeWorkspace?.name ?? "Personal Workspace"}`}
						aria-expanded={open}
						title={activeWorkspace?.name ?? "Personal Workspace"}
						className={cn(
							"size-[var(--site-header-control-h,2.25rem)] rounded-full p-0",
							"bg-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
							"focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
							open && "bg-zinc-100/70 dark:bg-zinc-900/60",
						)}
					>
						<Users className="size-4 text-muted-foreground" aria-hidden="true" />
					</Button>
				) : (
					<Button
						variant="ghost"
						aria-label="Choose workspace"
						aria-expanded={open}
						className={cn(
							"inline-flex h-[var(--site-header-control-h,2.25rem)] max-w-56 items-center gap-2 rounded-lg px-3 leading-none",
						"border border-transparent text-[13px] font-medium text-foreground transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:focus-visible:ring-zinc-600/50",
						)}
					>
						<span className="max-w-40 truncate text-sm font-medium" title={activeWorkspace?.name}>
							{activeWorkspace?.name ?? "Personal Workspace"}
						</span>
						<ChevronDown className={cn("size-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} aria-hidden="true" />
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent
				align={align}
				side="bottom"
				sideOffset={6}
				className="w-80 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-lg p-0"
			>
				<Command shouldFilter={false} className="h-auto w-full rounded-none bg-transparent p-0">
					<CommandInput
						wrapperClassName="p-2 pb-0"
						value={search}
						onValueChange={setSearch}
						placeholder="Search all workspaces"
						aria-label="Search all workspaces"
						autoFocus
					/>
					<ScrollArea
						style={{ height: `min(60vh, 24rem, ${scrollAreaHeight}px)` }}
						viewportClassName="overscroll-y-contain"
						viewportProps={{ onScroll: handleListScroll }}
						keepScrollbarMounted
					>
						<CommandList className="max-h-none scroll-py-1 overflow-visible p-0">
							{isSearching ? (
								isDebouncing || isLoading ? (
									<div role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">Searching workspaces…</div>
								) : isSearchingError ? (
									<div role="alert" className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
										<span>Unable to search workspaces.</span>
										<button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => void searchQuery.refetch()}>Try again</button>
									</div>
								) : listedWorkspaces.length === 0 ? (
									<CommandEmpty>No workspaces found.</CommandEmpty>
								) : null
							) : normalizedSearch.length === 1 ? (
								<div role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">Enter one more character to search all workspaces.</div>
							) : workspaces.length === 0 ? (
								<CommandEmpty>No workspaces available.</CommandEmpty>
							) : null}
							{(!isSearching || (!isDebouncing && !isLoading && !isSearchingError)) && listedWorkspaces.length > 0 ? (
								<CommandGroup
									heading={isSearching ? "Search results" : undefined}
									className="flex flex-col gap-1 p-2 [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-1"
								>
									{listedWorkspaces.map((workspace) => {
										const isActive = workspace.id === activeWorkspaceId;
										return (
											<CommandItem
												key={workspace.id}
												value={`${workspace.name} ${workspace.id}`}
												data-checked={isActive}
												className="min-h-10 w-full cursor-pointer rounded-md px-3 py-2"
												onSelect={() => void selectWorkspace(workspace)}
											>
												<span className="min-w-0 flex-1 truncate">{workspace.name}</span>
											</CommandItem>
										);
									})}
								</CommandGroup>
							) : null}
							{isSearching && listedWorkspaces.length > 0 && searchQuery.isFetchingNextPage ? (
								<div role="status" className="px-3 py-2 text-center text-xs text-muted-foreground">Loading more…</div>
							) : null}
						</CommandList>
					</ScrollArea>
				</Command>
				<Link
					href="/settings/workspaces/settings"
					prefetch={false}
					className="flex min-h-11 shrink-0 items-center gap-2 border-t px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Users className="size-4" aria-hidden="true" />
					Manage Workspaces
				</Link>
			</PopoverContent>
		</Popover>
	);
}
