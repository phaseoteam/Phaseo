// components/providers/APIModelCard.tsx
"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
	HoverCard,
	HoverCardTrigger,
	HoverCardContent,
} from "@/components/ui/hover-card";
import { toast } from "sonner";
import {
	CheckCircle2,
	Circle,
	Copy,
	Image as ImageIcon,
	MessageSquareText,
	AudioLines,
	Video,
	Workflow,
	Braces,
	Eye,
	Bot,
	Link2,
} from "lucide-react";
import type { APIProviderModels } from "@/lib/fetchers/api-providers/getAPIProvider";

// --- modality utils ----------------------------------------------------------

const MOD_ICON: Record<string, React.ElementType> = {
	text: MessageSquareText,
	image: ImageIcon,
	audio: AudioLines,
	video: Video,
	tool: Workflow, // "tool use" / function calling
	embeddings: Braces,
	vision: Eye,
};

const MOD_BADGE_CLASS: Record<string, string> = {
	text: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
	image: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
	audio: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	video: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200",
	tool: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
	embeddings: "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200",
	vision: "bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-200",
};

const KNOWN_MODALITIES = ["text", "image", "audio", "video", "embeddings"];

function toList(v?: string[] | string | null) {
	if (!v) return [] as string[];
	if (Array.isArray(v)) return v.map((s) => String(s).toLowerCase());
	return String(v)
		.split(/[,\s]+/)
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

function ModBadge({ name, disabled }: { name: string; disabled?: boolean }) {
	const Icon = MOD_ICON[name] ?? Bot;
	const base =
		MOD_BADGE_CLASS[name] ??
		"bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200";
	const disabledClass = disabled
		? "bg-transparent text-neutral-300 ring-0"
		: "";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
				base,
				disabledClass
			)}
		>
			<Icon
				className={cn("h-3.5 w-3.5", disabled ? "text-neutral-300" : "")}
			/>
			{capitalize(name)}
		</span>
	);
}

function capitalize(s: string) {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- endpoint mapping (colour + icon) ----------------------------------------

const ENDPOINT_META: Record<
	string,
	{ label: string; icon: React.ElementType; className: string }
> = {
	"chat.completions": {
		label: "Chat Completions",
		icon: MessageSquareText,
		className: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
	},
	"image.generations": {
		label: "Image Generations",
		icon: ImageIcon,
		className: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
	},
	embeddings: {
		label: "Embeddings",
		icon: Braces,
		className: "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200",
	},
	"audio.speech": {
		label: "Audio Speech",
		icon: AudioLines,
		className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	},
	"video.generations": {
		label: "Video Generations",
		icon: Video,
		className: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200",
	},
};

const ENDPOINT_INLINE_LIMIT = 2;

function getEndpointMeta(endpoint?: string | null): {
	label: string;
	icon: React.ElementType;
	className: string;
} {
	if (!endpoint) {
		return {
			label: "Endpoint",
			icon: Link2,
			className: "bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200",
		};
	}
	const m = ENDPOINT_META[endpoint];
	if (m) return m;
	return {
		label: endpoint,
		icon: Link2,
		className: "bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200",
	};
}

function EndpointPill({ endpoint }: { endpoint?: string | null }) {
	const meta = getEndpointMeta(endpoint);
	const Icon = meta.icon;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
				meta.className
			)}
		>
			<Icon className="h-3.5 w-3.5" />
			{meta.label}
		</span>
	);
}

// --- copy helpers ------------------------------------------------------------

