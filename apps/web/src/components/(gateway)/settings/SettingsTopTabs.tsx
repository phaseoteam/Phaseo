"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type Tab = {
	href: string;
	label: string;
	badge?: string;
	count?: number;
	tone?: "notice" | "warning" | "critical";
	match?: string[];
};

function matchPath(pathname: string, tab: Tab) {
	if (pathname === tab.href || pathname.startsWith(tab.href + "/")) return true;
	return (tab.match ?? []).some(
		(prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
	);
}

function matchScore(pathname: string, tab: Tab) {
	if (pathname === tab.href) return { exact: true, len: tab.href.length };
	if (pathname.startsWith(tab.href + "/"))
		return { exact: true, len: tab.href.length };

	let best = 0;
	for (const prefix of tab.match ?? []) {
		if (pathname === prefix || pathname.startsWith(prefix + "/")) {
			best = Math.max(best, prefix.length);
		}
	}
	if (best > 0) return { exact: false, len: best };
	return null;
}

function getTabSet(
	pathname: string,
	usageAlertsCount: number,
	usageAlertsTone: Tab["tone"],
): Tab[] | null {
	// Account
	if (pathname.startsWith("/settings/account")) {
		return [
			{
				href: "/settings/account/details",
				label: "Details",
				match: ["/settings/account", "/settings/account/details"],
			},
			{ href: "/settings/account/mfa", label: "MFA" },
			{ href: "/settings/account/danger", label: "Danger Zone" },
		];
	}

	// OAuth Apps
	if (
		pathname.startsWith("/settings/oauth-apps") ||
		pathname.startsWith("/settings/authorized-apps")
	) {
		return [
			{ href: "/settings/oauth-apps", label: "OAuth Apps", badge: "Alpha" },
			{
				href: "/settings/authorized-apps",
				label: "OAuth Integrations",
				badge: "Alpha",
			},
		];
	}

	// Developer
	if (pathname.startsWith("/settings/sdk")) {
		// These pages are already clearly grouped in the sidebar; tabs would be duplicate navigation.
		return null;
	}

	// Team
	if (pathname.startsWith("/settings/teams")) {
		return [
			{
				href: "/settings/teams/members",
				label: "Members",
				match: ["/settings/teams", "/settings/teams/members"],
			},
			{ href: "/settings/teams/settings", label: "Team Settings" },
		];
	}

	// Usage (separate from Billing)
	if (pathname.startsWith("/settings/usage")) {
		return [
			{ href: "/settings/usage", label: "Usage" },
			{ href: "/settings/usage/logs", label: "Logs" },
			{
				href: "/settings/usage/alerts",
				label: "Alerts",
				count: usageAlertsCount,
				tone: usageAlertsTone,
			},
		];
	}

	// Billing
	if (
		pathname.startsWith("/settings/credits") ||
		pathname.startsWith("/settings/credits/transactions") ||
		pathname.startsWith("/settings/payment-methods") ||
		pathname.startsWith("/settings/tiers")
	) {
		return [
			{ href: "/settings/credits", label: "Credits" },
			{ href: "/settings/credits/transactions", label: "Transactions" },
			{ href: "/settings/payment-methods", label: "Payment Methods" },
			{ href: "/settings/tiers", label: "Tiers" },
		];
	}

	// Gateway / API
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
		const tabs: Tab[] = [
			{ href: "/settings/keys", label: "API Keys" },
			{ href: "/settings/apps", label: "Apps" },
			{
				href: "/settings/management-api-keys",
				label: "Management Keys",
				badge: "Beta",
				match: ["/settings/management-api-keys", "/settings/provisioning-keys"],
			},
			{ href: "/settings/routing", label: "Routing" },
			{ href: "/settings/byok", label: "BYOK" },
			{ href: "/settings/presets", label: "Presets", badge: "Beta" },
			{ href: "/settings/privacy", label: "Privacy", badge: "Alpha" },
			{ href: "/settings/guardrails", label: "Guardrails", badge: "Alpha" },
		];
		return tabs;
	}

	return null;
}

