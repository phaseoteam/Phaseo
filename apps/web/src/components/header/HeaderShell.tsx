"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HeaderShellProps = {
	children: ReactNode;
};

export default function HeaderShell({ children }: HeaderShellProps) {
	const pathname = usePathname() ?? "";
	const isSettingsRoute = pathname.startsWith("/settings");

	return (
		<div
			className={cn(
				"mx-auto w-full [view-transition-name:site-header-shell]",
				"transition-[max-width,padding-inline] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
				isSettingsRoute
					? "max-w-full px-4"
					: "max-w-full px-4 sm:max-w-[640px] md:max-w-[768px] lg:max-w-[1024px] xl:max-w-[1280px] 2xl:max-w-[1536px]",
			)}
			data-variant={isSettingsRoute ? "wide" : "default"}
		>
			{children}
		</div>
	);
}
