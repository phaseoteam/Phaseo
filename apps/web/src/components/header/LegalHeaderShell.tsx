"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LegalHeaderShellProps = {
	children: ReactNode;
};

export default function LegalHeaderShell({ children }: LegalHeaderShellProps) {
	return (
		<div
			className={cn(
				"mx-auto h-10 w-full max-w-full px-4",
				"sm:max-w-[640px] md:max-w-[768px] lg:max-w-[1024px] xl:max-w-[1280px] 2xl:max-w-[1536px]",
			)}
			data-variant="legal-compact"
		>
			<div className="flex h-full items-center">{children}</div>
		</div>
	);
}
