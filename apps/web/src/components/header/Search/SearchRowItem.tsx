"use client";

import { Logo } from "@/components/Logo";
import {
	CommandItem,
} from "@/components/ui/command";
import { ArrowUpRight } from "lucide-react";

interface SearchRowItemProps {
	id: string;
	title: string;
	subtitle?: string | null;
	href: string;
	logoId?: string | null;
	flagIso?: string;
	leftLogoId?: string;
	rightLogoId?: string;
	keywords: string[];
	onSelect: (href: string) => void;
	type?: "benchmark" | "comparison" | "default";
}

export function SearchRowItem({
	title,
	subtitle,
	href,
	logoId,
	flagIso,
	leftLogoId,
	rightLogoId,
	onSelect,
	type = "default",
}: SearchRowItemProps) {
	return (
		<CommandItem
			value={href}
			onSelect={() => onSelect(href)}
			className="flex items-center gap-3 rounded-xl px-3 py-2.5"
		>
			<SearchRowIcon
				logoId={logoId}
				flagIso={flagIso}
				leftLogoId={leftLogoId}
				rightLogoId={rightLogoId}
				title={title}
				type={type}
			/>
			<div className="min-w-0 flex flex-1 flex-col gap-0.5">
				<span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
					{title}
				</span>
				{subtitle ? (
					<span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
						{subtitle}
					</span>
				) : null}
			</div>
			<ArrowUpRight className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
		</CommandItem>
	);
}

function SearchRowIcon({
	logoId,
	flagIso,
	leftLogoId,
	rightLogoId,
	title,
	type = "default",
}: {
	logoId?: string | null;
	flagIso?: string;
	leftLogoId?: string;
	rightLogoId?: string;
	title: string;
	type?: "benchmark" | "comparison" | "default";
}) {
	if (type === "benchmark") {
		return null;
	}

	if (type === "comparison" && leftLogoId && rightLogoId) {
		return (
			<div className="flex shrink-0 items-center gap-1.5">
				<div className="relative flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
					<div className="relative h-4 w-4">
						<Logo id={leftLogoId} alt={`${leftLogoId} logo`} className="object-contain" fill />
					</div>
				</div>
				<div className="relative flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
					<div className="relative h-4 w-4">
						<Logo id={rightLogoId} alt={`${rightLogoId} logo`} className="object-contain" fill />
					</div>
				</div>
			</div>
		);
	}

	if (flagIso) {
		return (
			<div className="relative aspect-4/3 h-6 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
				<img src={`/flags/${flagIso}.svg`} alt={title} className="h-full w-full rounded-sm object-cover" />
			</div>
		);
	}

	if (logoId) {
		return (
			<div className="relative flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
				<div className="relative h-4 w-4">
					<Logo id={logoId} alt={title} className="object-contain" fill />
				</div>
			</div>
		);
	}

	return <div className="size-6 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-700" />;
}
