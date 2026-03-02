"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const tabs = [
	{ label: "Overview", key: "overview" },
	{ label: "Models", key: "models" },
];

interface CountryTabsProps {
	iso: string;
}

export default function CountryTabs({ iso }: CountryTabsProps) {
	const pathname = usePathname();
	const segments = pathname ? pathname.split("/").filter(Boolean) : [];
	const lastSegment = segments[segments.length - 1];
	const activeKey =
		!lastSegment || lastSegment === iso.toLowerCase() ? "overview" : lastSegment;

	const hrefFor = (key: string) =>
		key === "overview"
			? `/countries/${iso.toLowerCase()}`
			: `/countries/${iso.toLowerCase()}/${key}`;
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
				{tabs.map((tab) => {
					const isActive = activeKey === tab.key;
					return (
						<Link
							key={tab.key}
							href={hrefFor(tab.key)}
							aria-current={isActive ? "page" : undefined}
							ref={(el) => {
								tabRefs.current[tab.key] = el;
							}}
							onMouseEnter={() => setIndicatorToKey(tab.key)}
							onFocus={() => setIndicatorToKey(tab.key)}
							className={cn(
								"pb-2 px-2 text-sm font-medium transition-colors duration-150",
								isActive
									? "text-primary"
									: "text-muted-foreground hover:text-primary"
							)}
						>
							{tab.label}
						</Link>
					);
				})}
			</div>

			<div className="mb-4 md:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="group flex w-full items-center justify-between rounded border bg-background p-2 text-base text-foreground">
							{tabs.find((tab) => tab.key === activeKey)?.label ?? "Overview"}
							<ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-(--radix-popper-anchor-width)"
					>
						{tabs.map((tab) => (
							<DropdownMenuItem key={tab.key} asChild>
								<Link href={hrefFor(tab.key)}>{tab.label}</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
