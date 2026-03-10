"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

const EXPLORE_PROVIDERS = [
	{ id: "openai", label: "OpenAI" },
	{ id: "anthropic", label: "Anthropic" },
	{ id: "google", label: "Google" },
	{ id: "xai", label: "xAI" },
	{ id: "mistral", label: "Mistral" },
	{ id: "deepseek", label: "DeepSeek" },
	{ id: "minimax", label: "MiniMax" },
	{ id: "zai", label: "Z-AI" },
	{ id: "moonshotai", label: "Moonshot" },
] as const;

function ProviderLogoChip({
	id,
}: {
	id: string;
}) {
	return (
		<span className="grid h-7 w-7 place-items-center">
			<span className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200/80 bg-white transition-colors group-hover:border-zinc-300 group-hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:group-hover:border-zinc-600 dark:group-hover:bg-zinc-900">
				<span className="relative h-4 w-4">
					<Logo id={id} variant="color" fill sizes="16px" className="object-contain object-center" />
				</span>
			</span>
		</span>
	);
}

export default function ExploreModelsProviderTicker() {
	const [providerIndex, setProviderIndex] = useState(0);
	const [nextProviderIndex, setNextProviderIndex] = useState<number | null>(null);
	const [isSliding, setIsSliding] = useState(false);

	const current = EXPLORE_PROVIDERS[providerIndex] ?? EXPLORE_PROVIDERS[0];
	const incoming =
		EXPLORE_PROVIDERS[nextProviderIndex ?? providerIndex] ??
		EXPLORE_PROVIDERS[0];

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNextProviderIndex((providerIndex + 1) % EXPLORE_PROVIDERS.length);
			setIsSliding(true);
		}, 2000);

		return () => {
			window.clearInterval(interval);
		};
	}, [providerIndex]);

	useEffect(() => {
		if (!isSliding || nextProviderIndex === null) return;

		const timeout = window.setTimeout(() => {
			setProviderIndex(nextProviderIndex);
			setNextProviderIndex(null);
			setIsSliding(false);
		}, 320);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [isSliding, nextProviderIndex]);

	return (
		<span
			className="relative inline-flex h-7 w-7 overflow-hidden align-middle"
			aria-label={`${current.label} provider`}
		>
			<span
				className={`absolute inset-0 ${isSliding ? "transition-transform duration-300 ease-out" : "transition-none"}`}
				style={{ transform: isSliding ? "translateY(-100%)" : "translateY(0%)" }}
				aria-hidden="true"
			>
				<ProviderLogoChip id={current.id} />
				<ProviderLogoChip id={incoming.id} />
			</span>
		</span>
	);
}
