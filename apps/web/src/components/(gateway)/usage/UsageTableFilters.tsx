"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
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
	providerNames: Map<string, string>;
	apiKeys: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata: Map<string, { organisationId: string; organisationName: string }>;
	children?: React.ReactNode;
}

export default function UsageTableFilters({
	models,
	providers,
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

	const clearFilters = () => {
		setModelFilter("");
		setProviderFilter("");
		setKeyFilter("");
		setStatusFilter("all");
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-col lg:flex-row gap-4 lg:items-start">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
				{/* Model Filter */}
				<div className="space-y-2">
					<Label htmlFor="model-filter">Model</Label>
					<Select value={modelFilter || "all"} onValueChange={(v) => setModelFilter(v === "all" ? "" : v)}>
						<SelectTrigger id="model-filter">
							<SelectValue placeholder="All models" />
						</SelectTrigger>
						<SelectContent className="max-h-[300px]">
							<SelectItem value="all">All models</SelectItem>
							{models.map((model) => {
								const metadata = modelMetadata.get(model);
								return (
									<SelectItem key={model} value={model}>
										<div className="flex items-center gap-2">
											{metadata && (
												<Logo
													id={metadata.organisationId}
													width={16}
													height={16}
													className="rounded flex-shrink-0"
												/>
											)}
											<span className="truncate">{model}</span>
										</div>
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				</div>

				{/* Provider Filter */}
				<div className="space-y-2">
					<Label htmlFor="provider-filter">Provider</Label>
					<Select
						value={providerFilter || "all"}
						onValueChange={(v) => setProviderFilter(v === "all" ? "" : v)}
					>
						<SelectTrigger id="provider-filter">
							<SelectValue placeholder="All providers" />
						</SelectTrigger>
						<SelectContent className="max-h-[300px]">
							<SelectItem value="all">All providers</SelectItem>
							{providers.map((provider) => (
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
				</div>

				{/* API Key Filter */}
				<div className="space-y-2">
					<Label htmlFor="key-filter">API Key</Label>
					<Select value={keyFilter || "all"} onValueChange={(v) => setKeyFilter(v === "all" ? "" : v)}>
						<SelectTrigger id="key-filter">
							<SelectValue placeholder="All keys" />
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
				</div>

				{/* Status Filter */}
				<div className="space-y-2">
					<Label htmlFor="status-filter">Status</Label>
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger id="status-filter">
							<SelectValue placeholder="All statuses" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All requests</SelectItem>
							<SelectItem value="success">Successful only</SelectItem>
							<SelectItem value="error">Errors only</SelectItem>
						</SelectContent>
					</Select>
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
