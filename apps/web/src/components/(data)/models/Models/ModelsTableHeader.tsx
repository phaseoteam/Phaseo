"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { debounce, useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import {
	Search,
	Grid as GridIcon,
	Table as TableIcon,
	Filter,
	Layers as LayersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { featureLabels } from "@/lib/config/featureLabels";

interface ModelsTableHeaderProps {
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allTiers: string[];
	allStatuses: string[];
}

export default function ModelsTableHeader({
	allEndpoints,
	allModalities,
	allFeatures,
	allTiers,
	allStatuses,
}: ModelsTableHeaderProps) {
	const pathname = usePathname();
	const isTable = pathname?.includes("/models/table");
	const isCollections = pathname?.includes("/models/collections");

	const [search, setSearch] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [selectedInputModalities, setSelectedInputModalities] = useQueryState(
		"inputModalities",
		{
			defaultValue: [],
			parse: (value) => (value ? value.split(",") : []),
			serialize: (value) => value.join(","),
		}
	);

	const [selectedOutputModalities, setSelectedOutputModalities] =
		useQueryState("outputModalities", {
			defaultValue: [],
			parse: (value) => (value ? value.split(",") : []),
			serialize: (value) => value.join(","),
		});

	const [selectedFeatures, setSelectedFeatures] = useQueryState("features", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedEndpoints, setSelectedEndpoints] = useQueryState(
		"endpoints",
		{
			defaultValue: [],
			parse: (value) => (value ? value.split(",") : []),
			serialize: (value) => value.join(","),
		}
	);

	const [selectedStatuses, setSelectedStatuses] = useQueryState("statuses", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedTiers, setSelectedTiers] = useQueryState("tiers", {
		defaultValue: ["standard"],
		parse: (value) => (value ? value.split(",") : ["standard"]),
		serialize: (value) => value.join(","),
	});
	const isDefaultTiers =
		selectedTiers.length === 1 && selectedTiers[0] === "standard";

	return (
		<>
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<div className="flex items-center w-full md:w-auto">
					<h1 className="font-bold text-xl mb-2 md:mb-0">Models</h1>

					{/* Mobile: tabs next to the title */}
					<div className="ml-2 md:hidden">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											!isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models"
											aria-label="Card view"
										>
											<GridIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Card view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models/table"
											aria-label="Table view"
										>
											<TableIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Table view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											isCollections
												? "default"
												: "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models/collections"
											aria-label="Collections view"
										>
											<LayersIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Collections
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>

				<div className="relative w-full md:w-1/5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Search models..."
						value={search}
						onChange={(e) =>
							setSearch(e.target.value || "", {
								limitUrlUpdates: debounce(250),
							})
						}
						className="pl-9 pr-2 py-1.5 text-sm rounded-full bg-background border focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
						style={{ minWidth: 0 }}
					/>
				</div>
			</div>

			{/* Filters row (desktop: left) and view tabs (desktop: right) */}
			<div className="mb-4 -mx-1 overflow-x-auto">
				<div className="flex items-center justify-between px-1 pb-1 gap-2">
					<div className="flex gap-2 flex-wrap">
						{/* Endpoint Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8"
								>
									<Filter className="h-4 w-4 mr-2" />
									Endpoint
									{(selectedEndpoints.length > 0 ||
										selectedStatuses.length > 0) && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedEndpoints.length +
												selectedStatuses.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-4">
									<div className="space-y-2">
										<h4 className="font-medium">
											Endpoints
										</h4>
										{allEndpoints.map((endpoint) => (
											<div
												key={endpoint}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`endpoint-${endpoint}`}
													checked={selectedEndpoints.includes(
														endpoint
													)}
													onCheckedChange={(
														checked
													) => {
														if (checked) {
															setSelectedEndpoints(
																[
																	...selectedEndpoints,
																	endpoint,
																]
															);
														} else {
															setSelectedEndpoints(
																selectedEndpoints.filter(
																	(e) =>
																		e !==
																		endpoint
																)
															);
														}
													}}
												/>
												<label
													htmlFor={`endpoint-${endpoint}`}
													className="text-sm"
												>
													{endpoint}
												</label>
											</div>
										))}
									</div>
									<div className="space-y-2">
										<h4 className="font-medium">Status</h4>
										{allStatuses.map((status) => (
											<div
												key={status}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`status-${status}`}
													checked={selectedStatuses.includes(
														status
													)}
													onCheckedChange={(
														checked
													) => {
														if (checked) {
															setSelectedStatuses(
																[
																	...selectedStatuses,
																	status,
																]
															);
														} else {
															setSelectedStatuses(
																selectedStatuses.filter(
																	(s) =>
																		s !==
																		status
																)
															);
														}
													}}
												/>
												<label
													htmlFor={`status-${status}`}
													className="text-sm capitalize"
												>
													{status}
												</label>
											</div>
										))}
									</div>
								</div>
							</PopoverContent>
						</Popover>

						{/* Modalities Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8"
								>
									<Filter className="h-4 w-4 mr-2" />
									Modalities
									{(selectedInputModalities.length > 0 ||
										selectedOutputModalities.length >
											0) && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedInputModalities.length +
												selectedOutputModalities.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-4">
									<div className="space-y-2">
										<h4 className="font-medium">
											Input Modalities
										</h4>
										{allModalities.map((modality) => (
											<div
												key={`input-${modality}`}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`input-modality-${modality}`}
													checked={selectedInputModalities.includes(
														modality
													)}
													onCheckedChange={(
														checked
													) => {
														if (checked) {
															setSelectedInputModalities(
																[
																	...selectedInputModalities,
																	modality,
																]
															);
														} else {
															setSelectedInputModalities(
																selectedInputModalities.filter(
																	(m) =>
																		m !==
																		modality
																)
															);
														}
													}}
												/>
												<label
													htmlFor={`input-modality-${modality}`}
													className="text-sm"
												>
													{modality}
												</label>
											</div>
										))}
									</div>
									<div className="space-y-2">
										<h4 className="font-medium">
											Output Modalities
										</h4>
										{allModalities.map((modality) => (
											<div
												key={`output-${modality}`}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`output-modality-${modality}`}
													checked={selectedOutputModalities.includes(
														modality
													)}
													onCheckedChange={(
														checked
													) => {
														if (checked) {
															setSelectedOutputModalities(
																[
																	...selectedOutputModalities,
																	modality,
																]
															);
														} else {
															setSelectedOutputModalities(
																selectedOutputModalities.filter(
																	(m) =>
																		m !==
																		modality
																)
															);
														}
													}}
												/>
												<label
													htmlFor={`output-modality-${modality}`}
													className="text-sm"
												>
													{modality}
												</label>
											</div>
										))}
									</div>
								</div>
							</PopoverContent>
						</Popover>

						{/* Features Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8"
								>
									<Filter className="h-4 w-4 mr-2" />
									Features
									{selectedFeatures.length > 0 && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedFeatures.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-2">
									<h4 className="font-medium">Features</h4>
									{allFeatures.map((feature) => (
										<div
											key={feature}
											className="flex items-center space-x-2"
										>
											<Checkbox
												id={`feature-${feature}`}
												checked={selectedFeatures.includes(
													feature
												)}
												onCheckedChange={(checked) => {
													if (checked) {
														setSelectedFeatures([
															...selectedFeatures,
															feature,
														]);
													} else {
														setSelectedFeatures(
															selectedFeatures.filter(
																(f) =>
																	f !==
																	feature
															)
														);
													}
												}}
											/>
											<label
												htmlFor={`feature-${feature}`}
												className="text-sm"
											>
												{featureLabels[feature] ?? feature}
											</label>
										</div>
									))}
								</div>
							</PopoverContent>
						</Popover>

						{/* Tier Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8"
								>
									<Filter className="h-4 w-4 mr-2" />
									Tier
									{!isDefaultTiers && (
											<Badge
												variant="secondary"
												className="ml-2 h-5 px-1.5 text-xs"
											>
												{selectedTiers.length}
											</Badge>
										)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-2">
									<h4 className="font-medium">
										Pricing Tiers
									</h4>
									{allTiers.map((tier) => (
										<div
											key={tier}
											className="flex items-center space-x-2"
										>
											<Checkbox
												id={`tier-${tier}`}
												checked={selectedTiers.includes(
													tier
												)}
												onCheckedChange={(checked) => {
													if (checked) {
														setSelectedTiers([
															...selectedTiers,
															tier,
														]);
													} else {
														setSelectedTiers(
															selectedTiers.filter(
																(t) =>
																	t !== tier
															)
														);
													}
												}}
											/>
											<label
												htmlFor={`tier-${tier}`}
												className="text-sm capitalize"
											>
												{tier}
											</label>
										</div>
									))}
								</div>
							</PopoverContent>
						</Popover>

						{/* Clear Filters */}
						{(search ||
							selectedInputModalities.length > 0 ||
							selectedOutputModalities.length > 0 ||
							selectedEndpoints.length > 0 ||
							selectedStatuses.length > 0 ||
							selectedFeatures.length > 0 ||
							!isDefaultTiers) && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setSearch("");
									setSelectedEndpoints([]);
									setSelectedStatuses([]);
									setSelectedInputModalities([]);
									setSelectedOutputModalities([]);
									setSelectedFeatures([]);
									setSelectedTiers(["standard"]);
								}}
								className="h-8"
							>
								Clear Filters
							</Button>
						)}
					</div>

					{/* Desktop tabs aligned to the right */}
					<div className="hidden md:flex items-center">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											!isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models"
											aria-label="Card view"
										>
											<GridIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Card view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models/table"
											aria-label="Table view"
										>
											<TableIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Table view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											isCollections
												? "default"
												: "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models/collections"
											aria-label="Collections view"
										>
											<LayersIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Collections
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
