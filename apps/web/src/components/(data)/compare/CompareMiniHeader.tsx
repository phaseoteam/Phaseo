"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ModelCombobox from "./ModelCombobox";
import type { ExtendedModel } from "@/data/types";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderLogoName } from "./ProviderLogoName";

interface CompareMiniHeaderProps {
	models: ExtendedModel[];
}

const MAX_SELECTION = 4;

const decodeModelIdFromUrl = (value: string): string => {
	const trimmed = value?.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) return trimmed;
	if (!trimmed.includes("_")) return trimmed;
	const [organisationId, ...rest] = trimmed.split("_");
	if (!organisationId || rest.length === 0) return trimmed;
	return `${organisationId}/${rest.join("_")}`;
};

const encodeModelIdForUrl = (value: string): string => {
	if (!value) return "";
	const [organisationId, ...rest] = value.split("/");
	if (!organisationId || rest.length === 0) return value;
	return `${organisationId}_${rest.join("/")}`;
};

export default function CompareMiniHeader({ models }: CompareMiniHeaderProps) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [comboboxOpen, setComboboxOpen] = useState(false);
	const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
	const selected = searchParams
		.getAll("models")
		.map((value) => decodeModelIdFromUrl(value))
		.filter(Boolean);
	const modelsById = useMemo(() => {
		const map = new Map<string, ExtendedModel>();
		for (const model of models) {
			if (!model.id) continue;
			map.set(model.id, model);
		}
		return map;
	}, [models]);

	const setSelected = (ids: string[]) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("models");
		ids.forEach((id) => params.append("models", encodeModelIdForUrl(id)));
		router.replace(`?${params.toString()}`);
	};

	const selectedModels = selected
		.map((modelId) => modelsById.get(modelId))
		.filter((model): model is ExtendedModel => Boolean(model));
	const hasReachedMaxSelection = selected.length >= MAX_SELECTION;

	const handleComboboxOpenChange = (open: boolean) => {
		setComboboxOpen(open);
		if (!open) {
			setReplaceTargetId(null);
		}
	};

	const openReplaceDialog = (modelId: string) => {
		setReplaceTargetId(modelId);
		setComboboxOpen(true);
	};

	return (
		<div className="sticky top-[var(--site-header-height,4rem)] z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
			<div className="container mx-auto px-3 py-2 sm:px-4 sm:py-3">
				<div className="flex flex-col gap-1.5 sm:gap-2">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold text-foreground">
								Compare
							</span>
						</div>
						{selectedModels.length === 0 ? (
							<span className="hidden sm:inline text-xs text-muted-foreground">
								Select up to four models
							</span>
						) : null}
					</div>

					<div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{selectedModels.length === 0 ? (
							<>
								{!hasReachedMaxSelection ? (
									<ModelCombobox
										models={models}
										selected={selected}
										setSelected={setSelected}
										open={comboboxOpen}
										onOpenChange={handleComboboxOpenChange}
										replaceTargetId={replaceTargetId}
										labelWhenEmpty="Add Model"
										labelWhenSelected="Add Model"
										showSelectionCount={false}
										className="h-7 px-2 text-xs shrink-0"
									/>
								) : null}
							</>
						) : (
							<>
								{selectedModels.map((model) => (
									<Badge
										key={model.id}
										variant="outline"
										className="group shrink-0 flex items-center gap-2 pl-1.5 pr-2 py-1 border bg-background"
									>
										<ProviderLogoName
											id={model.provider.provider_id}
											name={model.provider.name}
											href={`/organisations/${model.provider.provider_id}`}
											size="xxs"
											className="mr-1 shrink-0"
											mobilePopover
										/>
										<span className="max-w-[150px] sm:max-w-[220px] truncate text-sm font-normal">
											{model.name}
										</span>
										<div className="inline-flex max-w-0 items-center gap-1 overflow-hidden opacity-0 pointer-events-none transition-[max-width,opacity,margin] duration-150 ease-out group-hover:ml-1 group-focus-within:ml-1 group-hover:max-w-[44px] group-focus-within:max-w-[44px] group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
											<Button
												size="icon"
												variant="ghost"
												className="h-5 w-5 p-0 flex-shrink-0 hover:bg-muted rounded-md"
												onClick={() => openReplaceDialog(model.id)}
												aria-label={`Edit ${model.name}`}
											>
												<Pencil className="h-3 w-3" />
											</Button>
											<Button
												size="icon"
												variant="ghost"
												className="h-5 w-5 p-0 flex-shrink-0 hover:bg-muted rounded-md"
												onClick={() =>
													setSelected(
														selected.filter(
															(id) => id !== model.id
														)
													)
												}
												aria-label={`Remove ${model.name}`}
											>
												<X className="h-3 w-3" />
											</Button>
										</div>
									</Badge>
								))}
								{!hasReachedMaxSelection ? (
									<ModelCombobox
										models={models}
										selected={selected}
										setSelected={setSelected}
										open={comboboxOpen}
										onOpenChange={handleComboboxOpenChange}
										replaceTargetId={replaceTargetId}
										labelWhenEmpty="Add Model"
										labelWhenSelected="Add Model"
										showSelectionCount={false}
										className="h-7 px-2 text-xs shrink-0"
									/>
								) : null}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
