"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { toast } from "sonner";

function formatVariantKindLabel(kind?: string | null): string {
	const normalized = String(kind ?? "").trim().toLowerCase();
	if (normalized === "standard") return "Base";
	if (normalized === "free") return "Free";
	if (!normalized) return "Variant";
	return normalized
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

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

export function resolveModelIdentifierOptions({
	defaultIdentifier,
	aliases,
	requestedAlias,
}: Pick<ModelIdentifierControlProps, "defaultIdentifier" | "aliases" | "requestedAlias">): {
	options: string[];
	displayedIdentifier: string;
} {
	const normalizedRequestedAlias = requestedAlias?.trim().toLowerCase() || null;
	return {
		options: Array.from(new Set([
			defaultIdentifier,
			normalizedRequestedAlias,
			...(aliases ?? []),
		].filter((identifier): identifier is string => Boolean(identifier)))),
		displayedIdentifier: normalizedRequestedAlias ?? defaultIdentifier,
	};
}

export default function ModelIdentifierControl({
	defaultIdentifier,
	aliases = [],
	requestedAlias,
	variants = [],
}: ModelIdentifierControlProps) {
	const router = useRouter();
	const copyResetTimerRef = useRef<number | null>(null);
	const { options, displayedIdentifier } = useMemo(
		() => resolveModelIdentifierOptions({ defaultIdentifier, aliases, requestedAlias }),
		[aliases, defaultIdentifier, requestedAlias],
	);
	const variantOptions = useMemo(() => {
		const seen = new Set<string>();
		return variants.filter((variant) => {
			const modelId = String(variant.model_id ?? "").trim();
			if (!modelId || seen.has(modelId)) return false;
			seen.add(modelId);
			return true;
		});
	}, [variants]);
	const hasAliases = options.length > 1;
	const hasVariants = variantOptions.length > 1;
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

	const copyIcon = copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />;
	const currentVariant = variantOptions.find((variant) => variant.model_id === defaultIdentifier) ?? null;
	const currentVariantLabel = formatVariantKindLabel(currentVariant?.variant_kind ?? "current");
	const copyButton = (
		<button
			type="button"
			className="group inline-flex max-w-full items-center gap-1 px-0 py-0 text-left text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-0 dark:text-zinc-300 dark:hover:text-zinc-50"
			aria-label={`Copy model identifier ${displayedIdentifier}`}
			title={copied ? "Copied" : "Copy model identifier"}
			onClick={() => void copyIdentifier(displayedIdentifier)}
		>
			<span className="min-w-0 select-none truncate font-mono">{displayedIdentifier}</span>
			<span className="ml-0.5 shrink-0 text-zinc-500 opacity-0 transition-all duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-zinc-400">
				{copyIcon}
			</span>
		</button>
	);

	if (!hasAliases && !hasVariants) return copyButton;

	return (
		<div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5">
			{hasVariants ? (
				<DropdownMenu>
					<DropdownMenuTrigger render={<button
						type="button"
						className="inline-flex h-7 items-center gap-2 rounded-md border border-zinc-200 bg-background px-2.5 text-[11px] font-medium text-foreground shadow-xs transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:border-zinc-800 dark:hover:bg-zinc-900"
						aria-label="Select model variant" />
					}>
						<span className="text-muted-foreground">Variant</span>
						<span className="truncate">{currentVariantLabel}</span>
						<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)] rounded-lg p-1.5">
						<div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
							Model variant
						</div>
						{variantOptions.map((variant) => {
							const isCurrent = variant.model_id === defaultIdentifier;
							const variantHref = getModelDetailsHref(null, variant.model_id);
							const variantLabel = formatVariantKindLabel(variant.variant_kind);
							return (
								<DropdownMenuItem
									key={variant.model_id}
									disabled={!variantHref}
									onClick={() => {
										if (!isCurrent && variantHref) router.push(variantHref);
									}}
									className="flex items-center justify-between gap-4 rounded-lg px-2.5 py-2"
								>
									<span className="flex min-w-0 items-center gap-2">
										<Check className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? "opacity-100" : "opacity-0"}`} />
										<span className="min-w-0 truncate">{variant.name}</span>
									</span>
									<span className="shrink-0 text-[11px] capitalize text-muted-foreground">{variantLabel}</span>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{hasAliases ? (
				<DropdownMenu>
					<DropdownMenuTrigger render={<button
						type="button"
						className="group inline-flex max-w-full items-center gap-1 px-0 py-0 text-left text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-0 dark:text-zinc-300 dark:hover:text-zinc-50"
						aria-label="Model identifiers" />
					}>
						<span className="min-w-0 select-none truncate font-mono">{displayedIdentifier}</span>
						{isDisplayingAlias ? (
							<span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
								Alias
							</span>
						) : null}
						<span className="ml-0.5 shrink-0 text-zinc-500 transition-all duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-zinc-400">
							{copied ? <Check className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
						</span>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-auto min-w-0 max-w-[calc(100vw-2rem)] rounded-lg">
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
			) : copyButton}
		</div>
	);
}
