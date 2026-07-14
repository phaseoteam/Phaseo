"use client";

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	Clock3,
	Code2,
	Layers3,
	MessageCircleDashed,
	Sparkles,
	type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import type { ModelOption } from "@/components/(chat)/playground/chat-playground-core";

type StarterCollection = {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	models: ModelOption[];
};

type PreferredModelSpec = {
	id: string;
	matches: Array<(model: ModelOption) => boolean>;
};

type ChatMessagesEmptyStateProps = {
	modelOptions: ModelOption[];
	selectedModelIds: string[];
	onAddModelSet: (modelIds: string[]) => void;
	temporaryMode?: boolean;
};

function findFirstModel(
	models: ModelOption[],
	matches: Array<(model: ModelOption) => boolean>,
	excludedIds = new Set<string>(),
) {
	for (const match of matches) {
		const model = models.find(
			(option) => !excludedIds.has(option.modelId) && match(option),
		);
		if (model) return model;
	}
	return null;
}

function findPreferredModels(
	models: ModelOption[],
	preferredModels: PreferredModelSpec[],
) {
	const selected: ModelOption[] = [];
	const selectedIds = new Set<string>();

	for (const preferredModel of preferredModels) {
		const model = findFirstModel(
			models,
			preferredModel.matches,
			selectedIds,
		);
		if (!model) continue;
		selected.push(model);
		selectedIds.add(model.modelId);
	}

	return selected;
}

function getSearchText(model: ModelOption) {
	return `${model.modelId} ${model.label} ${model.orgName}`.toLowerCase();
}

function buildStarterCollections(models: ModelOption[]) {
	const activeModels = models.filter(
		(model) => model.gatewayStatus === "active",
	);
	const collections: StarterCollection[] = [];
	const frontierModels = findPreferredModels(activeModels, [
		{
			id: "openai-gpt-5.5",
			matches: [
				(model) => model.modelId === "openai/gpt-5.5",
				(model) => getSearchText(model).includes("gpt-5.5"),
				(model) => getSearchText(model).includes("gpt 5.5"),
			],
		},
		{
			id: "google-gemini-3.1-pro",
			matches: [
				(model) => model.modelId === "google/gemini-3.1-pro-preview",
				(model) =>
					getSearchText(model).includes("gemini-3.1-pro") &&
					!getSearchText(model).includes("customtools"),
				(model) =>
					getSearchText(model).includes("gemini 3.1 pro") &&
					!getSearchText(model).includes("customtools"),
			],
		},
		{
			id: "anthropic-claude-opus-4.8",
			matches: [
				(model) => model.modelId === "anthropic/claude-opus-4.8",
				(model) => getSearchText(model).includes("claude opus 4.8"),
				(model) => getSearchText(model).includes("claude-opus-4.8"),
			],
		},
		{
			id: "spacex-ai-grok-4.3",
			matches: [
				(model) => model.modelId === "spacex-ai/grok-4.3",
				(model) => getSearchText(model).includes("grok 4.3"),
				(model) => getSearchText(model).includes("grok-4.3"),
			],
		},
	]);

	if (frontierModels.length >= 2) {
		collections.push({
			id: "frontier",
			label: "Frontier Models",
			description: "High-end reasoning and general chat quality.",
			icon: Layers3,
			models: frontierModels,
		});
	}

	const openSourceModels = findPreferredModels(activeModels, [
		{
			id: "deepseek-v4-pro",
			matches: [
				(model) => model.modelId === "deepseek/deepseek-v4-pro",
				(model) =>
					getSearchText(model).includes("deepseek v4 pro") &&
					!getSearchText(model).includes("lightning"),
				(model) =>
					getSearchText(model).includes("deepseek-v4-pro") &&
					!getSearchText(model).includes("lightning"),
			],
		},
		{
			id: "minimax-m3",
			matches: [
				(model) => model.modelId === "minimax/minimax-m3",
				(model) => getSearchText(model).includes("minimax m3"),
				(model) => getSearchText(model).includes("minimax-m3"),
			],
		},
		{
			id: "z-ai-glm-5.2",
			matches: [
				(model) => model.modelId === "z-ai/glm-5.2",
				(model) => getSearchText(model).includes("glm 5.2"),
				(model) => getSearchText(model).includes("glm-5.2"),
			],
		},
		{
			id: "moonshot-kimi-k2.7-code",
			matches: [
				(model) => model.modelId === "moonshotai/kimi-k2.7-code",
				(model) => getSearchText(model).includes("kimi k2.7 code"),
				(model) => getSearchText(model).includes("kimi-k2.7-code"),
			],
		},
	]);
	if (openSourceModels.length >= 2) {
		collections.push({
			id: "open-source",
			label: "Best Open Source",
			description: "Strong open-weight models for comparison.",
			icon: Code2,
			models: openSourceModels,
		});
	}

	const bigReleaseModels = findPreferredModels(activeModels, [
		{
			id: "z-ai-glm-5.2",
			matches: [
				(model) => model.modelId === "z-ai/glm-5.2",
				(model) => getSearchText(model).includes("glm 5.2"),
				(model) => getSearchText(model).includes("glm-5.2"),
			],
		},
		{
			id: "moonshot-kimi-k2.7-code",
			matches: [
				(model) => model.modelId === "moonshotai/kimi-k2.7-code",
				(model) => getSearchText(model).includes("kimi k2.7 code"),
				(model) => getSearchText(model).includes("kimi-k2.7-code"),
			],
		},
		{
			id: "minimax-m3",
			matches: [
				(model) => model.modelId === "minimax/minimax-m3",
				(model) => getSearchText(model).includes("minimax m3"),
				(model) => getSearchText(model).includes("minimax-m3"),
			],
		},
		{
			id: "qwen-3.7-plus",
			matches: [
				(model) => model.modelId === "qwen/qwen3.7-plus",
				(model) => getSearchText(model).includes("qwen 3.7 plus"),
				(model) => getSearchText(model).includes("qwen3.7-plus"),
				(model) => getSearchText(model).includes("qwen-3.7-plus"),
			],
		},
	]);
	if (bigReleaseModels.length >= 2) {
		collections.push({
			id: "big-releases",
			label: "Big Releases",
			description: "Recent headline models worth comparing.",
			icon: Clock3,
			models: bigReleaseModels,
		});
	}

	return collections.slice(0, 3);
}

