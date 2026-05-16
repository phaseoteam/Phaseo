"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type HeaderShellProps = {
	children: ReactNode;
};

export default function HeaderShell({ children }: HeaderShellProps) {
	const pathname = usePathname() ?? "";
	const isExperimentsCouncilRoute =
		pathname === "/experiments/council" ||
		pathname.startsWith("/experiments/council/");
	const isModelsListRoute =
		pathname === "/models" ||
		pathname.startsWith("/models/table") ||
		pathname.startsWith("/models/collections");
	const isModelDetailRoute =
		pathname.startsWith("/models/") && !isModelsListRoute;
	const isWideOnlyRoute =
		pathname.startsWith("/settings") || isModelsListRoute;
	const variant: "default" | "wide" | "compact" = isExperimentsCouncilRoute
		? "compact"
		: isWideOnlyRoute
			? "wide"
			: "default";
	const isWideRoute =
		pathname.startsWith("/settings") ||
		isExperimentsCouncilRoute ||
		isModelsListRoute ||
		isModelDetailRoute;
	const headerVars: CSSProperties & Record<string, string> =
		variant === "compact"
			? {
					"--site-header-height": "3.375rem",
					"--site-header-gap": "2rem",
					"--site-header-left-gap": "1.25rem",
					"--site-header-logo-height": "1.9rem",
					"--site-header-divider-height": "1.25rem",
					"--site-header-control-h": "2.125rem",
					"--site-header-nav-px": "0.5rem",
					"--site-header-search-width": "10.5rem",
					"--site-header-search-width-xl": "11.5rem",
				}
			: {
					"--site-header-height": "3.75rem",
					"--site-header-gap": "1.5rem",
					"--site-header-left-gap": "1.25rem",
					"--site-header-logo-height": "2.3rem",
					"--site-header-divider-height": "1.5rem",
					"--site-header-control-h": "2.25rem",
					"--site-header-nav-px": "0.5rem",
					"--site-header-search-width": "10.75rem",
					"--site-header-search-width-xl": "12rem",
				};

	return (
		<div
			className={cn(
				"mx-auto w-full [view-transition-name:site-header-shell]",
				"transition-[max-width,padding-inline] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
				variant === "compact"
					? "max-w-full px-3 sm:px-4 lg:px-5"
					: isWideRoute
					? "max-w-full px-4 lg:px-5 xl:px-6"
					: "max-w-full px-4 sm:max-w-[640px] md:max-w-[768px] lg:max-w-[1024px] xl:max-w-[1280px] 2xl:max-w-[1536px]",
			)}
			style={headerVars}
			data-variant={variant}
		>
			{children}
		</div>
	);
}

