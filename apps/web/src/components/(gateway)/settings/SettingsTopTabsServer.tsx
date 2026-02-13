"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Tab = {
	href: string;
	label: string;
	match?: string[];
};

const BILLING_TABS: Tab[] = [
	{ href: "/settings/credits", label: "Credits" },
	{ href: "/settings/credits/transactions", label: "Transactions" },
	{ href: "/settings/payment-methods", label: "Payment methods" },
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
		label: "Keys",
		match: ["/settings/keys", "/settings/management-api-keys", "/settings/provisioning-keys"],
	},
	{ href: "/settings/routing", label: "Routing" },
	{ href: "/settings/byok", label: "BYOK" },
	{ href: "/settings/presets", label: "Presets" },
];

function resolveTabs(pathname: string): Tab[] | null {
	if (pathname.startsWith("/settings/credits") || pathname.startsWith("/settings/payment-methods") || pathname.startsWith("/settings/tiers")) {
		return BILLING_TABS;
	}
	if (pathname.startsWith("/settings/usage")) return USAGE_TABS;
	if (
		pathname.startsWith("/settings/keys") ||
		pathname.startsWith("/settings/management-api-keys") ||
		pathname.startsWith("/settings/provisioning-keys") ||
		pathname.startsWith("/settings/routing") ||
		pathname.startsWith("/settings/byok") ||
		pathname.startsWith("/settings/presets")
	) {
		return API_TABS;
	}
	// Developer and other pages: sidebar is enough.
	return null;
}

function isActive(pathname: string, tab: Tab) {
	if (pathname === tab.href) return true;
	return Boolean(tab.match?.some((m) => pathname.startsWith(m)));
}

export default function SettingsTopTabsServer() {
	const pathname = usePathname() ?? "";
	const tabs = resolveTabs(pathname);

	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const linkRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});
	const [indicator, setIndicator] = React.useState({ left: 0, width: 0, opacity: 0 });

	const activeTab = tabs?.find((t) => isActive(pathname, t)) ?? null;

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
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}

