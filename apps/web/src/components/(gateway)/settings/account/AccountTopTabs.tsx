"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Tab = {
	href: string;
	label: string;
};

const TABS: Tab[] = [
	{ href: "/settings/account/details", label: "Details" },
	{ href: "/settings/account/mfa", label: "MFA" },
	{ href: "/settings/account/danger", label: "Danger Zone" },
];

export default function AccountTopTabs() {
	const pathname = usePathname() ?? "";

	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const tabRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});
	const [indicator, setIndicator] = React.useState({
		left: 0,
		width: 0,
		opacity: 0,
	});

	const activeHref =
		TABS.find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
			?.href ?? TABS[0].href;

	const setIndicatorToHref = React.useCallback((href: string) => {
		const container = containerRef.current;
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
		const update = () => setIndicatorToHref(activeHref);
		const raf = requestAnimationFrame(update);
		window.addEventListener("resize", update);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", update);
		};
	}, [activeHref, setIndicatorToHref]);

	return (
		<nav
			ref={containerRef}
			className="relative flex gap-4 border-b border-border"
			onMouseLeave={() => setIndicatorToHref(activeHref)}
			aria-label="Account navigation"
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

			{TABS.map((tab) => {
				const active = tab.href === activeHref;
				return (
					<Link
						key={tab.href}
						href={tab.href}
						prefetch={false}
						aria-current={active ? "page" : undefined}
						ref={(el) => {
							tabRefs.current[tab.href] = el;
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

