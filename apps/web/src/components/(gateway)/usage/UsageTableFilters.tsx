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
import { X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

interface UsageTableFiltersProps {
	models: string[];
	providers: string[];
	modelProviders: Map<string, string[]>;
	providerNames: Map<string, string>;
	apiKeys: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata: Map<string, { organisationId: string; organisationName: string }>;
	children?: React.ReactNode;
}

export default function UsageTableFilters({
	models,
	providers,
	modelProviders,
	providerNames,
	apiKeys,
	modelMetadata,
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

	const triggerClassName = "h-9 text-sm bg-background [&>span]:text-sm";

	return (
		<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
			<div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-nowrap sm:overflow-x-auto sm:pb-0.5">
				<Select
					value={modelFilter || "all"}
					onValueChange={(v) => setModelFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger
						id="model-filter"
						className={cn(triggerClassName, "min-w-[220px]")}
						aria-label="Model filter"
					>
						<SelectValue placeholder="Model (all)" />
					</SelectTrigger>
					<SelectContent className="max-h-[320px]">
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
										<span className="truncate">{group.label}</span>
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
												<span className="truncate">{model}</span>
											</div>
										</SelectItem>
									);
								})}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>

				<Select
					value={providerFilter || "all"}
					onValueChange={(v) => setProviderFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger
						id="provider-filter"
						className={cn(triggerClassName, "min-w-[190px]")}
						aria-label="Provider filter"
					>
						<SelectValue placeholder="Provider (all)" />
					</SelectTrigger>
					<SelectContent className="max-h-[320px]">
						<SelectItem value="all">All providers</SelectItem>
						{sortedProviders.map((provider) => (
							<SelectItem key={provider} value={provider}>
								<div className="flex items-center gap-2">
									<Logo
										id={provider}
										width={16}
										height={16}
										className="rounded flex-shrink-0"
									/>
									<span className="truncate">
										{providerNames.get(provider) || provider}
									</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={keyFilter || "all"}
					onValueChange={(v) => setKeyFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger
						id="key-filter"
						className={cn(triggerClassName, "min-w-[160px]")}
						aria-label="API key filter"
					>
						<SelectValue placeholder="Key (all)" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All keys</SelectItem>
						{apiKeys.map((key) => (
							<SelectItem key={key.id} value={key.id}>
								{key.name || key.prefix || key.id.slice(0, 8)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger
						id="status-filter"
						className={cn(triggerClassName, "min-w-[150px]")}
						aria-label="Status filter"
					>
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All requests</SelectItem>
						<SelectItem value="success">Successful only</SelectItem>
						<SelectItem value="error">Errors only</SelectItem>
					</SelectContent>
				</Select>

				{hasFilters ? (
					<Button
						variant="ghost"
						size="icon"
						onClick={clearFilters}
						aria-label="Clear filters"
						title="Clear filters"
						className="h-9 w-9"
					>
						<X className="h-4 w-4" />
					</Button>
				) : null}
			</div>

			{children ? (
				<div className="flex items-center justify-end gap-2">
					{children}
				</div>
			) : null}
		</div>
	);
}
