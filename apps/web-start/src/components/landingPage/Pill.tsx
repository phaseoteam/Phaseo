"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import React from "react";

export type PillProps = {
	href: string;
	label: string;
	ariaLabel?: string;
	icon?: React.ReactNode;
	rightIcon?: React.ReactNode;
	className?: string;
	target?: "_blank" | "_self" | "_parent" | "_top";
	rel?: string;
};

export function Pill({
	href,
	label,
	ariaLabel,
	icon,
	rightIcon = (
		<ArrowUpRight className="ml-1 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
	),
	className,
	target,
	rel,
}: PillProps) {
	return (
		<Button
			asChild
			variant="outline"
			size="sm"
			className={cn("group rounded-full gap-2 px-3 h-8", className)}
			aria-label={ariaLabel ?? label}
		>
			<Link href={href} target={target} rel={rel}>
				<span className="inline-flex items-center">
					{icon}
					<span className="ml-2 text-xs">{label}</span>
					{rightIcon}
				</span>
			</Link>
		</Button>
	);
}

export function ThemedGitHubIcon({ className }: { className?: string }) {
	return (
		<>
			<Image
				src="/social/github_light.svg"
				alt="GitHub"
				width={16}
				height={16}
				className={cn("w-4 h-4 dark:hidden", className)}
			/>
			<Image
				src="/social/github_dark.svg"
				alt="GitHub"
				width={16}
				height={16}
				className={cn("w-4 h-4 hidden dark:inline", className)}
			/>
		</>
	);
}

export function LiveDot({ className }: { className?: string }) {
	return (
		<span
			className={cn("relative inline-flex h-2 w-2", className)}
			aria-hidden
		>
			<span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 animate-ping" />
			<span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
		</span>
	);
}
