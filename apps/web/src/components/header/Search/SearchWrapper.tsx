"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SearchCapabilities } from "@/components/header/Search/Search.navigation";

const Search = dynamic(() => import("./Search"), {
	ssr: false,
	loading: () => null,
});

interface SearchWrapperProps {
	className?: string;
	mobileGhost?: boolean;
	capabilities?: SearchCapabilities;
}

export function SearchWrapper({ className, mobileGhost, capabilities }: SearchWrapperProps) {
	const [activated, setActivated] = useState(false);

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
				mobileGhost={mobileGhost}
				capabilities={capabilities}
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
					"relative flex size-9 items-center justify-center rounded-lg border border-border bg-background px-0 text-left text-sm text-muted-foreground shadow-none transition-[border-color,color,background-color] hover:bg-accent hover:text-accent-foreground xl:w-full xl:justify-start xl:pl-9 xl:pr-12",
					mobileGhost &&
						"border-transparent bg-transparent hover:border-transparent hover:bg-accent xl:border-border xl:bg-background xl:hover:border-border",
				)}
				aria-label="Open command palette"
			>
				<SearchIcon className="pointer-events-none absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground xl:left-3 xl:translate-x-0" />
				<span className="hidden truncate font-medium xl:inline">Search</span>
				<span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground xl:inline-flex">
					Ctrl K
				</span>
			</button>
		</div>
	);
}
