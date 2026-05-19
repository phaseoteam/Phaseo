// components/(data)/model/ModelTabs.tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ModelTab = {
	label: string;
	key: string;
	hidden?: boolean;
};

const tabs: ModelTab[] = [
	{ label: "Overview", key: "overview" },
	{ label: "Playground", key: "playground" },
	{ label: "Providers", key: "providers" },
	{ label: "Pricing", key: "pricing" },
	{ label: "Performance", key: "performance" },
	{ label: "Apps", key: "apps" },
	{ label: "Activity", key: "activity" },
	{ label: "Quickstart", key: "quickstart" },
	{ label: "Benchmarks", key: "benchmarks" },
	{ label: "Family", key: "family" },
	{ label: "Timeline", key: "timeline" },
];

export default function TabBar({
	modelId,
	visibleTabKeys,
}: {
	modelId: string;
	visibleTabKeys?: string[];
}) {
	// With layouts removed, derive the active tab from the pathname.
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const pathnameSegments = pathname
		? pathname.split("/").filter(Boolean)
		: [];

	const lastSegment = pathnameSegments[pathnameSegments.length - 1];
	const visibleKeySet =
		visibleTabKeys && visibleTabKeys.length > 0
			? new Set(visibleTabKeys)
			: null;
	const visibleTabs = tabs.filter(
		(tab) => !tab.hidden && (!visibleKeySet || visibleKeySet.has(tab.key))
	);
	const activeKey = tabs.some((t) => t.key === lastSegment)
		? (lastSegment as string)
		: (visibleTabs[0]?.key ?? "overview");
	const hrefFor = (key: string) => {
		const base =
			key === "overview" ? `/models/${modelId}` : `/models/${modelId}/${key}`;
		const query = searchParams.toString();
		return query ? `${base}?${query}` : base;
	};

	return (
		<div className="mb-4">
			<ScrollArea
				type="always"
				scrollBarOrientation="horizontal"
				className="w-full pb-2"
			>
				<div className="flex min-w-max items-center gap-1 border-b border-border/80 pb-px">
					{visibleTabs.map((t) => {
						const href = hrefFor(t.key);
						const isActive = activeKey === t.key;
						return (
							<Link
								key={t.key}
								href={href}
								prefetch={false}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
									isActive
										? "border-primary text-primary"
										: "border-transparent text-muted-foreground hover:text-foreground",
								)}
							>
								{t.label}
							</Link>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}
