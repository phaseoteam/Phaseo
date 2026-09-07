"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { filterSettingsNavigation } from "./Sidebar.search";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";

import type { NavGroup, NavItem, SettingsScope } from "./Sidebar.config";
import { getSettingsSidebar, isSettingsNavChildActive } from "./Sidebar.config";
import { cn } from "@/lib/utils";

export default function SettingsSidebar({
	children,
	showBroadcast = true,
	showWebhooks = true,
	showEnterprise = false,
	showAutoRouting = false,
	showInternal = false,
}: {
	/**
	 * Optional slot for lightweight, non-blocking sidebar adornments (e.g. alert counts).
	 * This is rendered next to the "Usage" item label.
	 */
	children?: ReactNode;
	showBroadcast?: boolean;
	showWebhooks?: boolean;
	showEnterprise?: boolean;
	showAutoRouting?: boolean;
	showInternal?: boolean;
}) {
	const pathname = usePathname();
	const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
	const isCollapsed = state === "collapsed" && !isMobile;
	const [search, setSearch] = useState("");
	const isSearching = search.trim().length > 0 && !isCollapsed;
	const navGroups = getSettingsSidebar({ showBroadcast, showWebhooks, showEnterprise, showAutoRouting, showInternal });

	function matchScore(item: NavItem) {
		const path = pathname ?? "";
		if (item.disabled || item.external) return null;

		if (path === item.href) return { exact: true, len: item.href.length };
		if (path.startsWith(item.href + "/"))
			return { exact: true, len: item.href.length };

		let best = 0;
		for (const prefix of item.match ?? []) {
			if (path === prefix || path.startsWith(prefix + "/")) {
				best = Math.max(best, prefix.length);
			}
		}
		if (best > 0) return { exact: false, len: best };
		return null;
	}

	const activeEntry =
		navGroups
			.flatMap((group) => group.items.map((item) => ({ group, item })))
			.map(({ group, item }) => ({ group, item, score: matchScore(item) }))
			.filter((x) => x.score !== null)
			.sort((a, b) => {
				// Prefer exact matches over "match prefix" matches, then longest match.
				if (a.score!.exact !== b.score!.exact)
					return a.score!.exact ? -1 : 1;
				return b.score!.len - a.score!.len;
			})[0] ?? null;
	const activeItem = activeEntry?.item ?? null;
	const routeScope = activeEntry?.group.scope ?? "personal";
	const [scopeSelection, setScopeSelection] = useState<{
		routeScope: SettingsScope;
		selectedScope: SettingsScope;
	} | null>(null);
	const selectedScope = scopeSelection?.routeScope === routeScope
		? scopeSelection.selectedScope
		: routeScope;
	const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
	const [navigationOverflows, setNavigationOverflows] = useState(false);
	const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (!scrollViewport) return;

		const updateOverflow = () => {
			setNavigationOverflows(
				scrollViewport.scrollHeight > scrollViewport.clientHeight + 1,
			);
		};
		const resizeObserver = new ResizeObserver(updateOverflow);
		resizeObserver.observe(scrollViewport);
		const content = scrollViewport.firstElementChild;
		if (content) resizeObserver.observe(content);
		updateOverflow();

		return () => resizeObserver.disconnect();
	}, [scrollViewport, selectedScope]);
	const visibleGroups = isSearching
		? filterSettingsNavigation(navGroups, search)
		: navGroups.filter((group) => group.scope === selectedScope);
	const selectScope = (nextScope: SettingsScope) => {
		setSearch("");
		setScopeSelection({ routeScope, selectedScope: nextScope });
	};

	const closeMobile = () => {
		if (isMobile) setOpenMobile(false);
	};

	function NavBlock({ group, first }: { group: NavGroup; first: boolean }) {
		const heading = (group.heading ?? "").trim();
		return (
			<SidebarGroup className={cn("py-0", !first && "group-data-[collapsible=icon]:pt-2")}>
				{isSearching ? <p className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">{group.scope === "personal" ? "Account" : "Workspace"}</p> : null}
				<SidebarGroupContent>
					<SidebarMenu>
						{group.items.map((item) =>
							item.children?.length ? (
								renderNavItem(item, heading)
							) : (
								<SidebarMenuItem key={`${heading || "group"}-${item.href}`}>
									{renderNavItem(item, heading)}
								</SidebarMenuItem>
							),
						)}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		);
	}

	function renderNavItem(item: NavItem, heading: string) {
		const active =
			!item.disabled && !item.external && activeItem?.href === item.href;

		const Icon = item.icon;
		const content = (
			<>
				{Icon ? (
					<Icon
						aria-hidden="true"
						className="h-4 w-4 shrink-0 text-muted-foreground"
					/>
				) : null}
				<span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
					{item.label}
				</span>
				{item.badge && (
					<Badge
						variant="outline"
						className="ml-auto h-5 px-1.5 text-[10px] capitalize group-data-[collapsible=icon]:hidden"
					>
						{item.badge}
					</Badge>
				)}
				{item.href === "/settings/usage" && !isCollapsed ? children : null}
				{item.external && (
					<ExternalLink
						aria-hidden="true"
						className="ml-2 h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
					/>
				)}
			</>
		);

		if (item.children?.length) {
			const sectionOpen = isSearching || (openSections[item.href] ?? active);
			return (
				<Collapsible
					key={`${heading || "group"}-${item.href}`}
					onOpenChange={(open) => {
						setOpenSections((current) => ({ ...current, [item.href]: open }));
					}}
					open={sectionOpen}
					className="group/collapsible"
				>
					<SidebarMenuItem>
						<CollapsibleTrigger asChild>
							<SidebarMenuButton
								isActive={false}
								tooltip={item.label}
								aria-label={isCollapsed ? `Toggle ${item.label} navigation` : undefined}
								className={cn(
									"!rounded-lg text-left",
									active && "text-sidebar-accent-foreground",
								)}
							>
								{content}
								<ChevronRight
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-open/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
								/>
							</SidebarMenuButton>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<SidebarMenuSub>
								{item.children.map((child) => {
									const childActive = isSettingsNavChildActive(
										pathname ?? "",
										child,
									);
									return (
										<SidebarMenuSubItem key={child.href}>
											<SidebarMenuSubButton
												render={<Link href={child.href} onClick={closeMobile} />}
												isActive={childActive}
												aria-current={childActive ? "page" : undefined}
												className="!rounded-lg"
											>
												<span className="min-w-0 flex-1 truncate">{child.label}</span>
												{child.badge ? (
													<Badge
														variant="outline"
														className="ml-auto h-5 px-1.5 text-[10px] capitalize"
													>
														{child.badge}
													</Badge>
												) : null}
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									);
								})}
							</SidebarMenuSub>
						</CollapsibleContent>
					</SidebarMenuItem>
				</Collapsible>
			);
		}

		if (item.disabled) {
			return (
				<SidebarMenuButton
					disabled
					aria-disabled="true"
					aria-label={isCollapsed ? item.label : undefined}
					className="cursor-not-allowed !rounded-lg"
					tooltip={item.label}
				>
					{content}
				</SidebarMenuButton>
			);
		}

		if (item.external) {
			return (
			<SidebarMenuButton asChild tooltip={item.label} className="!rounded-lg">
					<a
						href={item.href}
						target="_blank"
						rel="noreferrer"
						aria-label={`${item.label} (opens in a new tab)`}
						onClick={closeMobile}
					>
						{content}
					</a>
				</SidebarMenuButton>
			);
		}

		return (
			<SidebarMenuButton asChild isActive={active} tooltip={item.label} className="!rounded-lg">
				<Link
					href={item.href}
					aria-current={active ? "page" : undefined}
					aria-label={isCollapsed ? item.label : undefined}
					onClick={closeMobile}
				>
					{content}
				</Link>
			</SidebarMenuButton>
		);
	}

	return (
		<>
			<SidebarHeader className="h-[53px] shrink-0 gap-0 border-b px-2 py-0 group-data-[collapsible=icon]:px-2">
				<div className="flex h-full items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<div className="text-sm font-semibold text-foreground group-data-[collapsible=icon]:hidden">
						Settings
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="ml-auto group-data-[collapsible=icon]:ml-0"
						onClick={toggleSidebar}
						aria-label={isCollapsed ? "Expand settings sidebar" : "Collapse settings sidebar"}
						title={isCollapsed ? "Expand settings sidebar" : "Collapse settings sidebar"}
					>
						{isCollapsed ? (
							<PanelLeftOpen className="h-4 w-4" />
						) : (
							<PanelLeftClose className="h-4 w-4" />
						)}
					</Button>
				</div>
			</SidebarHeader>
			<div className="shrink-0 group-data-[collapsible=icon]:hidden">
				<div className="px-2 pt-3">
					<Input type="search" aria-label="Search settings" placeholder="Search settings…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSearch(""); } }} className="h-8 text-sm" />
				</div>
				<div className="px-2 pb-2 pt-3">
					<div className="grid grid-cols-2 rounded-lg bg-muted/70 p-1" aria-label="Settings scope">
						<button type="button" data-settings-segment aria-pressed={selectedScope === "personal"} onClick={() => selectScope("personal")} className={selectedScope === "personal" ? "flex h-8 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-foreground shadow-sm" : "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"}><UserRound className="size-3.5" />Account</button>
						<button type="button" data-settings-segment aria-pressed={selectedScope === "workspace"} onClick={() => selectScope("workspace")} className={selectedScope === "workspace" ? "flex h-8 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-foreground shadow-sm" : "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"}><Building2 className="size-3.5" />Workspace</button>
					</div>
				</div>
			</div>
			<div className="hidden shrink-0 border-b border-sidebar-border px-2 py-2 group-data-[collapsible=icon]:block">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton isActive={selectedScope === "personal"} tooltip="Account" className="!rounded-lg" aria-label="Show Account settings" onClick={() => selectScope("personal")}>
							<UserRound className="size-4" />
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton isActive={selectedScope === "workspace"} tooltip="Workspace" className="!rounded-lg" aria-label="Show Workspace settings" onClick={() => selectScope("workspace")}>
							<Building2 className="size-4" />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</div>
			<SidebarContent className="overflow-hidden [--radius:0.625rem]!">
				<ScrollArea
					className="min-h-0 flex-1"
					keepScrollbarMounted
					scrollBarClassName={navigationOverflows ? undefined : "hidden"}
					viewportRef={setScrollViewport}
				>
					<div>
						{isSearching && visibleGroups.length === 0 ? <p role="status" className="px-4 py-6 text-sm text-muted-foreground">No settings found.</p> : null}
						{visibleGroups.map((group, idx) => (
							<div key={`${group.heading ?? "group"}-${idx}`} className={idx > 0 ? "group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-sidebar-border" : undefined}>
								<NavBlock group={group} first={idx === 0} />
							</div>
						))}
					</div>
				</ScrollArea>
			</SidebarContent>
		</>
	);
}

