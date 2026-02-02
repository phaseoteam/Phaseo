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
import { CopyButton } from "@/components/ui/copy-button";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";

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


// --- endpoint mapping (colour + icon) ----------------------------------------

const ENDPOINT_META: Record<
	string,
	{ label: string; icon: React.ElementType; className: string }
> = {
	"/chat/completions": {
		label: "Chat Completions",
		icon: MessageSquareText,
		className: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
	},
	"/responses": {
		label: "Responses",
		icon: MessageSquareText,
		className: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
	},
	"/messages": {
		label: "Messages",
		icon: MessageSquareText,
		className: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
	},
	"/images/generations": {
		label: "Image Generations",
		icon: ImageIcon,
		className: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
	},
	"/images/edits": {
		label: "Image Edits",
		icon: ImageIcon,
		className: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
	},
	"/images/variations": {
		label: "Image Variations",
		icon: ImageIcon,
		className: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
	},
	"/embeddings": {
		label: "Embeddings",
		icon: Braces,
		className: "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200",
	},
	"/audio/transcriptions": {
		label: "Audio Transcriptions",
		icon: AudioLines,
		className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	},
	"/audio/translations": {
		label: "Audio Translations",
		icon: AudioLines,
		className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	},
	"/audio/speech": {
		label: "Audio Speech",
		icon: AudioLines,
		className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	},
	"/audio/realtime": {
		label: "Audio Realtime",
		icon: AudioLines,
		className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	},
	"/video/generations": {
		label: "Video Generations",
		icon: Video,
		className: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200",
	},
	"/moderations": {
		label: "Moderations",
		icon: Eye,
		className: "bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-200",
	},
	"/batches": {
		label: "Batch",
		icon: Workflow,
		className: "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200",
	},
	"/music/generations": {
		label: "Music Generations",
		icon: AudioLines,
		className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
	},
};

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
		const resolved = list.flatMap((entry) => {
			const mapped = capabilityToEndpoints[entry];
			if (mapped && mapped.length > 0) return mapped;
			return [entry];
		});
		return Array.from(new Set(resolved));
	}, [model.endpoints]);

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
			{/* Gateway status - top right corner */}
			<div className="absolute top-4 right-4">
				<Tooltip>
					<TooltipTrigger asChild>
						<div
							className={cn(
								"inline-flex items-center justify-center rounded-full p-1.5 ring-1 ring-inset",
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
						</div>
					</TooltipTrigger>
					<TooltipContent>
						{model.is_active_gateway ? "Gateway: Active" : "Gateway: Inactive"}
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Model name */}
			<div className="pr-10">
				<h3 className="text-base sm:text-lg font-semibold leading-tight line-clamp-2">
					{model.model_name}
				</h3>
			</div>

			{/* Model ID + copy button - full width with truncation */}
			<div className="mt-1 flex items-center gap-2">
				<code className="font-mono text-sm text-neutral-500 truncate flex-1">
					{model.model_id}
				</code>
				<CopyButton
					content={model.model_id}
					variant="ghost"
					size="sm"
					className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
					onCopy={() => toast.success("Copied model ID")}
				/>
			</div>

			<Separator className="my-3" />

			{/* Compact info row */}
			<div className="flex items-center gap-4 text-xs">
				{/* Endpoints popover */}
				<HoverCard openDelay={200} closeDelay={100}>
					<HoverCardTrigger asChild>
						<button className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 transition-colors">
							<Link2 className="h-3.5 w-3.5" />
							<span className="font-medium">
								{endpoints.length === 1 ? "1 endpoint" : `${endpoints.length} endpoints`}
							</span>
						</button>
					</HoverCardTrigger>
					<HoverCardContent className="w-80">
						<div className="space-y-2">
							<div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
								Supported endpoints
							</div>
							<div className="flex flex-wrap gap-1.5">
								{endpoints.length > 0 ? (
									endpoints.map((ep) => (
										<EndpointPill key={ep} endpoint={ep} />
									))
								) : (
									<EndpointPill endpoint={null} />
								)}
							</div>
						</div>
					</HoverCardContent>
				</HoverCard>

				{/* Provider alias */}
				{model.provider_model_slug && (
					<HoverCard openDelay={300} closeDelay={100}>
						<HoverCardTrigger asChild>
							<button className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 transition-colors">
								<Bot className="h-3.5 w-3.5" />
								<span className="font-medium">Alias</span>
							</button>
						</HoverCardTrigger>
						<HoverCardContent className="w-80">
							<div className="space-y-2">
								<div className="text-sm font-medium">Provider alias</div>
								<div className="flex items-center gap-2">
									<code className="font-mono text-sm break-all flex-1">
										{model.provider_model_slug}
									</code>
									<CopyButton
										content={model.provider_model_slug || ""}
										variant="outline"
										size="sm"
										className="shrink-0"
										onCopy={() => toast.success("Copied provider alias")}
									/>
								</div>
								<p className="text-xs text-neutral-500">
									This is what the provider calls this model. Use it when
									calling their native API.
								</p>
							</div>
						</HoverCardContent>
					</HoverCard>
				)}
			</div>

			<Separator className="my-3" />

			{/* Capabilities: full-width 2-column grid */}
			<div className="grid grid-cols-2 gap-4">
				{/* Input modalities */}
				<div className="space-y-2">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
						Input
					</span>
					<div className="flex flex-wrap gap-1.5">
						{availableInputsOrdered.map((mod) => {
							const Icon = MOD_ICON[mod] ?? Bot;
							const colorClass = MOD_BADGE_CLASS[mod] ?? "bg-neutral-50 text-neutral-700 ring-neutral-200";
							return (
								<Tooltip key={`in-${mod}`}>
									<TooltipTrigger asChild>
										<div
											className={cn(
												"inline-flex items-center justify-center rounded-md p-1.5 ring-1 ring-inset transition-transform hover:scale-110 cursor-help",
												colorClass
											)}
										>
											<Icon className="h-3.5 w-3.5" />
										</div>
									</TooltipTrigger>
									<TooltipContent side="top">
										<span className="capitalize">{mod}</span>
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				</div>

				{/* Output modalities */}
				<div className="space-y-2">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
						Output
					</span>
					<div className="flex flex-wrap gap-1.5">
						{availableOutputsOrdered.map((mod) => {
							const Icon = MOD_ICON[mod] ?? Bot;
							const colorClass = MOD_BADGE_CLASS[mod] ?? "bg-neutral-50 text-neutral-700 ring-neutral-200";
							return (
								<Tooltip key={`out-${mod}`}>
									<TooltipTrigger asChild>
										<div
											className={cn(
												"inline-flex items-center justify-center rounded-md p-1.5 ring-1 ring-inset transition-transform hover:scale-110 cursor-help",
												colorClass
											)}
										>
											<Icon className="h-3.5 w-3.5" />
										</div>
									</TooltipTrigger>
									<TooltipContent side="top">
										<span className="capitalize">{mod}</span>
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
