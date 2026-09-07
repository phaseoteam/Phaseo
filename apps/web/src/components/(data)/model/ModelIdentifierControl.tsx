"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { toast } from "sonner";

interface ModelIdentifierControlProps {
	defaultIdentifier: string;
	aliases?: string[];
	requestedAlias?: string;
	variants?: Array<{
		model_id: string;
		name: string;
		variant_kind: string;
	}>;
}

export default function ModelIdentifierControl({
	defaultIdentifier,
	aliases = [],
	requestedAlias,
	variants = [],
}: ModelIdentifierControlProps) {
	const router = useRouter();
	const copyResetTimerRef = useRef<number | null>(null);
	const options = useMemo<string[]>(
		() => [
			defaultIdentifier,
			...Array.from(new Set(aliases))
				.filter((alias) => alias && alias !== defaultIdentifier)
				.map((alias) => alias),
		],
		[aliases, defaultIdentifier],
	);
	const hasAliases = options.length > 1;
	const hasVariants = variants.length > 1;
	const hasMenu = hasAliases || hasVariants;
	const displayedIdentifier = requestedAlias && options.includes(requestedAlias)
		? requestedAlias
		: defaultIdentifier;
	const isDisplayingAlias = displayedIdentifier !== defaultIdentifier;

	const [copied, setCopied] = useState(false);

	useEffect(() => {
		return () => {
			if (copyResetTimerRef.current !== null) {
				window.clearTimeout(copyResetTimerRef.current);
			}
		};
	}, []);

	const fallbackCopyText = (value: string) => {
		const textarea = document.createElement("textarea");
		textarea.value = value;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		textarea.style.pointerEvents = "none";
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		const succeeded = document.execCommand("copy");
		document.body.removeChild(textarea);
		return succeeded;
	};

	const markCopied = (description: string) => {
		setCopied(true);
		if (copyResetTimerRef.current !== null) {
			window.clearTimeout(copyResetTimerRef.current);
		}
		copyResetTimerRef.current = window.setTimeout(() => {
			setCopied(false);
			copyResetTimerRef.current = null;
		}, 1500);
		toast.success("Model ID copied", {
			description,
		});
	};

	const copyIdentifier = async (value: string) => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
			} else if (!fallbackCopyText(value)) {
				throw new Error("clipboard unavailable");
			}
			markCopied(value);
		} catch {
			try {
				if (!fallbackCopyText(value)) {
					throw new Error("fallback copy failed");
				}
				markCopied(value);
			} catch {
				setCopied(false);
				toast.error("Copy failed", {
					description: "Could not copy the selected model identifier.",
				});
			}
		}
	};

	if (!defaultIdentifier) return null;

	const triggerIcon = copied
		? <Check className="h-3 w-3" />
		: hasMenu
			? <ChevronDown className="h-3 w-3" />
			: <Copy className="h-3 w-3" />;

	if (!hasMenu) {
		return (
			<button
				type="button"
				className="group inline-flex max-w-full items-center gap-1 px-0 py-0 text-left text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-0 dark:text-zinc-300 dark:hover:text-zinc-50"
				aria-label={`Copy model identifier ${displayedIdentifier}`}
				title={copied ? "Copied" : "Copy model identifier"}
				onClick={() => void copyIdentifier(displayedIdentifier)}
			>
				<span className="min-w-0 select-none truncate font-mono">{displayedIdentifier}</span>
				<span className="ml-0.5 shrink-0 text-zinc-500 opacity-0 transition-all duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-zinc-400">
					{triggerIcon}
				</span>
			</button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<button
					type="button"
				className="group inline-flex max-w-full items-center gap-1 px-0 py-0 text-left text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-0 dark:text-zinc-300 dark:hover:text-zinc-50"
					aria-label="Model identifiers" />}>

					<span className="min-w-0 select-none truncate font-mono">{displayedIdentifier}</span>
					{isDisplayingAlias ? (
						<span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
							Alias
						</span>
					) : null}
					<span className="ml-0.5 shrink-0 text-zinc-500 transition-all duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-zinc-400">
						{triggerIcon}
					</span>

			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-auto min-w-0 max-w-[calc(100vw-2rem)] rounded-lg">
				{hasVariants ? (
					<>
						<div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
							Model variants
						</div>
						{variants.map((variant) => {
							const isCurrent = variant.model_id === defaultIdentifier;
							const variantHref = getModelDetailsHref(null, variant.model_id);
							return (
								<DropdownMenuItem
									key={variant.model_id}
									disabled={!variantHref}
									onClick={() => {
										if (!isCurrent && variantHref) router.push(variantHref);
									}}
									className="flex items-center justify-between gap-4 rounded-lg"
								>
									<span className="flex min-w-0 items-center gap-2">
										<Check className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? "opacity-100" : "opacity-0"}`} />
										<span className="truncate">{variant.name}</span>
									</span>
									<span className="shrink-0 text-[11px] capitalize text-muted-foreground">
										{variant.variant_kind === "standard" ? "Base" : variant.variant_kind}
									</span>
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
					</>
				) : null}
				<div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
					Identifiers
				</div>
				{options.map((option) => (
					<DropdownMenuItem
						key={option}
						closeOnClick={false}
						onClick={() => {
							void copyIdentifier(option);
						}}
						className="flex items-center justify-between gap-3 rounded-lg"
					>
						<span className="flex min-w-0 items-center gap-2">
							<Check className={`h-3.5 w-3.5 shrink-0 ${option === displayedIdentifier ? "opacity-100" : "opacity-0"}`} />
							<span className="truncate">{option}</span>
						</span>
						<span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
							{option === defaultIdentifier ? "Default" : "Alias"}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
