"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Tab = {
	href: string;
	label: string;
	match?: string[];
	badge?: string;
};

const BILLING_TABS: Tab[] = [
	{ href: "/settings/credits", label: "Credits" },
	{ href: "/settings/credits/transactions", label: "Transactions" },
	{ href: "/settings/payment-methods", label: "Payment Methods" },
	{ href: "/settings/tiers", label: "Tiers" },
];

const USAGE_TABS: Tab[] = [
	{ href: "/settings/usage", label: "Usage" },
	{ href: "/settings/usage/logs", label: "Logs" },
	{ href: "/settings/usage/alerts", label: "Alerts" },
];

const API_TABS: Tab[] = [
	{
		href: "/settings/keys",
		label: "API Keys",
		match: ["/settings/keys"],
	},
	{ href: "/settings/apps", label: "Apps", match: ["/settings/apps"] },
	{
		href: "/settings/management-api-keys",
		label: "Management Keys",
		match: ["/settings/management-api-keys", "/settings/provisioning-keys"],
	},
	{ href: "/settings/routing", label: "Routing", match: ["/settings/routing"] },
	{ href: "/settings/byok", label: "BYOK", match: ["/settings/byok"] },
	{ href: "/settings/presets", label: "Presets", match: ["/settings/presets"] },
	{
		href: "/settings/guardrails",
		label: "Guardrails",
		match: ["/settings/guardrails"],
		badge: "Alpha",
	},
];

const OAUTH_TABS: Tab[] = [
	{ href: "/settings/oauth-apps", label: "OAuth Apps" },
	{ href: "/settings/authorized-apps", label: "OAuth Integrations" },
];

const TEAM_TABS: Tab[] = [
	{
		href: "/settings/teams/members",
		label: "Members",
		match: ["/settings/teams/members"],
	},
	{
		href: "/settings/teams/settings",
		label: "Team Settings",
		match: ["/settings/teams/settings"],
	},
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
	if (pathname.startsWith("/settings/oauth-apps") || pathname.startsWith("/settings/authorized-apps")) {
		return OAUTH_TABS;
	}

	// Team
	if (pathname.startsWith("/settings/teams")) {
		return TEAM_TABS;
	}

	if (pathname.startsWith("/settings/credits") || pathname.startsWith("/settings/payment-methods") || pathname.startsWith("/settings/tiers")) {
		return BILLING_TABS;
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
		pathname.startsWith("/settings/guardrails")
	) {
		return API_TABS;
	}
	// Developer and other pages: sidebar is enough.
	return null;
}

function isActive(pathname: string, tab: Tab) {
	// Treat the account index route as details, since `/settings/account` redirects.
	if (pathname === "/settings/account" && tab.href === "/settings/account/details")
		return true;

	// Treat the team index route as members, since `/settings/teams` will redirect.
	if (pathname === "/settings/teams" && tab.href === "/settings/teams/members")
		return true;

	if (pathname === tab.href) return true;
	if (pathname.startsWith(tab.href + "/")) return true;

	return Boolean(
		tab.match?.some((m) => pathname === m || pathname.startsWith(m + "/")),
	);
}

export default function SettingsTopTabsServer() {
	const pathname = usePathname() ?? "";
	const tabs = resolveTabs(pathname);

	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const linkRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});
	const [indicator, setIndicator] = React.useState({ left: 0, width: 0, opacity: 0 });

	const matchScore = React.useCallback((t: Tab) => {
		// Treat the account index route as details, since `/settings/account` redirects.
		if (pathname === "/settings/account" && t.href === "/settings/account/details") {
			return { exact: true, len: t.href.length };
		}

		// Treat the team index route as members, since `/settings/teams` will redirect.
		if (pathname === "/settings/teams" && t.href === "/settings/teams/members") {
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

	if (!tabs?.length) return null;

	return (
		<nav
			ref={containerRef}
			className="relative flex gap-4 border-b border-border"
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
				const active = isActive(pathname, tab);
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
	);
}

