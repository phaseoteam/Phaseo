"use client";

import Link from "next/link";
import React from "react";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { UPDATE_TAB_ORDER, type UpdateTabId } from "@/lib/content/updates";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<UpdateTabId, string> = {
	models: "Models",
	web: "Web",
	youtube: "YouTube",
};

export default function UpdateTabs() {
	const pathname = usePathname() || "/updates/models";
	const tabs = React.useMemo(
		() =>
			UPDATE_TAB_ORDER.map((category) => ({
				category,
				href: `/updates/${category}`,
				label: TAB_LABELS[category],
			})),
		[]
	);

	const activeCategory =
		((
			pathname === "/updates/calendar" ||
			pathname.startsWith("/updates/calendar/")
		)
			? "models"
			: UPDATE_TAB_ORDER.find(
			(cat) =>
				pathname === `/updates/${cat}` ||
				pathname.startsWith(`/updates/${cat}/`)
		)) ?? "models";

	const activeTab = tabs.find((t) => t.category === activeCategory) ?? tabs[0];

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
		const update = () => setIndicatorToHref(activeTab.href);
		const raf = requestAnimationFrame(update);
		window.addEventListener("resize", update);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", update);
		};
	}, [activeTab.href, setIndicatorToHref]);

	return (
		<>
			{/* Desktop */}
			<div
				ref={desktopContainerRef}
				className="relative mb-4 mt-6 hidden gap-4 border-b md:flex"
				onMouseLeave={() => setIndicatorToHref(activeTab.href)}
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
					const isActive = tab.category === activeCategory;
					return (
						<Link
							key={tab.category}
							href={tab.href}
							prefetch={false}
							aria-current={isActive ? "page" : undefined}
							ref={(el) => {
								tabRefs.current[tab.href] = el;
							}}
							onMouseEnter={() => setIndicatorToHref(tab.href)}
							onFocus={() => setIndicatorToHref(tab.href)}
							className={cn(
								"px-2 pb-2 text-sm font-medium transition-colors duration-150",
								isActive
									? "text-primary"
									: "text-foreground hover:text-primary"
							)}
						>
							{tab.label}
						</Link>
					);
				})}
			</div>

			{/* Mobile */}
			<div className="mb-4 mt-6 md:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="group flex w-full items-center justify-between rounded border bg-background p-2 text-base text-foreground">
							{activeTab.label}
							<ChevronDown className="ml-2 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-(--radix-popper-anchor-width)"
					>
						{tabs.map((tab) => (
							<DropdownMenuItem key={tab.category} asChild>
								<Link href={tab.href} prefetch={false}>
									{tab.label}
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
