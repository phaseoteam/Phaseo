"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const MODEL_NAV_PROVIDERS = [
	{ id: "openai", label: "OpenAI" },
	{ id: "anthropic", label: "Anthropic" },
	{ id: "google", label: "Google" },
	{ id: "xai", label: "xAI" },
	{ id: "mistral", label: "Mistral" },
	{ id: "deepseek", label: "DeepSeek" },
	{ id: "zai", label: "Z-AI" },
] as const;

function ModelLogo({ id }: { id: string }) {
	return (
		<span className="grid h-4 w-4 place-items-center">
			<span className="relative h-4 w-4">
				<Logo
					id={id}
					alt=""
					variant="color"
					fill
					sizes="16px"
					className="object-contain object-center"
				/>
			</span>
		</span>
	);
}

export function ChatSidebarModelsIcon({ className }: { className?: string }) {
	const [providerIndex, setProviderIndex] = useState(0);
	const [nextProviderIndex, setNextProviderIndex] = useState<number | null>(
		null,
	);
	const [isSliding, setIsSliding] = useState(false);

	const current =
		MODEL_NAV_PROVIDERS[providerIndex] ?? MODEL_NAV_PROVIDERS[0];
	const incoming =
		MODEL_NAV_PROVIDERS[nextProviderIndex ?? providerIndex] ??
		MODEL_NAV_PROVIDERS[0];

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNextProviderIndex((providerIndex + 1) % MODEL_NAV_PROVIDERS.length);
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
			className={cn(
				"relative inline-flex h-4 w-4 shrink-0 overflow-hidden align-middle",
				className,
			)}
			aria-label={`${current.label} model provider`}
		>
			<span
				className={
					isSliding
						? "absolute inset-0 transition-transform duration-300 ease-out"
						: "absolute inset-0 transition-none"
				}
				style={{
					transform: isSliding ? "translateY(-100%)" : "translateY(0%)",
				}}
			>
				<ModelLogo id={current.id} />
				<ModelLogo id={incoming.id} />
			</span>
		</span>
	);
}
