"use client";

import { useSearchParams, useRouter } from "next/navigation";
import ModelCombobox from "./ModelCombobox";
import type { ExtendedModel } from "@/data/types";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ProviderLogoName } from "./ProviderLogoName";

interface CompareMiniHeaderProps {
	models: ExtendedModel[];
}

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
	const selected = searchParams
		.getAll("models")
		.map((value) => decodeModelIdFromUrl(value))
		.filter(Boolean);

	const setSelected = (ids: string[]) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("models");
		ids.forEach((id) => params.append("models", encodeModelIdForUrl(id)));
		router.replace(`?${params.toString()}`);
	};

	const selectedModels = models.filter((m) => selected.includes(m.id));

	return (
		<div className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto px-4 py-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm font-semibold text-foreground">
								Compare
							</span>
							<Badge variant="secondary" className="text-[11px]">
								{selectedModels.length}/4 selected
							</Badge>
							<span className="text-xs text-muted-foreground">
								Pick up to four models to generate a shareable comparison.
							</span>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							{selectedModels.length === 0 ? (
								<div className="text-xs text-muted-foreground">
									No models selected yet.
								</div>
							) : (
								selectedModels.map((model) => (
									<Badge
										key={model.id}
										variant="outline"
										className="flex items-center gap-2 pl-1.5 pr-2 py-1 border bg-background"
									>
										<ProviderLogoName
											id={model.provider.provider_id}
											name={model.provider.name}
											href={`/organisations/${model.provider.provider_id}`}
											size="xxs"
											className="mr-1 shrink-0"
											mobilePopover
										/>
										<span className="max-w-[220px] truncate text-sm font-normal">
											{model.name}
										</span>
										<Button
											size="icon"
											variant="ghost"
											className="h-5 w-5 p-0 ml-1 flex-shrink-0 hover:bg-muted rounded-md"
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
									</Badge>
								))
							)}
						</div>
					</div>

					<div className="w-full md:w-72 flex-shrink-0 flex justify-end">
						<ModelCombobox
							models={models}
							selected={selected}
							setSelected={setSelected}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
