"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import { shortenIdentifier } from "@/lib/gateway/usage/timeFormatting";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";

interface UsageTableFiltersProps {
	models: string[];
	providers: string[];
	modelProviders: Map<string, string[]>;
	providerNames: Map<string, string>;
	apiKeys: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata: ModelMetadataMap;
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
	const t = useTranslations("SettingsUI");
	const statusFilterItems = React.useMemo(
		() => [
			{ value: "all", label: t("strings.All requests" as never) },
			{ value: "success", label: t("strings.Successful only" as never) },
			{ value: "error", label: t("strings.Errors only" as never) },
		],
		[t],
	);
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
	const [requestFilter, setRequestFilter] = useQueryState("req", {
		defaultValue: "",
	});
	const [sessionFilter, setSessionFilter] = useQueryState("session", {
		defaultValue: "",
	});

	React.useEffect(() => {
		if (!modelFilter) return;
		if (!models.includes(modelFilter)) {
			setModelFilter("");
		}
	}, [modelFilter, models, setModelFilter]);

	React.useEffect(() => {
		if (!providerFilter) return;
		if (!providers.includes(providerFilter)) {
			setProviderFilter("");
		}
	}, [providerFilter, providers, setProviderFilter]);

	React.useEffect(() => {
		if (!keyFilter) return;
		const valid = apiKeys.some((k) => k.id === keyFilter);
		if (!valid) {
			setKeyFilter("");
		}
	}, [keyFilter, apiKeys, setKeyFilter]);

	const hasFilters =
		modelFilter ||
		providerFilter ||
		keyFilter ||
		statusFilter !== "all" ||
		requestFilter ||
		sessionFilter;

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
						? t("strings.Other" as never)
						: getProviderLabel(providerId),
				models: sortedModels,
			};
		});

		return entries.sort((a, b) => {
			if (a.providerId === OTHER_GROUP_ID) return 1;
			if (b.providerId === OTHER_GROUP_ID) return -1;
			return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
		});
	}, [models, modelProviders, getProviderLabel, t]);
	const modelFilterItems = React.useMemo(
			() => [
			{ value: "all", label: t("strings.All models" as never) },
			...models.map((model) => ({
				value: model,
				label: getModelDisplayName(model, modelMetadata),
			})),
		],
		[modelMetadata, models, t],
	);
	const providerFilterItems = React.useMemo(
		() => [
			{ value: "all", label: t("strings.All providers" as never) },
			...sortedProviders.map((provider) => ({
				value: provider,
				label: getProviderLabel(provider),
			})),
		],
		[getProviderLabel, sortedProviders, t],
	);
	const keyFilterItems = React.useMemo(
		() => [
			{ value: "all", label: t("strings.All keys" as never) },
			...apiKeys.map((key) => ({
				value: key.id,
				label: key.name || key.prefix || key.id.slice(0, 8),
			})),
		],
		[apiKeys, t],
	);

	const clearFilters = () => {
		setModelFilter("");
		setProviderFilter("");
		setKeyFilter("");
		setStatusFilter("all");
		setRequestFilter("");
		setSessionFilter("");
	};

	const triggerClassName = "h-9 text-sm bg-background [&>span]:text-sm";

	return (
		<div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
			<div className="flex flex-1 flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:overflow-x-auto sm:pb-0.5">
				<Select
					value={modelFilter || "all"}
					items={modelFilterItems}
					onValueChange={(v) => setModelFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger
						id="model-filter"
						className={cn(triggerClassName, "min-w-[220px]")}
						aria-label={t("strings.Model filter" as never)}
					>
						<SelectValue placeholder={t("strings.Model (all)" as never)} />
					</SelectTrigger>
					<SelectContent className="max-h-[320px]">
						<SelectItem value="all" label={t("strings.All models" as never)}>{t("strings.All models" as never)}</SelectItem>
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
										<SelectItem
											key={model}
											value={model}
											label={getModelDisplayName(model, modelMetadata)}
										>
											<div className="flex items-center gap-2">
												{metadata ? (
													<Logo
														id={metadata.organisationId}
														width={16}
														height={16}
														className="rounded flex-shrink-0"
													/>
												) : null}
												<span className="truncate">{getModelDisplayName(model, modelMetadata)}</span>
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
					items={providerFilterItems}
					onValueChange={(v) => setProviderFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger
						id="provider-filter"
						className={cn(triggerClassName, "min-w-[190px]")}
						aria-label={t("strings.Provider filter" as never)}
					>
						<SelectValue placeholder={t("strings.Provider (all)" as never)} />
					</SelectTrigger>
					<SelectContent className="max-h-[320px]">
						<SelectItem value="all" label={t("strings.All providers" as never)}>{t("strings.All providers" as never)}</SelectItem>
						{sortedProviders.map((provider) => (
							<SelectItem
								key={provider}
								value={provider}
								label={getProviderLabel(provider)}
							>
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
					items={keyFilterItems}
					onValueChange={(v) => setKeyFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger
						id="key-filter"
						className={cn(triggerClassName, "min-w-[160px]")}
						aria-label={t("strings.API key filter" as never)}
					>
						<SelectValue placeholder={t("strings.Key (all)" as never)} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all" label={t("strings.All keys" as never)}>{t("strings.All keys" as never)}</SelectItem>
						{apiKeys.map((key) => (
							<SelectItem
								key={key.id}
								value={key.id}
								label={key.name || key.prefix || key.id.slice(0, 8)}
							>
								{key.name || key.prefix || key.id.slice(0, 8)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={statusFilter}
					items={statusFilterItems}
					onValueChange={setStatusFilter}
				>
					<SelectTrigger
						id="status-filter"
						className={cn(triggerClassName, "min-w-[150px]")}
						aria-label={t("strings.Status filter" as never)}
					>
						<SelectValue placeholder={t("strings.Status" as never)} />
					</SelectTrigger>
					<SelectContent>
						{statusFilterItems.map((item) => (
							<SelectItem key={item.value} value={item.value} label={item.label}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{hasFilters ? (
					<Button
						variant="ghost"
						size="icon"
						onClick={clearFilters}
						aria-label={t("strings.Clear filters" as never)}
						title={t("strings.Clear filters" as never)}
						className="h-9 w-9"
					>
						<X className="h-4 w-4" />
					</Button>
				) : null}
			</div>
				{requestFilter || sessionFilter ? (
					<div className="flex flex-wrap items-center gap-2">
						{requestFilter ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setRequestFilter("")}
								className="h-8 gap-2 rounded-md px-2 text-xs"
							>
								<span className="text-muted-foreground">{t("strings.Req" as never)}</span>
								<code className="font-mono text-[11px]">
									{shortenIdentifier(requestFilter, 6)}
								</code>
								<X className="h-3 w-3" />
							</Button>
						) : null}
						{sessionFilter ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setSessionFilter("")}
								className="h-8 gap-2 rounded-md px-2 text-xs"
							>
								<span className="text-muted-foreground">{t("strings.Session" as never)}</span>
								<code className="font-mono text-[11px]">
									{shortenIdentifier(sessionFilter, 6)}
								</code>
								<X className="h-3 w-3" />
							</Button>
						) : null}
					</div>
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
