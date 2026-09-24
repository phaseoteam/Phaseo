"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSearchShortcutLabel } from "./SearchShortcut";
import type { SearchCapabilities } from "@/components/header/Search/Search.navigation";
import type { AccountQueryScope } from "@/lib/query/queryKeys";

const Search = dynamic(() => import("./Search"), {
	ssr: false,
	loading: () => null,
});

interface SearchWrapperProps {
	className?: string;
	capabilities?: SearchCapabilities;
	accountQueryScope?: AccountQueryScope | null;
}

export function SearchWrapper({ className, capabilities, accountQueryScope }: SearchWrapperProps) {
	const [activated, setActivated] = useState(false);
	const shortcutLabel = useSearchShortcutLabel();

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
			event.preventDefault();
			setActivated(true);
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	if (activated) {
		return (
			<Search
				className={className}
				capabilities={capabilities}
				accountQueryScope={accountQueryScope}
				initiallyOpen
			/>
		);
	}

	return (
		<div className={cn("flex items-center", className)}>
			<button
				type="button"
				onClick={() => setActivated(true)}
				className={cn(
					"relative flex h-9 w-full min-w-0 items-center justify-start rounded-lg border border-border bg-background pl-8 pr-2 text-left text-sm text-muted-foreground shadow-none transition-[border-color,color,background-color] hover:bg-accent hover:text-accent-foreground max-[22rem]:justify-center max-[22rem]:px-0 lg:pl-9 lg:pr-14",
				)}
				aria-label="Open global search"
			>
				<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground max-[22rem]:left-1/2 max-[22rem]:-translate-x-1/2 lg:left-3" />
				<span className="min-w-0 flex-1 truncate font-medium max-[22rem]:hidden">
					<span className="xl:hidden">Search</span>
					<span className="hidden whitespace-nowrap xl:inline">Search Phaseo</span>
				</span>
				<span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline-flex">
					{shortcutLabel}
				</span>
			</button>
		</div>
	);
}
