"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import {
	SelectGroup,
	SelectLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { Logo } from "@/components/Logo";

interface UsageTableFiltersProps {
	models: string[];
	providers: string[];
	modelProviders: Map<string, string[]>;
	providerNames: Map<string, string>;
	apiKeys: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata: Map<string, { organisationId: string; organisationName: string }>;
	leftActions?: React.ReactNode;
	children?: React.ReactNode;
}

export default function UsageTableFilters({
	models,
	providers,
	modelProviders,
	providerNames,
	apiKeys,
	modelMetadata,
	leftActions,
	children,
}: UsageTableFiltersProps) {
	const [modelFilter, setModelFilter] = useQueryState("model", {
		defaultValue: "",
	});
	const [providerFilter, setProviderFilter] = useQueryState("provider", {
		defaultValue: "",
	});
	const [keyFilter, setKeyFilter] = useQueryState("key", {
		defaultValue: "",
	});
	const [statusFilter, setStatusFilter] = useQueryState("status", {
		defaultValue: "all",
	});

	const hasFilters =
		modelFilter || providerFilter || keyFilter || statusFilter !== "all";

	const getProviderLabel = React.useCallback(
		(providerId: string) => providerNames.get(providerId) || providerId,
		[providerNames],
	);

	const sortedProviders = React.useMemo(() => {
		return providers
			.slice()
			.sort((a, b) =>
				getProviderLabel(a).localeCompare(getProviderLabel(b), undefined, {
					sensitivity: "base",
				}),
			);
	}, [providers, getProviderLabel]);

	const groupedModels = React.useMemo(() => {
		const OTHER_GROUP_ID = "__other__";
		const groups = new Map<string, string[]>();

		for (const model of models) {
			const providersForModel = (modelProviders.get(model) ?? []).slice();
			const primaryProvider =
				providersForModel
					.sort((a, b) =>
						getProviderLabel(a).localeCompare(getProviderLabel(b), undefined, {
							sensitivity: "base",
						}),
					)[0] ?? OTHER_GROUP_ID;

			if (!groups.has(primaryProvider)) groups.set(primaryProvider, []);
			groups.get(primaryProvider)!.push(model);
		}

		const entries = Array.from(groups.entries()).map(([providerId, modelList]) => {
			const sortedModels = modelList
				.slice()
				.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

			return {
				providerId,
				label:
					providerId === OTHER_GROUP_ID
						? "Other"
						: getProviderLabel(providerId),
				models: sortedModels,
			};
		});

		return entries.sort((a, b) => {
			if (a.providerId === OTHER_GROUP_ID) return 1;
			if (b.providerId === OTHER_GROUP_ID) return -1;
			return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
		});
	}, [models, modelProviders, getProviderLabel]);

	const clearFilters = () => {
		setModelFilter("");
		setProviderFilter("");
		setKeyFilter("");
		setStatusFilter("all");
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end">
				<div className="flex flex-1 items-end gap-2">
					{leftActions ? (
						<div className="flex h-10 items-center">
							{leftActions}
						</div>
					) : null}
					<div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
						{/* Model Filter */}
						<div className="space-y-2">
							<Label htmlFor="model-filter">Model</Label>
							<Select
								value={modelFilter || "all"}
								onValueChange={(v) =>
									setModelFilter(v === "all" ? "" : v)
								}
							>
								<SelectTrigger id="model-filter">
									<SelectValue placeholder="All models" />
								</SelectTrigger>
								<SelectContent className="max-h-[300px]">
									<SelectItem value="all">All models</SelectItem>
									{groupedModels.map((group) => (
										<SelectGroup key={group.providerId}>
											<SelectLabel>
												<div className="flex items-center gap-2">
													{group.providerId !== "__other__" ? (
														<Logo
															id={group.providerId}
															width={14}
															height={14}
															className="rounded-sm"
														/>
													) : null}
													<span className="truncate">
														{group.label}
													</span>
												</div>
											</SelectLabel>
											{group.models.map((model) => {
												const metadata = modelMetadata.get(model);
												return (
													<SelectItem key={model} value={model}>
														<div className="flex items-center gap-2">
															{metadata ? (
																<Logo
																	id={metadata.organisationId}
																	width={16}
																	height={16}
																	className="rounded flex-shrink-0"
																/>
															) : null}
															<span className="truncate">
																{model}
															</span>
														</div>
													</SelectItem>
												);
											})}
										</SelectGroup>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Provider Filter */}
						<div className="space-y-2">
							<Label htmlFor="provider-filter">Provider</Label>
							<Select
								value={providerFilter || "all"}
								onValueChange={(v) =>
									setProviderFilter(v === "all" ? "" : v)
								}
							>
								<SelectTrigger id="provider-filter">
									<SelectValue placeholder="All providers" />
								</SelectTrigger>
								<SelectContent className="max-h-[300px]">
									<SelectItem value="all">
										All providers
									</SelectItem>
									{sortedProviders.map((provider) => (
										<SelectItem
											key={provider}
											value={provider}
										>
											<div className="flex items-center gap-2">
												<Logo
													id={provider}
													width={16}
													height={16}
													className="rounded flex-shrink-0"
												/>
												<span className="truncate">
													{providerNames.get(provider) ||
														provider}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* API Key Filter */}
						<div className="space-y-2">
							<Label htmlFor="key-filter">API Key</Label>
							<Select
								value={keyFilter || "all"}
								onValueChange={(v) =>
									setKeyFilter(v === "all" ? "" : v)
								}
							>
								<SelectTrigger id="key-filter">
									<SelectValue placeholder="All keys" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All keys</SelectItem>
									{apiKeys.map((key) => (
										<SelectItem key={key.id} value={key.id}>
											{key.name ||
												key.prefix ||
												key.id.slice(0, 8)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Status Filter */}
						<div className="space-y-2">
							<Label htmlFor="status-filter">Status</Label>
							<Select
								value={statusFilter}
								onValueChange={setStatusFilter}
							>
								<SelectTrigger id="status-filter">
									<SelectValue placeholder="All statuses" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All requests
									</SelectItem>
									<SelectItem value="success">
										Successful only
									</SelectItem>
									<SelectItem value="error">
										Errors only
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex flex-col gap-2">
					<Label className="invisible">Actions</Label>
					<div className="flex items-center gap-2">
						{hasFilters && (
							<Button variant="outline" size="sm" onClick={clearFilters}>
								<X className="mr-2 h-4 w-4" />
								Clear filters
							</Button>
						)}
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
