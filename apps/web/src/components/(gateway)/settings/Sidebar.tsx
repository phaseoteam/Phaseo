"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Building2, ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { filterSettingsNavigation } from "@/components/(gateway)/settings/Sidebar.search";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { getSettingsMessages } from "@/i18n/settings";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

const LABEL_KEYS = {
	Settings:"settings",Account:"account",Workspace:"workspace",Profile:"profile",Details:"details",MFA:"mfa","Provider onboarding":"providerOnboarding","Connected Apps":"connectedApps","Danger Zone":"dangerZone",Workspaces:"workspaces",Billing:"billing",Credits:"credits",Transactions:"transactions","Payment Methods":"paymentMethods","Feature Preview":"featurePreview",General:"settings",Members:"members",Access:"access",Notifications:"notifications",Guardrails:"guardrails",Enterprise:"enterprise",Overview:"overview",Directory:"directory",Departments:"departments","Single Sign-On":"singleSignOn",SCIM:"scim",Privacy:"privacy",Usage:"usage",Trends:"trends",Explore:"explore",Geography:"geography","Guardrail Activity":"guardrailActivity",Alerts:"alerts",Logs:"logs",Requests:"requests","Upstream Requests":"upstreamRequests",Sessions:"sessions",Videos:"videos",Batches:"batches","API Keys":"apiKeys","Management Keys":"managementKeys",Broadcast:"broadcast",Apps:"apps",Routing:"routing","Auto routing":"autoRouting","Dynamic Routes":"dynamicRoutes","Bring Your Own Key":"bringYourOwnKey",Presets:"presets",Feedback:"feedback","OAuth Apps":"oauthApps",Webhooks:"webhooks","Provider review":"providerReview"
} as const;

