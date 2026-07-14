"use client";

import { Logo } from "@/components/Logo";
import {
	CommandItem,
} from "@/components/ui/command";
import { ArrowUpRight, Trophy } from "lucide-react";

interface SearchRowItemProps {
	id: string;
	title: string;
	subtitle?: string | null;
	href: string;
	logoId?: string | null;
	flagIso?: string;
	leftLogoId?: string;
	rightLogoId?: string;
	keywords?: string[];
	onSelect: (href: string) => void;
	type?: "benchmark" | "comparison" | "default";
	showSubtitle?: boolean;
}

export function SearchRowItem({
	title,
	subtitle,
	href,
	logoId,
	flagIso,
	leftLogoId,
	rightLogoId,
	keywords,
	onSelect,
	type = "default",
	showSubtitle = true,
}: SearchRowItemProps) {
	const commandKeywords = keywords?.filter(Boolean) ?? [];
	const commandValue = [title, href]
		.filter(Boolean)
		.join(" ");

	return (
		<CommandItem
			value={commandValue}
			keywords={commandKeywords}
			onSelect={() => onSelect(href)}
			className="flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5"
		>
			<SearchRowIcon
				logoId={logoId}
				flagIso={flagIso}
				leftLogoId={leftLogoId}
				rightLogoId={rightLogoId}
				title={title}
				type={type}
			/>
			<div className="min-w-0 flex flex-1 items-baseline gap-2">
				<span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
					{title}
				</span>
				{showSubtitle && subtitle ? (
					<span className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
						{subtitle}
					</span>
				) : null}
			</div>
			<ArrowUpRight className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
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
		return (
			<div className="flex size-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
				<Trophy className="size-3" />
			</div>
		);
	}

	if (type === "comparison" && leftLogoId && rightLogoId) {
		return (
			<div className="flex shrink-0 items-center gap-1">
				<div className="relative flex size-5 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
					<div className="relative size-3.5">
						<Logo id={leftLogoId} alt={`${leftLogoId} logo`} className="object-contain" fill />
					</div>
				</div>
				<div className="relative flex size-5 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
					<div className="relative size-3.5">
						<Logo id={rightLogoId} alt={`${rightLogoId} logo`} className="object-contain" fill />
					</div>
				</div>
			</div>
		);
	}

	if (flagIso) {
		return (
			<div className="relative aspect-4/3 h-5 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
				<img src={`/flags/${flagIso}.svg`} alt={title} className="h-full w-full rounded-sm object-cover" />
			</div>
		);
	}

	if (logoId) {
		return (
			<div className="relative flex size-5 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
				<div className="relative size-3.5">
					<Logo id={logoId} alt={title} className="object-contain" fill />
				</div>
			</div>
		);
	}

	return <div className="size-5 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-700" />;
}
