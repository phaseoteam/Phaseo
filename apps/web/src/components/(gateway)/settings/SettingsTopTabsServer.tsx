"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getActiveSettingsNav } from "./Sidebar.config";
import SettingsSidebarTrigger from "./SettingsSidebarTrigger";

type Tab = {
	href: string;
	label: string;
	match?: string[];
	badge?: string;
};

function getBillingTabs(): Tab[] {
	return [
		{ href: "/settings/credits", label: "Credits" },
		{ href: "/settings/credits/transactions", label: "Transactions" },
		{ href: "/settings/payment-methods", label: "Payment Methods" },
	];
}

const USAGE_TABS: Tab[] = [
	{ href: "/settings/usage/overview", label: "Overview" },
	{ href: "/settings/usage/trends", label: "Trends" },
	{ href: "/settings/usage/explore", label: "Explore" },
	{ href: "/settings/usage/guardrails", label: "Guardrails" },
	{ href: "/settings/usage/logs", label: "Logs" },
	{ href: "/settings/usage/alerts", label: "Alerts" },
];

const OAUTH_TABS: Tab[] = [
	{ href: "/settings/oauth-apps", label: "OAuth Apps" },
	{ href: "/settings/authorized-apps", label: "OAuth Integrations" },
];

function resolveTabs(pathname: string): Tab[] | null {
	// Account
	if (pathname.startsWith("/settings/account")) {
		return [
			{
				href: "/settings/account/details",
				label: "Details",
				match: ["/settings/account/details"],
			},
			{
				href: "/settings/account/mfa",
				label: "MFA",
				match: ["/settings/account/mfa"],
			},
			{
				href: "/settings/account/danger",
				label: "Danger Zone",
				match: ["/settings/account/danger"],
			},
		];
	}

	// OAuth
	if (
		pathname.startsWith("/settings/oauth-apps") ||
		pathname.startsWith("/settings/authorized-apps")
	) {
		return OAUTH_TABS;
	}

	// Workspace
	if (
		pathname.startsWith("/settings/workspaces") ||
		pathname.startsWith("/settings/teams")
	) {
		return null;
	}

	if (pathname.startsWith("/settings/beta")) {
		return [
			{
				href: "/settings/beta",
				label: "Feature Preview",
				badge: "Preview",
			},
		];
	}

	if (pathname.startsWith("/settings/credits") || pathname.startsWith("/settings/payment-methods")) {
		return getBillingTabs();
	}
	if (pathname.startsWith("/settings/usage")) return USAGE_TABS;
	if (
		pathname.startsWith("/settings/keys") ||
		pathname.startsWith("/settings/management-api-keys") ||
		pathname.startsWith("/settings/provisioning-keys") ||
		pathname.startsWith("/settings/apps") ||
		pathname.startsWith("/settings/routing") ||
		pathname.startsWith("/settings/byok") ||
		pathname.startsWith("/settings/presets") ||
		pathname.startsWith("/settings/privacy") ||
		pathname.startsWith("/settings/guardrails")
	) {
		return null;
	}
	// Developer and other pages: sidebar is enough.
	return null;
}

