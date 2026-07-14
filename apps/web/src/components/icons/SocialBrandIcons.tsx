"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandIconProps = {
	className?: string;
};

export function GitHubBrandIcon({ className }: BrandIconProps) {
	return (
		<>
			<Image
				src="/social/github_light.svg"
				alt=""
				aria-hidden="true"
				width={20}
				height={20}
				className={cn("dark:hidden", className)}
			/>
			<Image
				src="/social/github_dark.svg"
				alt=""
				aria-hidden="true"
				width={20}
				height={20}
				className={cn("hidden dark:inline", className)}
			/>
		</>
	);
}

export function LinkedInBrandIcon({ className }: BrandIconProps) {
	return (
		<Image
			src="/social/linkedin.svg"
			alt=""
			aria-hidden="true"
			width={20}
			height={20}
			className={className}
		/>
	);
}

export function XBrandIcon({ className }: BrandIconProps) {
	return (
		<>
			<Image
				src="/social/x_light.svg"
				alt=""
				aria-hidden="true"
				width={20}
				height={20}
				className={cn("dark:hidden", className)}
			/>
			<Image
				src="/social/x_dark.svg"
				alt=""
				aria-hidden="true"
				width={20}
				height={20}
				className={cn("hidden dark:inline", className)}
			/>
		</>
	);
}