async function copy(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

// --- main card ---------------------------------------------------------------

export default function APIModelCard({ model }: { model: APIProviderModels }) {
	const inputs = useMemo(
		() => toList(model.input_modalities),
		[model.input_modalities]
	);
	const outputs = useMemo(
		() => toList(model.output_modalities),
		[model.output_modalities]
	);
	const endpoints = useMemo(() => {
		const list = (model.endpoints ?? []).filter(Boolean) as string[];
		return Array.from(new Set(list));
	}, [model.endpoints]);
	const inlineEndpoints = endpoints.slice(0, ENDPOINT_INLINE_LIMIT);
	const overflowEndpoints = endpoints.slice(ENDPOINT_INLINE_LIMIT);

	// Only show modalities that are actually available on the model.
	// Preserve the order defined in KNOWN_MODALITIES, then append any
	// unknown modalities present on the model in their original order.
	const availableInputsOrdered = useMemo(() => {
		const known = KNOWN_MODALITIES.filter((m) => inputs.includes(m));
		const extras = inputs.filter((m) => !KNOWN_MODALITIES.includes(m));
		return [...known, ...extras];
	}, [inputs]);

	const availableOutputsOrdered = useMemo(() => {
		const known = KNOWN_MODALITIES.filter((m) => outputs.includes(m));
		const extras = outputs.filter((m) => !KNOWN_MODALITIES.includes(m));
		return [...known, ...extras];
	}, [outputs]);

	return (
		<div className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<h3 className="text-base sm:text-lg font-semibold leading-tight line-clamp-2 sm:line-clamp-1 break-words">
						{model.model_name}
					</h3>

					{/* model id + copy */}
					<div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
						<code className="font-mono break-all">{model.model_id}</code>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 opacity-0 transition group-hover:opacity-100"
									onClick={async () => {
										const ok = await copy(model.model_id);
										toast(ok ? "Copied model ID" : "Copy failed");
									}}
									aria-label="Copy model id"
								>
									<Copy className="h-3.5 w-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy model ID</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
						model.is_active_gateway
							? "bg-emerald-50 text-emerald-700 ring-emerald-200"
							: "bg-neutral-50 text-neutral-600 ring-neutral-200"
					)}
				>
					{model.is_active_gateway ? (
						<CheckCircle2 className="h-3.5 w-3.5" />
					) : (
						<Circle className="h-3.5 w-3.5" />
					)}
					{model.is_active_gateway
						? "Gateway: Active"
						: "Gateway: Inactive"}
				</span>
			</div>

			<Separator className="my-3" />

			<div className="pl-2 space-y-2">
				<div className="grid gap-2 sm:grid-cols-[auto,1fr] sm:items-center">
					<div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
						Endpoints
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{inlineEndpoints.length > 0 ? (
							inlineEndpoints.map((ep) => (
								<EndpointPill key={ep} endpoint={ep} />
							))
						) : (
							<EndpointPill endpoint={null} />
						)}
						{overflowEndpoints.length > 0 && (
							<HoverCard openDelay={300} closeDelay={80}>
								<HoverCardTrigger asChild>
									<span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
										+{overflowEndpoints.length} more
									</span>
								</HoverCardTrigger>
								<HoverCardContent className="w-72">
									<div className="space-y-2">
										<div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
											All endpoints
										</div>
										<div className="flex flex-wrap gap-1.5">
											{endpoints.map((ep) => (
												<EndpointPill key={`all-${ep}`} endpoint={ep} />
											))}
										</div>
									</div>
								</HoverCardContent>
							</HoverCard>
						)}
					</div>
				</div>

				{model.provider_model_slug && (
					<div className="grid gap-2 sm:grid-cols-[auto,1fr] sm:items-center">
						<div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
							Provider alias
						</div>
						<div>
							<HoverCard openDelay={800} closeDelay={80}>
								<HoverCardTrigger asChild>
									<Badge
										variant="secondary"
										className={cn(
											"cursor-help select-none flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
											"bg-gradient-to-b from-neutral-50 to-white text-neutral-800 ring-1 ring-inset ring-neutral-200 shadow-sm transition-transform hover:scale-105 hover:shadow-md"
										)}
										aria-label="Provider alias"
									>
										<span className="inline-flex items-center justify-center rounded-full bg-neutral-100 p-0.5">
											<Bot className="h-3 w-3 text-neutral-700" />
										</span>
										<span className="tracking-wide">AKA</span>
									</Badge>
								</HoverCardTrigger>
								<HoverCardContent className="w-80">
									<div className="space-y-2">
										<div className="text-sm font-medium">Provider alias</div>
										<div className="flex items-center justify-between gap-2">
											<code className="font-mono text-sm break-all">
												{model.provider_model_slug}
											</code>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="outline"
														size="icon"
														className="h-7 w-7 shrink-0"
														onClick={async () => {
															const ok = await copy(
																model.provider_model_slug || ""
															);
															toast(
																ok
																	? "Copied provider alias"
																	: "Copy failed"
															);
														}}
														aria-label="Copy provider alias"
													>
														<Copy className="h-3.5 w-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Copy alias</TooltipContent>
											</Tooltip>
										</div>
										<p className="text-xs text-neutral-500">
											This is what the provider calls this model. Use it when
											calling their native API.
										</p>
									</div>
								</HoverCardContent>
							</HoverCard>
						</div>
					</div>
				)}
			</div>

			<Separator className="my-3" />

			{/* capabilities: show headings with arrow, then badges in a 2x2 grid that spans full width */}
			<div className="pl-2 w-full">
				<div className="mt-2 w-full">
					{/* Headings aligned to columns */}
					<div className="grid grid-cols-2 gap-2 text-[11px] font-semibold tracking-wide text-neutral-500">
						<div>INPUT</div>
						<div className="text-neutral-500">OUTPUT</div>
					</div>

					{/* Full-width two-column layout: show all input badges in left column and all output badges in right column. */}
					<div className="mt-2 grid grid-cols-2 gap-2 w-full">
						<div className="flex flex-wrap items-start gap-1.5">
							{availableInputsOrdered.map((mod) => (
								<ModBadge key={`in-${mod}`} name={mod} />
							))}
						</div>

						<div className="flex flex-wrap items-start gap-1.5">
							{availableOutputsOrdered.map((mod) => (
								<ModBadge key={`out-${mod}`} name={mod} />
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
