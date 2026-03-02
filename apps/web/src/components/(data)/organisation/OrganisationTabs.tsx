// components/(data)/organisation/OrganisationTabsNew.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tabs = [
	{ label: "Overview", key: "overview" },
	{ label: "Models", key: "models" },
];

export default function TabBar({ organisationId }: { organisationId: string }) {
	// With layouts removed, `useSelectedLayoutSegment()` may not be available.
	// Derive the active tab from the pathname instead. Example:
	// /organisations/openai/models -> activeKey === 'models'
	const pathname = usePathname();
	const pathnameSegments = pathname
		? pathname.split("/").filter(Boolean)
		: [];
	const lastSegment = pathnameSegments[pathnameSegments.length - 1];
	const activeKey = lastSegment
		? lastSegment === organisationId
			? "overview"
			: lastSegment
		: "overview";
	const hrefFor = (key: string) =>
		key === "overview"
			? `/organisations/${organisationId}`
			: `/organisations/${organisationId}/${key}`;
	const desktopContainerRef = React.useRef<HTMLDivElement | null>(null);
	const tabRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});
	const [indicator, setIndicator] = React.useState({
		left: 0,
		width: 0,
		opacity: 0,
	});

	const setIndicatorToKey = React.useCallback((key: string) => {
		const container = desktopContainerRef.current;
		const el = tabRefs.current[key];
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
		const update = () => setIndicatorToKey(activeKey);
		const raf = requestAnimationFrame(update);
		window.addEventListener("resize", update);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", update);
		};
	}, [activeKey, setIndicatorToKey]);

	return (
		<>
			{/* Desktop */}
			<div
				ref={desktopContainerRef}
				className="relative mb-4 hidden gap-4 border-b md:flex"
				onMouseLeave={() => setIndicatorToKey(activeKey)}
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
				{tabs.map((t) => {
					const href = hrefFor(t.key);
					const isActive = activeKey === t.key;
					return (
						<Link
							key={t.key}
							href={href}
							prefetch={false} // avoid prefetching heavy pages unless you want it
							aria-current={isActive ? "page" : undefined}
							ref={(el) => {
								tabRefs.current[t.key] = el;
							}}
							onMouseEnter={() => setIndicatorToKey(t.key)}
							onFocus={() => setIndicatorToKey(t.key)}
							className={cn(
								"pb-2 px-2 text-sm font-medium transition-colors duration-150",
								isActive
									? "text-primary"
									: "text-muted-foreground hover:text-primary"
							)}
						>
							{t.label}
						</Link>
					);
				})}
			</div>

			{/* Mobile */}
			<div className="md:hidden mb-4">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="group w-full p-2 border rounded text-base bg-background text-foreground flex justify-between items-center">
							{tabs.find((t) => t.key === activeKey)?.label ??
								"Overview"}
							<ChevronDown className="ml-2 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-(--radix-popper-anchor-width)"
					>
						{tabs.map((t) => (
							<DropdownMenuItem key={t.key} asChild>
								<Link
									href={hrefFor(t.key)}
								>
									{t.label}
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
