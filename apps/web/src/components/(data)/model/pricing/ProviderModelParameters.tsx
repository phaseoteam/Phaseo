"use client";

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ProviderModel } from "@/lib/fetchers/models/getModelPricing";
import {
	AudioLines,
	Braces,
	Dices,
	Image as ImageIcon,
	Settings2,
	Sliders,
	Shield,
	SlidersHorizontal,
	Wrench,
} from "lucide-react";

const META_KEYS = new Set([
	"type",
	"description",
	"default",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minLength",
	"maxLength",
	"pattern",
	"format",
	"title",
	"examples",
	"enum",
	"required",
	"nullable",
	"items",
	"properties",
	"additionalProperties",
	"oneOf",
	"anyOf",
	"allOf",
	"$defs",
	"$schema",
	"const",
]);

function normalizeParamName(name: string): string {
	return name.trim().replace(/\s+/g, "_");
}

function prettifyParamName(name: string): string {
	return name
		.replace(/[._-]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function extractSupportedParameterNames(params: unknown): string[] {
	const found = new Set<string>();

	const walk = (value: unknown, depth = 0) => {
		if (depth > 4 || value == null) return;

		if (Array.isArray(value)) {
			for (const item of value) {
				if (typeof item === "string") {
					const normalized = normalizeParamName(item);
					if (normalized && !META_KEYS.has(normalized.toLowerCase())) {
						found.add(normalized);
					}
					continue;
				}
				walk(item, depth + 1);
			}
			return;
		}

		if (typeof value !== "object") return;

		for (const [rawKey, rawValue] of Object.entries(
			value as Record<string, unknown>
		)) {
			const key = normalizeParamName(rawKey);
			const lower = key.toLowerCase();
			if (!META_KEYS.has(lower) && !key.startsWith("$")) {
				found.add(key);
			}
			walk(rawValue, depth + 1);
		}
	};

	walk(params);
	return Array.from(found).sort((a, b) => a.localeCompare(b));
}

function iconForParamName(name: string) {
	const n = name.toLowerCase();
	if (
		n.includes("temperature") ||
		n.includes("top_p") ||
		n.includes("topk") ||
		n.includes("top_k") ||
		n.includes("penalty")
	) {
		return SlidersHorizontal;
	}
	if (
		n.includes("tool") ||
		n.includes("function_call") ||
		n.includes("parallel_tool")
	) {
		return Wrench;
	}
	if (
		n.includes("response_format") ||
		n.includes("json") ||
		n.includes("schema") ||
		n.includes("structured")
	) {
		return Braces;
	}
	if (n.includes("seed")) return Dices;
	if (
		n.includes("image") ||
		n.includes("size") ||
		n.includes("quality") ||
		n.includes("style")
	) {
		return ImageIcon;
	}
	if (
		n.includes("audio") ||
		n.includes("voice") ||
		n.includes("speech") ||
		n.includes("sample_rate")
	) {
		return AudioLines;
	}
	if (n.includes("safe") || n.includes("moderation")) return Shield;
	return Settings2;
}

type Combo = {
	id: string;
	title: string;
	parameters: string[];
};

function buildSupportedParameters(models: ProviderModel[]): string[] {
	const params = new Set<string>();

	for (const model of models) {
		for (const param of extractSupportedParameterNames(model.params)) {
			params.add(param);
		}
	}

	return Array.from(params).sort((a, b) => a.localeCompare(b));
}

export default function ProviderModelParameters({
	models = [],
}: {
	models?: ProviderModel[];
}) {
	const parameters = buildSupportedParameters(models);
	if (!parameters.length) return null;

	return (
		<HoverCard openDelay={150} closeDelay={120}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label="Supported parameters"
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:border-slate-300 hover:text-foreground dark:hover:border-slate-700"
				>
					<Sliders className="h-3.5 w-3.5" />
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80 p-3 text-xs">
				<div className="space-y-2">
					<p className="text-muted-foreground">Supported parameters</p>
					<div className="max-h-72 overflow-auto pr-1">
						<div className="flex flex-wrap gap-1.5">
							{parameters.map((param) => {
								const ParamIcon = iconForParamName(param);
								return (
									<Badge key={param} variant="outline" className="gap-1 text-[10px]">
										<ParamIcon className="h-3 w-3" />
										{prettifyParamName(param)}
									</Badge>
								);
							})}
						</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
