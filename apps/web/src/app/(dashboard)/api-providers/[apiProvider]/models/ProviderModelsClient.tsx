"use client";

import { useMemo, useRef, useState } from "react";
import {
	AudioLines,
	Braces,
	FilePlus,
	Image as ImageIcon,
	MessageSquareText,
	Settings2,
	Video,
	Check,
	X,
} from "lucide-react";
import Link from "next/link";
import { debounce, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { APIProviderModelListItem } from "@/lib/fetchers/api-providers/getAPIProvider";

type ProviderModelsClientProps = {
	apiProvider: string;
	providerLabel: string;
	models: APIProviderModelListItem[];
};

type IconMeta = {
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
};

function listify(value?: string[] | string | null): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function formatUsd(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (value >= 100) return `$${value.toFixed(0)}`;
	if (value >= 10) return `$${value.toFixed(2)}`;
	return `$${value.toFixed(4).replace(/\.?0+$/, "")}`;
}

function normalizeCapabilityKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function formatCapabilityLabel(value: string): string {
	const acronymMap: Record<string, string> = {
		api: "API",
		id: "ID",
		url: "URL",
		json: "JSON",
		xml: "XML",
		cpu: "CPU",
		gpu: "GPU",
	};

	return normalizeCapabilityKey(value)
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((part) => {
			if (acronymMap[part]) return acronymMap[part];
			if (part.length === 1) return part.toUpperCase();
			return part[0].toUpperCase() + part.slice(1);
		})
		.join(" ");
}

const MODALITY_ICONS: Record<string, IconMeta> = {
	text: { id: "text", label: "Text", icon: MessageSquareText },
	image: { id: "image", label: "Image", icon: ImageIcon },
	audio: { id: "audio", label: "Audio", icon: AudioLines },
	video: { id: "video", label: "Video", icon: Video },
	embeddings: { id: "embeddings", label: "Embeddings", icon: Braces },
};

function resolveModalityIcons(modalities: string[]): IconMeta[] {
	return Array.from(new Set(modalities.map((value) => normalizeCapabilityKey(value))))
		.map(
			(value) =>
				MODALITY_ICONS[value] ?? {
					id: `modality-${value}`,
					label: formatCapabilityLabel(value),
					icon: Settings2,
				},
		)
		.sort((a, b) => a.label.localeCompare(b.label));
}

type ParamLabel = {
	id: string;
	label: string;
};

function resolveSupportedParamLabels(params: string[]): ParamLabel[] {
	return Array.from(
		new Set(params.map((value) => normalizeCapabilityKey(value)).filter(Boolean)),
	)
		.map((key) => ({
			id: key,
			label: formatCapabilityLabel(key),
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

export default function ProviderModelsClient({
	apiProvider,
	providerLabel,
	models,
}: ProviderModelsClientProps) {
	const [searchQuery, setSearchQuery] = useQueryState("q", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});
	const [selectedParams, setSelectedParams] = useQueryState("params", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",").map(normalizeCapabilityKey) : []),
		serialize: (value) => value.join(","),
	});

	const [paramPickerValue, setParamPickerValue] = useState<string>("");
	const [isParamSelectOpen, setIsParamSelectOpen] = useState(false);
	const keepParamSelectOpenRef = useRef(false);

	const parameterOptions = useMemo(() => {
		const map = new Map<string, string>();
		models.forEach((model) => {
			resolveSupportedParamLabels(listify(model.supported_params)).forEach((item) => {
				if (!map.has(item.id)) map.set(item.id, item.label);
			});
		});
		return Array.from(map.entries())
			.map(([id, label]) => ({ id, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [models]);

	const parameterLabelMap = useMemo(
		() => new Map(parameterOptions.map((option) => [option.id, option.label])),
		[parameterOptions],
	);
	const selectedParamLabels = useMemo(
		() =>
			selectedParams.map(
				(param) => parameterLabelMap.get(param) ?? formatCapabilityLabel(param),
			),
		[selectedParams, parameterLabelMap],
	);
	const selectedParamsSummary = useMemo(() => {
		if (selectedParamLabels.length === 0) return "Filter Parameters";
		if (selectedParamLabels.length === 1) return selectedParamLabels[0];
		return `${selectedParamLabels.length} Selected Parameters`;
	}, [selectedParamLabels]);

	const filteredModels = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return models.filter((model) => {
			if (q) {
				const haystack =
					`${model.model_name ?? ""} ${model.api_model_id} ${model.model_id}`.toLowerCase();
				if (!haystack.includes(q)) return false;
			}

			if (selectedParams.length > 0) {
				const modelParams = new Set(
					listify(model.supported_params).map(normalizeCapabilityKey),
				);
				const supportsAllSelected = selectedParams.every((param) =>
					modelParams.has(param),
				);
				if (!supportsAllSelected) return false;
			}

			return true;
		});
	}, [models, searchQuery, selectedParams]);

	const clearHref = `/api-providers/${apiProvider}/models`;

	function toggleParam(param: string) {
		if (selectedParams.includes(param)) {
			void setSelectedParams(selectedParams.filter((item) => item !== param));
		} else {
			void setSelectedParams([...selectedParams, param]);
		}
	}

	function clearFilters() {
		void setSearchQuery("");
		void setSelectedParams([]);
		setParamPickerValue("");
	}

	function clearParameterFilters() {
		void setSelectedParams([]);
		setParamPickerValue("");
	}

	return (
		<>
			<div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
				<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:justify-self-start">
					<div className="w-full sm:w-64 md:w-72">
						<Select
							open={isParamSelectOpen}
							onOpenChange={(nextOpen) => {
								if (!nextOpen && keepParamSelectOpenRef.current) return;
								setIsParamSelectOpen(nextOpen);
							}}
							value={paramPickerValue}
							onValueChange={(value) => {
								keepParamSelectOpenRef.current = true;
								toggleParam(value);
								setParamPickerValue("");
								queueMicrotask(() => {
									setIsParamSelectOpen(true);
									keepParamSelectOpenRef.current = false;
								});
							}}
						>
							<SelectTrigger className="h-9 [&>span]:max-w-[calc(100%-1.5rem)] [&>span]:truncate">
								<SelectValue placeholder={selectedParamsSummary} />
							</SelectTrigger>
							<SelectContent>
								{parameterOptions.map((option) => (
									<SelectItem
										key={option.id}
										value={option.id}
										className="[&>span:first-child]:hidden"
									>
										<span className="pr-6">{option.label}</span>
										<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
											<Check
												className={`h-4 w-4 text-muted-foreground ${selectedParams.includes(option.id) ? "opacity-100" : "opacity-0"}`}
											/>
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedParams.length > 0 ? (
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 shrink-0"
							onClick={clearParameterFilters}
							aria-label="Clear selected parameter filters"
						>
							<X className="h-4 w-4" />
						</Button>
					) : null}
					{searchQuery.length > 0 ? (
						<Button variant="ghost" size="sm" onClick={clearFilters}>
							Clear
						</Button>
					) : null}
				</div>

				<div className="w-full md:w-72 md:justify-self-center">
					<Input
						value={searchQuery}
						onChange={(event) =>
							setSearchQuery(event.target.value || "", {
								limitUrlUpdates: debounce(200),
							})
						}
						placeholder="Search models"
						className="h-9"
						aria-label="Search models"
					/>
				</div>

				<div className="text-sm text-muted-foreground md:justify-self-end md:text-right">
					{filteredModels.length} models
				</div>
			</div>

			<div className="mt-4">
				{models.length === 0 ? (
					<Empty className="rounded-xl border p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FilePlus />
							</EmptyMedia>
							<EmptyTitle>No models found</EmptyTitle>
							<EmptyDescription>
								There are no gateway-accessible models for this provider yet.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<div className="flex gap-2">
								<Button asChild>
									<a href="/contribute">Contribute</a>
								</Button>
								<Button variant="outline" asChild>
									<a href="https://docs.ai-stats.phaseo.app">Learn more</a>
								</Button>
							</div>
						</EmptyContent>
					</Empty>
				) : filteredModels.length === 0 ? (
					<Empty className="rounded-xl border p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FilePlus />
							</EmptyMedia>
							<EmptyTitle>No matching models</EmptyTitle>
							<EmptyDescription>
								No models matched your search or selected parameters.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button asChild>
								<Link href={clearHref} onClick={clearFilters}>
									Clear filters
								</Link>
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<div className="divide-y divide-border">
						{filteredModels.map((model) => {
							const inputModalities = listify(model.input_modalities);
							const outputModalities = listify(model.output_modalities);
							const supportedParams = listify(model.supported_params).sort((a, b) =>
								a.localeCompare(b),
							);

							const inputModalityIcons = resolveModalityIcons(inputModalities);
							const outputModalityIcons = resolveModalityIcons(outputModalities);
							const paramLabels = resolveSupportedParamLabels(supportedParams);

							return (
								<div
									key={`${model.model_id}:${model.created_at ?? "na"}`}
									className="group/model-row grid gap-4 py-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.65fr)_minmax(0,1fr)]"
								>
									<div className="min-w-0 space-y-3">
										<div className="truncate text-base font-semibold">
											<Link
												href={`/models/${model.model_id}`}
												className="hover:text-primary"
											>
												<span className="relative underline decoration-transparent transition-colors duration-200 hover:decoration-current">
													{`${providerLabel}: ${model.model_name || model.model_id}`}
												</span>
											</Link>
										</div>

										<div className="flex min-w-0 items-center gap-2">
											<div className="break-all font-mono text-xs text-muted-foreground">
												{model.api_model_id}
											</div>
											<CopyButton
												content={model.api_model_id}
												variant="ghost"
												size="sm"
												className="shrink-0 opacity-0 transition-opacity duration-150 group-hover/model-row:opacity-100 group-focus-within/model-row:opacity-100"
												aria-label="Copy model ID"
											/>
										</div>

										<div className="space-y-2">
											<div className="text-xs tracking-wide text-muted-foreground/80">
												Modalities
											</div>
											<div className="grid gap-2 sm:grid-cols-2">
												<div className="min-w-0 space-y-1">
													<div className="text-xs tracking-wide text-muted-foreground/80">
														Input
													</div>
													<div className="flex flex-wrap items-center gap-1.5">
														{inputModalityIcons.length > 0 ? (
															inputModalityIcons.map((item) => {
																const Icon = item.icon;
																return (
																	<span
																		key={`${model.model_id}-mod-in-${item.id}`}
																		className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/25 px-2 text-muted-foreground"
																	>
																		<Icon className="h-4 w-4" />
																		<span className="text-xs leading-none">
																			{item.label}
																		</span>
																	</span>
																);
															})
														) : (
															<span className="text-xs text-muted-foreground">-</span>
														)}
													</div>
												</div>

												<div className="min-w-0 space-y-1">
													<div className="text-xs tracking-wide text-muted-foreground/80">
														Output
													</div>
													<div className="flex flex-wrap items-center gap-1.5">
														{outputModalityIcons.length > 0 ? (
															outputModalityIcons.map((item) => {
																const Icon = item.icon;
																return (
																	<span
																		key={`${model.model_id}-mod-out-${item.id}`}
																		className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/25 px-2 text-muted-foreground"
																	>
																		<Icon className="h-4 w-4" />
																		<span className="text-xs leading-none">
																			{item.label}
																		</span>
																	</span>
																);
															})
														) : (
															<span className="text-xs text-muted-foreground">-</span>
														)}
													</div>
												</div>
											</div>
										</div>
									</div>

									<div className="space-y-2 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
										<div className="text-xs tracking-wide text-muted-foreground/80">
											Supported Parameters
										</div>
										<div className="flex flex-wrap items-center gap-1.5">
											{paramLabels.length > 0 ? (
												paramLabels.map((item) => (
													<span
														key={`${model.model_id}-${item.id}`}
														className="inline-flex h-7 items-center rounded-md border border-border bg-muted/25 px-2 text-muted-foreground"
													>
														<span className="max-w-[9rem] truncate text-xs leading-none">
															{item.label}
														</span>
													</span>
												))
											) : (
												<span className="text-xs text-muted-foreground">-</span>
											)}
										</div>
									</div>

									<div className="space-y-2 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
										<div className="text-xs text-muted-foreground">Pricing</div>
										<div className="text-sm">
											Input / 1M:{" "}
											<span className="font-semibold">
												{formatUsd(model.input_price_per_1m_usd)}
											</span>
										</div>
										<div className="text-sm">
											Output / 1M:{" "}
											<span className="font-semibold">
												{formatUsd(model.output_price_per_1m_usd)}
											</span>
										</div>
										{model.starting_price_usd != null &&
										(model.input_price_per_1m_usd == null ||
											model.output_price_per_1m_usd == null) ? (
											<div className="text-xs text-muted-foreground">
												From {formatUsd(model.starting_price_usd)} /{" "}
												{model.starting_price_unit ?? "unit"}
											</div>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}