export default function SettingsTopTabs({
	usageAlertsCount = 0,
	usageAlertsTone,
}: {
	usageAlertsCount?: number;
	usageAlertsTone?: "notice" | "warning" | "critical";
}) {
	const pathname = usePathname() ?? "";
	const tabs = getTabSet(pathname, usageAlertsCount, usageAlertsTone);
	if (!tabs || tabs.length <= 1) return null;

	const activeTab =
		tabs
			.map((t) => ({ t, score: matchScore(pathname, t) }))
			.filter((x) => x.score !== null)
			.sort((a, b) => {
				// Prefer exact matches, then longest match length.
				if (a.score!.exact !== b.score!.exact)
					return a.score!.exact ? -1 : 1;
				return b.score!.len - a.score!.len;
			})[0]?.t ?? tabs[0];

	const desktopContainerRef = React.useRef<HTMLDivElement | null>(null);
	const tabRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});
	const [indicator, setIndicator] = React.useState<{
		left: number;
		width: number;
		opacity: number;
	}>({ left: 0, width: 0, opacity: 0 });

	const setIndicatorToHref = React.useCallback((href: string) => {
		const container = desktopContainerRef.current;
		const el = tabRefs.current[href];
		if (!container || !el) return;

		const containerRect = container.getBoundingClientRect();
		const rect = el.getBoundingClientRect();
		setIndicator({
			left: rect.left - containerRect.left,
			width: rect.width,
			opacity: 1,
		});
	}, []);

	React.useEffect(() => {
		// Defer until after layout so measurements are correct.
		const raf = requestAnimationFrame(() => {
			setIndicatorToHref(activeTab.href);
		});
		return () => cancelAnimationFrame(raf);
	}, [activeTab.href, setIndicatorToHref]);

	return (
		<>
			{/* Desktop: match model/org/provider pages */}
			<div
				ref={desktopContainerRef}
				className="relative hidden md:flex gap-4 border-b"
				onMouseLeave={() => setIndicatorToHref(activeTab.href)}
			>
				{/* Shared animated underline */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute bottom-0 h-0.5 rounded bg-muted-foreground transition-[left,width,opacity] duration-200 ease-out"
					style={{
						left: indicator.left,
						width: indicator.width,
						opacity: indicator.opacity,
					}}
				/>

				{tabs.map((t) => {
					const isActive = t.href === activeTab.href;
					const countClassName =
						t.tone === "critical"
							? "bg-red-600"
							: t.tone === "notice"
								? "bg-blue-600"
								: "bg-amber-500";
					return (
						<Link
							key={t.href}
							href={t.href}
							prefetch={false}
							aria-current={isActive ? "page" : undefined}
							ref={(el) => {
								tabRefs.current[t.href] = el;
							}}
							onMouseEnter={() => setIndicatorToHref(t.href)}
							onFocus={() => setIndicatorToHref(t.href)}
							className={cn(
								"pb-2 px-2 font-medium text-sm transition-colors duration-150 flex items-center gap-2",
								isActive ? "text-primary" : "text-foreground hover:text-primary",
							)}
						>
							{t.label}
							{t.count && t.count > 0 ? (
								<span
									className={cn(
										"ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white",
										countClassName,
									)}
									aria-label={`${t.count} alert${t.count === 1 ? "" : "s"}`}
								>
									{t.count}
								</span>
							) : null}
							{t.badge ? (
								<Badge
									variant="outline"
									className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
								>
									{t.badge}
								</Badge>
							) : null}
						</Link>
					);
				})}
			</div>

			{/* Mobile: dropdown */}
			<div className="md:hidden mb-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							className="group w-full justify-between"
						>
							<span className="flex items-center gap-2 min-w-0">
								<span className="truncate text-sm">
									{activeTab?.label ?? "Settings"}
								</span>
								{activeTab?.badge ? (
									<Badge
										variant="outline"
										className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
									>
										{activeTab.badge}
									</Badge>
								) : null}
							</span>
							<ChevronDown className="ml-2 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-(--radix-popper-anchor-width)"
					>
						{tabs.map((t) => (
							<DropdownMenuItem key={t.href} asChild>
								<Link href={t.href}>
									<span className="flex w-full items-center justify-between gap-3">
										<span className="min-w-0 truncate">
											{t.label}
										</span>
										{t.count && t.count > 0 ? (
											<span
												className={cn(
													"inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white",
													t.tone === "critical"
														? "bg-red-600"
														: t.tone === "notice"
															? "bg-blue-600"
															: "bg-amber-500",
												)}
											>
												{t.count}
											</span>
										) : null}
									</span>
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