export function ChatMessagesEmptyState({
	modelOptions,
	selectedModelIds,
	onAddModelSet,
	temporaryMode = false,
}: ChatMessagesEmptyStateProps) {
	const selectedModelIdSet = useMemo(
		() => new Set(selectedModelIds),
		[selectedModelIds],
	);
	const collections = useMemo(
		() => buildStarterCollections(modelOptions),
		[modelOptions],
	);
	const reduceMotion = useReducedMotion();
	const addCollection = (collection: StarterCollection) => {
		onAddModelSet(
			collection.models
				.map((model) => model.modelId)
				.filter((modelId) => !selectedModelIdSet.has(modelId)),
		);
	};

	if (selectedModelIds.length > 0) {
		const ReadyIcon = temporaryMode ? MessageCircleDashed : Sparkles;
		return (
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center px-3 py-2 sm:px-6 sm:py-8 2xl:max-w-5xl">
				<section className="mx-auto grid max-w-xl justify-items-center gap-2 text-center">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
						<ReadyIcon className="h-4 w-4" />
					</div>
					<div className="grid gap-1">
						<p className="text-base font-semibold tracking-tight sm:text-lg 2xl:text-xl">
							{temporaryMode ? "Temporary chat" : "Models are ready"}
						</p>
						<p className="text-sm leading-6 text-muted-foreground 2xl:text-[15px]">
							{temporaryMode
								? "This chat will not appear in history. Send a prompt when you are ready; your selected models and local settings stay available for this session."
								: "Send one prompt and compare every answer in this chat."}
						</p>
					</div>
				</section>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center px-3 py-2 sm:px-6 sm:py-8 2xl:max-w-5xl">
			<section className="grid gap-2 sm:gap-3">
				<AnimatePresence initial={false} mode="popLayout">
					<motion.div
						key={temporaryMode ? "temporary-copy" : "model-set-copy"}
						className={cn(
							"mx-auto max-w-xl text-center",
							temporaryMode ? "block" : "hidden xl:block",
						)}
						initial={
							reduceMotion
								? false
								: {
										opacity: 0,
										y: temporaryMode ? 14 : -14,
										filter: "blur(4px)",
									}
						}
						animate={
							reduceMotion
								? { opacity: 1 }
								: { opacity: 1, y: 0, filter: "blur(0px)" }
						}
						exit={
							reduceMotion
								? { opacity: 0 }
								: {
										opacity: 0,
										y: temporaryMode ? 14 : -14,
										filter: "blur(4px)",
									}
						}
						transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
					>
						<p className="text-xl font-semibold tracking-tight 2xl:text-2xl">
							{temporaryMode ? "Temporary Chat" : "Start With a Model Set"}
						</p>
						<p className="mt-1 text-sm leading-6 text-muted-foreground 2xl:text-[15px]">
							{temporaryMode
								? "Pick a model set for this session. It will not appear in history."
								: "Pick a focused group, then ask once and compare the answers."}
						</p>
					</motion.div>
				</AnimatePresence>
				<div className="mx-auto grid w-full max-w-lg gap-2 md:max-w-2xl md:grid-cols-2 md:items-stretch xl:max-w-none xl:grid-cols-3">
					{collections.map((collection) => {
						const Icon = collection.icon;
						const addedCount = collection.models.filter((model) =>
							selectedModelIdSet.has(model.modelId),
						).length;
						const allAdded = addedCount === collection.models.length;

						return (
							<button
								key={collection.id}
								type="button"
								onClick={() => addCollection(collection)}
								disabled={allAdded}
								aria-label={
									allAdded
										? `${collection.label} already added`
										: `Use ${collection.label}`
								}
								className={cn(
									"group h-full rounded-xl border border-border bg-card p-2 text-left shadow-sm transition sm:p-3 2xl:p-3.5",
									"hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									allAdded &&
										"cursor-default border-foreground/20 bg-muted/20 hover:border-foreground/20 hover:bg-muted/20",
								)}
							>
								<div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[2rem_minmax(0,1fr)]">
									<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:text-foreground sm:h-8 sm:w-8 2xl:h-9 2xl:w-9">
										<Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 2xl:h-[18px] 2xl:w-[18px]" />
									</div>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium leading-5 text-foreground 2xl:text-[15px]">
											{collection.label}
										</p>
									</div>
								</div>
								<p className="mt-2 hidden min-h-10 text-xs leading-5 text-muted-foreground xl:line-clamp-2 xl:block 2xl:text-[13px]">
									{collection.description}
								</p>
								<div className="mt-1.5 grid gap-1 sm:mt-2 sm:grid-cols-2 sm:gap-1.5 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-1">
									{collection.models.map((model) => {
										const selected = selectedModelIdSet.has(model.modelId);
										return (
											<span
												key={model.modelId}
												className={cn(
													"inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs leading-5",
													"py-0.5 sm:py-1",
													"2xl:text-[13px]",
													selected
														? "border-foreground/15 bg-muted text-foreground"
														: "border-border bg-muted/40 text-muted-foreground",
												)}
											>
												<Logo
													id={model.orgId}
													alt=""
													width={14}
													height={14}
													className="h-3.5 w-3.5 shrink-0 rounded-none"
												/>
												<span className="truncate">{model.label}</span>
											</span>
										);
									})}
								</div>
							</button>
						);
					})}
					{collections.length === 0 ? (
						<div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground sm:col-span-3">
							Model sets will appear once the model cache has loaded.
						</div>
					) : null}
				</div>
			</section>
		</div>
	);
}
