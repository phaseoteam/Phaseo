"use client";

import * as React from "react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

type ProviderLogoSize = "xxs" | "xs" | "sm" | "md" | "lg";

const SIZE_STYLES: Record<
	ProviderLogoSize,
	{ outer: string; inner: string }
> = {
	xxs: { outer: "w-5 h-5 rounded-md", inner: "w-3.5 h-3.5" },
	xs: { outer: "w-6 h-6 rounded-md", inner: "w-4 h-4" },
	sm: { outer: "w-8 h-8 rounded-lg", inner: "w-5 h-5" },
	md: { outer: "w-10 h-10 rounded-xl", inner: "w-7 h-7" },
	lg: { outer: "w-12 h-12 rounded-xl", inner: "w-8 h-8" },
};

export function ProviderLogo({
	id,
	alt,
	size = "xs",
	className,
}: {
	id: string;
	alt: string;
	size?: ProviderLogoSize;
	className?: string;
}) {
	const styles = SIZE_STYLES[size];
	return (
		<div
			className={cn(
				"relative flex items-center justify-center border border-zinc-200 dark:border-zinc-800 bg-background",
				styles.outer,
				className
			)}
		>
			<div className={cn("relative", styles.inner)}>
				<Logo id={id} alt={alt} className="object-contain" fill />
			</div>
		</div>
	);
}