export default function SettingsSidebar({
	children,
	showBroadcast = true,
	showWebhooks = true,
	showEnterprise = false,
	showAutoRouting = false,
	showInternal = false,
	providerMode = false,
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
	providerMode?: boolean;
}) {
	const locale = useLocale();
	const tNew = useTranslations("SettingsUI.sidebarNew");
	const settingsMessages = getSettingsMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	const translateLabel = (label: string) => {
		const newLabels: Record<string, string> = { Preferences: "preferences", "Billing & Credits": "billingCredits", Activity: "activity", "Realtime Sessions": "realtimeSessions", "Private Models": "privateModels", "Discovery queue": "discoveryQueue", "Your Models": "yourModels", "Provider Review": "providerReview", Integrations: "integrations", Provider: "provider" };
		if (newLabels[label]) return tNew(newLabels[label] as never);
		const key = LABEL_KEYS[label as keyof typeof LABEL_KEYS];
		if (!key) return label;
		if (key === "workspace") return settingsMessages.sidebar.scope.workspace;
		return (settingsMessages.sidebar.items as Record<string, string>)[key] ?? label;
	};
	const translateBadge = (badge: string) => {
		if (badge === "Beta") return settingsMessages.common.beta;
		if (badge === "Alpha") return settingsMessages.common.alpha;
		if (badge === "Preview") return settingsMessages.common.preview;
		return badge;
	};
	const pathname = usePathname();
	const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
	const isCollapsed = state === "collapsed" && !isMobile;
	const [search, setSearch] = useState("");
	const isSearching = search.trim().length > 0 && !isCollapsed;
	const navGroups = getSettingsSidebar({ showBroadcast, showWebhooks, showEnterprise, showAutoRouting, showInternal, providerMode });

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
	const routeScope = providerMode && pathname === "/settings/account/providers" ? "provider" : activeEntry?.group.scope ?? "personal";
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
		? filterSettingsNavigation(navGroups, search, translateLabel)
		: navGroups.filter((group) => group.scope === selectedScope);
	const businessScope = providerMode ? "provider" : "workspace";
	const businessLabel = providerMode ? tNew("provider") : settingsMessages.sidebar.scope.workspace;
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
		const label = translateLabel(item.label);
		const content = (
			<>
				{Icon ? (
					<Icon
						aria-hidden="true"
						className="h-4 w-4 shrink-0 text-muted-foreground"
					/>
				) : null}
				<span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
					{label}
				</span>
				{item.badge && (
					<Badge
						variant="outline"
						className="ml-auto h-5 px-1.5 text-[10px] capitalize group-data-[collapsible=icon]:hidden"
					>
						{translateBadge(item.badge)}
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
											tooltip={label}
											aria-label={isCollapsed ? settingsMessages.sidebar.actions.toggle.replace("{label}", label) : undefined}
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
															<span className="min-w-0 flex-1 truncate">{translateLabel(child.label)}</span>
												{child.badge ? (
													<Badge
														variant="outline"
														className="ml-auto h-5 px-1.5 text-[10px] capitalize"
													>
																	{translateBadge(child.badge)}
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
					aria-label={isCollapsed ? label : undefined}
					className="cursor-not-allowed !rounded-lg"
					tooltip={label}
				>
					{content}
				</SidebarMenuButton>
			);
		}

		if (item.external) {
			return (
					<SidebarMenuButton asChild tooltip={label} className="!rounded-lg">
					<a
						href={item.href}
						target="_blank"
						rel="noreferrer"
						aria-label={settingsMessages.sidebar.actions.external.replace("{label}", label)}
						onClick={closeMobile}
					>
						{content}
					</a>
				</SidebarMenuButton>
			);
		}

		return (
			<SidebarMenuButton asChild isActive={active} tooltip={label} className="!rounded-lg">
				<Link
					href={item.href}
					aria-current={active ? "page" : undefined}
					aria-label={isCollapsed ? label : undefined}
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
					aria-label={isCollapsed ? settingsMessages.sidebar.actions.expand : settingsMessages.sidebar.actions.collapse}
					title={isCollapsed ? settingsMessages.sidebar.actions.expand : settingsMessages.sidebar.actions.collapse}
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
					<Input type="search" aria-label={tNew("search")} placeholder={tNew("searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSearch(""); } }} className="h-8 text-sm" />
				</div>
				<div className="px-2 pb-2 pt-3">
					<div className="grid grid-cols-2 rounded-lg bg-muted/70 p-1" aria-label={settingsMessages.sidebar.settings}>
						<button type="button" data-settings-segment aria-pressed={selectedScope === "personal"} onClick={() => selectScope("personal")} className={selectedScope === "personal" ? "flex h-8 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-foreground shadow-sm" : "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"}><UserRound className="size-3.5" />{settingsMessages.sidebar.scope.account}</button>
						<button type="button" data-settings-segment aria-pressed={selectedScope === businessScope} onClick={() => selectScope(businessScope)} className={selectedScope === businessScope ? "flex h-8 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-foreground shadow-sm" : "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"}><Building2 className="size-3.5" />{businessLabel}</button>
					</div>
				</div>
			</div>
			<div className="hidden shrink-0 border-b border-sidebar-border px-2 py-2 group-data-[collapsible=icon]:block">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton isActive={selectedScope === "personal"} tooltip={settingsMessages.sidebar.scope.account} className="!rounded-lg" aria-label={settingsMessages.sidebar.scope.showAccount} onClick={() => selectScope("personal")}>
							<UserRound className="size-4" />
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton isActive={selectedScope === businessScope} tooltip={businessLabel} className="!rounded-lg" aria-label={providerMode ? tNew("showProvider") : settingsMessages.sidebar.scope.showWorkspace} onClick={() => selectScope(businessScope)}>
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
						{isSearching && visibleGroups.length === 0 ? <p role="status" className="px-4 py-6 text-sm text-muted-foreground">{tNew("empty")}</p> : null}
						{visibleGroups.map((group, idx) => (
							<div key={`${group.heading ?? "group"}-${idx}`} className={idx > 0 ? "group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-sidebar-border" : undefined}>
								<NavBlock group={group} first={idx === 0} />
							</div>
						))}
					</div>
				</ScrollArea>
			</SidebarContent>
			{!providerMode && <SidebarFooter className="shrink-0 border-t p-2">
				<SidebarMenu><SidebarMenuItem>
					<SidebarMenuButton asChild tooltip={tNew("becomeProvider")} isActive={pathname === "/settings/account/providers"} className="!rounded-lg">
						<Link href="/settings/account/providers" onClick={closeMobile} aria-label={tNew("becomeProvider")}>
							<Building2 className="size-4" />
							<span className="group-data-[collapsible=icon]:hidden">{tNew("becomeProvider")}</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem></SidebarMenu>
			</SidebarFooter>}
		</>
	);
}

