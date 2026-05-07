"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ModelIdentifierControlProps {
	defaultIdentifier: string;
	aliases?: string[];
}

export default function ModelIdentifierControl({
	defaultIdentifier,
	aliases = [],
}: ModelIdentifierControlProps) {
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
		: hasAliases
			? <ChevronDown className="h-3 w-3" />
			: <Copy className="h-3 w-3" />;

	if (!hasAliases) {
		return (
			<button
				type="button"
				className="group inline-flex max-w-full items-center gap-1 px-0 py-0 text-left text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-0"
				aria-label={`Copy model identifier ${defaultIdentifier}`}
				title={copied ? "Copied" : "Copy model identifier"}
				onClick={() => void copyIdentifier(defaultIdentifier)}
			>
				<span className="min-w-0 select-none truncate font-mono">{defaultIdentifier}</span>
				<span className="ml-0.5 shrink-0 opacity-0 transition-all duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
					{triggerIcon}
				</span>
			</button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
				className="group inline-flex max-w-full items-center gap-1 px-0 py-0 text-left text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-0"
					aria-label="Model identifiers"
				>
					<span className="min-w-0 select-none truncate font-mono">{defaultIdentifier}</span>
					<span className="ml-0.5 shrink-0 transition-all duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
						{triggerIcon}
					</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-auto min-w-0 max-w-[calc(100vw-2rem)]">
				{options.map((option, index) => (
					<DropdownMenuItem
						key={option}
						onSelect={(event) => {
							event.preventDefault();
							void copyIdentifier(option);
						}}
						className="flex items-center justify-between gap-3"
					>
						<span className="min-w-0 truncate">{option}</span>
						<span className="shrink-0 text-[11px] text-zinc-500">
							{index === 0 ? "Default" : "Alias"}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
