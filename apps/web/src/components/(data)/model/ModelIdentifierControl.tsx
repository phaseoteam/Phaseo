"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ModelIdentifierControlProps {
	defaultIdentifier: string;
	aliases?: string[];
}

type IdentifierOption = {
	value: string;
	label: string;
};

export default function ModelIdentifierControl({
	defaultIdentifier,
	aliases = [],
}: ModelIdentifierControlProps) {
	const copyResetTimerRef = useRef<number | null>(null);
	const options = useMemo<IdentifierOption[]>(
		() => [
			{ value: defaultIdentifier, label: defaultIdentifier },
			...Array.from(new Set(aliases))
				.filter((alias) => alias && alias !== defaultIdentifier)
				.map((alias) => ({ value: alias, label: alias })),
		],
		[aliases, defaultIdentifier],
	);

	const [selectedIdentifier, setSelectedIdentifier] = useState(defaultIdentifier);
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

	const handleCopy = async () => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(selectedIdentifier);
			} else if (!fallbackCopyText(selectedIdentifier)) {
				throw new Error("clipboard unavailable");
			}
			setCopied(true);
			if (copyResetTimerRef.current !== null) {
				window.clearTimeout(copyResetTimerRef.current);
			}
			copyResetTimerRef.current = window.setTimeout(() => {
				setCopied(false);
				copyResetTimerRef.current = null;
			}, 1500);
			toast.success("Model ID copied", {
				description: selectedIdentifier,
			});
		} catch {
			try {
				if (!fallbackCopyText(selectedIdentifier)) {
					throw new Error("fallback copy failed");
				}
				setCopied(true);
				if (copyResetTimerRef.current !== null) {
					window.clearTimeout(copyResetTimerRef.current);
				}
				copyResetTimerRef.current = window.setTimeout(() => {
					setCopied(false);
					copyResetTimerRef.current = null;
				}, 1500);
				toast.success("Model ID copied", {
					description: selectedIdentifier,
				});
			} catch {
				setCopied(false);
				toast.error("Copy failed", {
					description: "Could not copy the selected model identifier.",
				});
			}
		}
	};

	if (!defaultIdentifier) return null;

	return (
		<div className="flex items-center gap-2">
			<Select value={selectedIdentifier} onValueChange={setSelectedIdentifier}>
				<SelectTrigger
					aria-label="Model identifier"
					className="h-8 w-auto min-w-[136px] select-none rounded-md px-3 text-xs font-medium"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				className="h-8 w-8 rounded-md"
				aria-label={`Copy model identifier ${selectedIdentifier}`}
				title={copied ? "Copied" : "Copy model identifier"}
				onClick={handleCopy}
			>
				<span className="relative grid h-3.5 w-3.5 place-items-center">
					<Copy
						className={`absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ${
							copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
						}`}
					/>
					<Check
						className={`absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ${
							copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
						}`}
					/>
				</span>
			</Button>
		</div>
	);
}