export default function SettingsTopTabsServer({
	isEnterpriseInvoiceMode,
	showBroadcast = true,
}: {
	isEnterpriseInvoiceMode?: boolean;
	showBroadcast?: boolean;
} = {}) {
	void isEnterpriseInvoiceMode;
	const pathname = usePathname() ?? "";
	const tabs = resolveTabs(pathname);
	const activeNav = React.useMemo(
		() => getActiveSettingsNav(pathname, { showBroadcast }),
		[pathname, showBroadcast],
	);

	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const linkRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});
	const [indicator, setIndicator] = React.useState({ left: 0, width: 0, opacity: 0 });

	const matchScore = React.useCallback((t: Tab) => {
		// Treat the account index route as details, since `/settings/account` redirects.
		if (pathname === "/settings/account" && t.href === "/settings/account/details") {
			return { exact: true, len: t.href.length };
		}

		if (pathname === t.href) return { exact: true, len: t.href.length };
		if (pathname.startsWith(t.href + "/"))
			return { exact: true, len: t.href.length };

		let best = 0;
		for (const prefix of t.match ?? []) {
			if (pathname === prefix || pathname.startsWith(prefix + "/")) {
				best = Math.max(best, prefix.length);
			}
		}
		if (best > 0) return { exact: false, len: best };
		return null;
	}, [pathname]);

	const activeTab =
		tabs && tabs.length > 0
			? tabs
					.map((t) => ({ t, score: matchScore(t) }))
					.filter((x) => x.score !== null)
					.sort((a, b) => {
						if (a.score!.exact !== b.score!.exact) return a.score!.exact ? -1 : 1;
						return b.score!.len - a.score!.len;
					})[0]?.t ?? tabs[0]
			: null;

	const setIndicatorToHref = React.useCallback((href: string | null) => {
		const container = containerRef.current;
		if (!container || !href) return;
		const el = linkRefs.current[href];
		if (!el) return;

		const containerRect = container.getBoundingClientRect();
		const rect = el.getBoundingClientRect();
		setIndicator({
			left: rect.left - containerRect.left,
			width: rect.width,
			opacity: 1,
		});
	}, []);

	React.useEffect(() => {
		const update = () => setIndicatorToHref(activeTab?.href ?? null);
		const raf = requestAnimationFrame(update);
		window.addEventListener("resize", update);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", update);
		};
	}, [activeTab?.href, setIndicatorToHref]);

	if (!tabs?.length) {
		return (
			<>
				<SettingsSidebarTrigger
					showBroadcast={showBroadcast}
					triggerLabel="Sections"
					className="h-9 w-auto shrink-0 px-3"
				/>
				<div className="hidden lg:flex items-center border-b border-border text-sm">
					<span className="px-2 pb-2 font-medium text-muted-foreground">
						{activeNav?.group.heading ?? "Settings"}
					</span>
					<ChevronRight
						aria-hidden="true"
						className="mb-2 mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
					/>
					<span className="pb-2 font-semibold text-foreground">
						{activeNav?.item.label ?? "Settings"}
					</span>
					{activeNav?.item.badge ? (
						<Badge
							variant="outline"
							className="mb-2 h-5 px-1.5 text-[10px] uppercase tracking-wide"
						>
							{activeNav.item.badge}
						</Badge>
					) : null}
				</div>
			</>
		);
	}

	return (
		<>
			<nav className="lg:hidden" aria-label="Settings section navigation">
				<div className="flex items-center gap-2">
					<SettingsSidebarTrigger
						showBroadcast={showBroadcast}
						triggerLabel="Sections"
						className="h-9 shrink-0 px-3"
					/>
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button
								variant="outline"
								className="h-9 flex-1 justify-between min-w-0" />}>

								<span className="truncate">
									{activeTab?.label ?? "Settings"}
								</span>
								<ChevronDown className="h-4 w-4 shrink-0" />

						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="w-[min(20rem,calc(100vw-1rem))]"
						>
							{tabs.map((tab) => {
								const active = tab.href === activeTab?.href;
								return (
									<DropdownMenuItem key={tab.href}  render={<Link
											href={tab.href}
											prefetch={false}
											aria-current={active ? "page" : undefined}
											className="flex items-center gap-2" />}>

											<span className={cn("flex-1 truncate", active && "font-semibold")}>
												{tab.label}
											</span>
											{tab.badge ? (
												<Badge
													variant="outline"
													className="h-4 px-1 text-[9px] uppercase tracking-wide"
												>
													{tab.badge}
												</Badge>
											) : null}

									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</nav>

			<nav
				ref={containerRef}
				className="relative hidden lg:flex gap-4 border-b border-border"
				onMouseLeave={() => setIndicatorToHref(activeTab?.href ?? null)}
				aria-label="Settings section navigation"
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute bottom-0 h-0.5 rounded bg-muted-foreground transition-[left,width,opacity] duration-200 ease-out"
					style={{
						left: indicator.left,
						width: indicator.width,
						opacity: indicator.opacity,
					}}
				/>

				{tabs.map((tab) => {
					const active = tab.href === activeTab?.href;
					return (
						<Link
							key={tab.href}
							href={tab.href}
							prefetch={false}
							aria-current={active ? "page" : undefined}
							ref={(el) => {
								linkRefs.current[tab.href] = el;
							}}
							onMouseEnter={() => setIndicatorToHref(tab.href)}
							onFocus={() => setIndicatorToHref(tab.href)}
							className={cn(
								"pb-2 px-2 text-sm font-medium transition-colors duration-150",
								active ? "text-primary" : "text-muted-foreground hover:text-primary",
							)}
						>
							<span className="flex items-center gap-2">
								<span>{tab.label}</span>
								{tab.badge ? (
									<Badge
										variant="outline"
										className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
									>
										{tab.badge}
									</Badge>
								) : null}
							</span>
						</Link>
					);
				})}
			</nav>
		</>
	);
}

