"use client";

import { useEffect, useMemo, useRef } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	AlignCenter,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	AudioLines,
	BadgeCheck,
	Brain,
	Braces,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Database,
	FileDigit,
	FileUp,
	Globe,
	ImageDown,
	ImageUp,
	ShieldAlert,
	ShieldCheck,
	Video,
	Wrench,
	XCircle,
} from "lucide-react";

import { Logo } from "@/components/Logo";

import Link from "next/link";
import { useQueryState } from "nuqs";
import { featureLabels } from "@/lib/config/featureLabels";

// Icon and color mappings
const modalityIcons = {
	image: { input: ImageUp, output: ImageDown, color: "text-blue-600" },
	vision: { input: ImageUp, output: ImageDown, color: "text-blue-600" },
	video: { input: Video, output: Video, color: "text-purple-600" },
	file: { input: FileUp, output: null, color: "text-green-600" },
	embeddings: { input: FileDigit, output: null, color: "text-orange-600" },
	moderations: { input: ShieldCheck, output: null, color: "text-red-600" },
	audio: {
		input: AudioLines,
		output: AudioLines,
		color: "text-pink-600",
	},
	speech: {
		input: AudioLines,
		output: AudioLines,
		color: "text-pink-600",
	},
	text: { input: AlignCenter, output: AlignCenter, color: "text-gray-600" },
	multimodal: { input: Globe, output: Globe, color: "text-indigo-600" },
	code: { input: Braces, output: Braces, color: "text-cyan-600" },
	function: { input: Wrench, output: Wrench, color: "text-yellow-600" },
};

const featureIcons = {
	tools: { icon: Wrench, color: "text-yellow-600" },
	reasoning: { icon: Brain, color: "text-indigo-600" },
	structured_outputs: { icon: Braces, color: "text-cyan-600" },
	caching: { icon: Database, color: "text-emerald-600" },
	web_search: { icon: Globe, color: "text-blue-500" },
	moderated: { icon: ShieldAlert, color: "text-red-500" },
	free: { icon: BadgeCheck, color: "text-emerald-600" },
};

const statusIcons = {
	active: { icon: CheckCircle2, color: "text-green-600" },
	inactive: { icon: XCircle, color: "text-red-600" },
};

// Types for the model data
export interface ModelData {
	id: string;
	model: string;
	modelId: string;
	organisationId?: string;
	provider: {
		name: string;
		id: string;
		inputPrice: number;
		outputPrice: number;
		features: string[];
	};
	endpoint: string;
	gatewayStatus: "active" | "inactive";
	inputModalities: string[]; // text, image, video, audio, file, embeddings
	outputModalities: string[]; // text, image, video, audio
	context: number; // context window in tokens
	maxOutput: number; // max output tokens
	quantization?: string; // quantization level
	tier?: string; // pricing tier
	added?: string; // date added
	retired?: string; // when this model is retired
}

// Props for the datatable component
interface MonitorDataTableProps {
	data: ModelData[];
	loading?: boolean;
}

export function MonitorDataTable({
	data,
	loading = false,
}: MonitorDataTableProps) {
	const [searchQuery] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [yearSelected] = useQueryState("year", {
		defaultValue: 0,
		parse: (value) => Number.parseInt(value || "0", 10),
		serialize: (value) => String(value),
	});

	const [selectedInputModalities] = useQueryState("inputModalities", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedOutputModalities] = useQueryState("outputModalities", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedFeatures] = useQueryState("features", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedEndpoints] = useQueryState("endpoints", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedStatuses] = useQueryState("statuses", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedTiers] = useQueryState("tiers", {
		defaultValue: ["standard"],
		parse: (value) => (value ? value.split(",") : ["standard"]),
		serialize: (value) => value.join(","),
	});

	// Sorting via URL params
	const [sortField, setSortField] = useQueryState("sort", {
		defaultValue: "added",
		parse: (value) => value || "added",
		serialize: (value) => value,
	});
	const [sortDirection, setSortDirection] = useQueryState("dir", {
		defaultValue: "desc",
		parse: (value) => (value === "asc" ? "asc" : "desc"),
		serialize: (value) => value,
	});

	const [page, setPage] = useQueryState("page", {
		defaultValue: 1,
		parse: (value) => {
			const parsed = Number.parseInt(value || "1", 10);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
		},
		serialize: (value) => String(value),
	});

	const handleSort = (field: string) => {
		if (sortField === field) {
			const nextDirection = sortDirection === "desc" ? "asc" : "desc";
			setSortDirection(nextDirection);
		} else {
			setSortField(field);
			setSortDirection("desc");
		}
	};

	const getSortIcon = (field: string) => {
		if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
		return sortDirection === "asc" ? (
			<ArrowUp className="h-4 w-4" />
		) : (
			<ArrowDown className="h-4 w-4" />
		);
	};

	const filteredSortedData = useMemo(() => {
		const filtered = data.filter((item) => {
			if (searchQuery) {
				const searchLower = searchQuery.toLowerCase();
				const matchesSearch = Object.values(item).some((value) => {
					if (Array.isArray(value)) {
						return value.some((v) =>
							String(v).toLowerCase().includes(searchLower),
						);
					}
					if (typeof value === "object" && value !== null) {
						return Object.values(value).some((nestedValue) => {
							if (Array.isArray(nestedValue)) {
								return nestedValue.some((v) =>
									String(v)
										.toLowerCase()
										.includes(searchLower),
								);
							}
							return String(nestedValue)
								.toLowerCase()
								.includes(searchLower);
						});
					}
					return String(value).toLowerCase().includes(searchLower);
				});
				if (!matchesSearch) return false;
			}

			if (yearSelected && yearSelected > 0) {
				const itemYear = item.added
					? new Date(item.added).getFullYear()
					: null;
				if (itemYear !== yearSelected) return false;
			}

			if (selectedInputModalities.length > 0) {
				const hasAllInputModalities = selectedInputModalities.every(
					(mod) => item.inputModalities.includes(mod),
				);
				if (!hasAllInputModalities) return false;
			}

			if (selectedOutputModalities.length > 0) {
				const hasAllOutputModalities = selectedOutputModalities.every(
					(mod) => item.outputModalities.includes(mod),
				);
				if (!hasAllOutputModalities) return false;
			}

			if (selectedFeatures.length > 0) {
				const hasAllFeatures = selectedFeatures.every((feat) =>
					item.provider.features.includes(feat),
				);
				if (!hasAllFeatures) return false;
			}

			if (selectedEndpoints.length > 0) {
				if (!selectedEndpoints.includes(item.endpoint)) return false;
			}

			if (selectedStatuses.length > 0) {
				if (!selectedStatuses.includes(item.gatewayStatus))
					return false;
			}

			if (selectedTiers.length > 0) {
				if (!item.tier || !selectedTiers.includes(item.tier))
					return false;
			}

			return true;
		});

		if (!sortField) return filtered;

		return [...filtered].sort((a, b) => {
			let aValue: any;
			let bValue: any;

			if (sortField === "added" || sortField === "retired") {
				const field = sortField as "added" | "retired";
				const aHasDate = !!a[field];
				const bHasDate = !!b[field];

				if (aHasDate && bHasDate) {
					const aDate = new Date(a[field]!).getTime();
					const bDate = new Date(b[field]!).getTime();
					return sortDirection === "asc"
						? aDate - bDate
						: bDate - aDate;
				}
				if (aHasDate && !bHasDate) return -1;
				if (!aHasDate && bHasDate) return 1;
				return 0;
			}

			switch (sortField) {
				case "model":
					aValue = a.model;
					bValue = b.model;
					break;
				case "provider":
					aValue = a.provider.name;
					bValue = b.provider.name;
					break;
				case "endpoint":
					aValue = a.endpoint;
					bValue = b.endpoint;
					break;
				case "inputPrice":
					aValue = a.provider.inputPrice;
					bValue = b.provider.inputPrice;
					break;
				case "outputPrice":
					aValue = a.provider.outputPrice;
					bValue = b.provider.outputPrice;
					break;
				case "status":
					aValue = a.gatewayStatus;
					bValue = b.gatewayStatus;
					break;
				case "tier":
					aValue = a.tier || "";
					bValue = b.tier || "";
					break;
				case "context":
					aValue = a.context;
					bValue = b.context;
					break;
				case "maxOutput":
					aValue = a.maxOutput;
					bValue = b.maxOutput;
					break;
				default:
					aValue = "";
					bValue = "";
			}

			if (Array.isArray(aValue)) aValue = aValue.join(",");
			if (Array.isArray(bValue)) bValue = bValue.join(",");

			if (typeof aValue === "number" && typeof bValue === "number") {
				return sortDirection === "asc"
					? aValue - bValue
					: bValue - aValue;
			}

			const aStr = String(aValue).toLowerCase();
			const bStr = String(bValue).toLowerCase();
			return sortDirection === "asc"
				? aStr.localeCompare(bStr)
				: bStr.localeCompare(aStr);
		});
	}, [
		data,
		searchQuery,
		yearSelected,
		selectedInputModalities,
		selectedOutputModalities,
		selectedFeatures,
		selectedEndpoints,
		selectedStatuses,
		selectedTiers,
		sortField,
		sortDirection,
	]);

	const PAGE_SIZE = 100;
	const totalItems = filteredSortedData.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);

	const filterKey = [
		searchQuery,
		yearSelected,
		selectedInputModalities.join(","),
		selectedOutputModalities.join(","),
		selectedFeatures.join(","),
		selectedEndpoints.join(","),
		selectedStatuses.join(","),
		selectedTiers.join(","),
		sortField,
		sortDirection,
	].join("|");
	const prevFilterKey = useRef(filterKey);

	useEffect(() => {
		if (safePage !== page) {
			setPage(safePage);
		}
	}, [page, safePage, setPage]);

	useEffect(() => {
		if (prevFilterKey.current !== filterKey) {
			prevFilterKey.current = filterKey;
			if (page !== 1) {
				setPage(1);
			}
		}
	}, [filterKey, page, setPage]);

	const pageStart = (safePage - 1) * PAGE_SIZE;
	const pageData = filteredSortedData.slice(pageStart, pageStart + PAGE_SIZE);

	// Render model cell with links for org and model
	const renderModel = (
		model: string,
		organisationId?: string,
		modelId?: string,
	) => {
		return (
			<div className="flex items-center gap-2">
				{organisationId ? (
					<Link href={`/organisations/${organisationId}`}>
						<div className="w-8 h-8 relative flex items-center justify-center rounded-lg border cursor-pointer">
							<div className="w-6 h-6 relative">
								<Logo
									id={organisationId}
									alt="Organisation logo"
									className="object-contain"
									fill
								/>
							</div>
						</div>
					</Link>
				) : null}
				{modelId ? (
					<Link href={`/models/${modelId}`}>
						<span className="text-sm font-medium cursor-pointer">
							{model}
						</span>
					</Link>
				) : (
					<span className="text-sm font-medium">{model}</span>
				)}
			</div>
		);
	};
	const renderProvider = (provider: {
		name: string;
		id: string;
		inputPrice: number;
		outputPrice: number;
		features: string[];
	}) => {
		const isLinked = provider.id && provider.id !== "unlinked";

		const logo = (
			<div className="w-8 h-8 relative flex items-center justify-center rounded-lg border">
				<div className="w-6 h-6 relative">
					{isLinked ? (
						<Logo
							id={provider.id}
							alt={provider.name}
							className="object-contain"
							fill
						/>
					) : (
						<span className="text-xs text-muted-foreground">-</span>
					)}
				</div>
			</div>
		);

		const name = (
			<span className="text-sm">
				{provider.name && provider.name.toLowerCase() !== "unlinked"
					? provider.name
					: "-"}
			</span>
		);

		if (!isLinked) {
			return <span className="text-sm">-</span>;
		}

		return (
			<div className="flex items-center gap-2">
				<Link href={`/api-providers/${provider.id}`}>{logo}</Link>
				<Link href={`/api-providers/${provider.id}`}>{name}</Link>
			</div>
		);
	};

	const renderPrice = (price: number) => {
		return price > 0 ? `$${price.toFixed(2)}` : "-";
	};

	const renderModalities = (
		modalities: string[],
		type: "input" | "output",
	) => {
		return (
			<div className="flex flex-wrap gap-1 justify-center">
				{modalities.map((modality) => {
					const iconConfig =
						modalityIcons[modality as keyof typeof modalityIcons];
					if (!iconConfig) return null;

					const IconComponent =
						type === "input" ? iconConfig.input : iconConfig.output;
					if (!IconComponent) return null;

					// Convert text color to border/background color
					const colorMap: Record<string, string> = {
						"text-blue-600": "border-blue-600 bg-blue-50",
						"text-purple-600": "border-purple-600 bg-purple-50",
						"text-green-600": "border-green-600 bg-green-50",
						"text-orange-600": "border-orange-600 bg-orange-50",
						"text-red-600": "border-red-600 bg-red-50",
						"text-pink-600": "border-pink-600 bg-pink-50",
						"text-gray-600": "border-gray-600 bg-gray-50",
						"text-indigo-600": "border-indigo-600 bg-indigo-50",
						"text-cyan-600": "border-cyan-600 bg-cyan-50",
						"text-yellow-600": "border-yellow-600 bg-yellow-50",
					};

					const borderClass =
						colorMap[iconConfig.color] ||
						"border-gray-600 bg-gray-50";

					return (
						<Tooltip key={modality}>
							<TooltipTrigger asChild>
								<div
									className={`inline-flex items-center justify-center w-6 h-6 rounded border ${borderClass}`}
								>
									<IconComponent
										className={`h-4 w-4 ${iconConfig.color}`}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p className="capitalize">{modality}</p>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		);
	};

	const renderFeatures = (features: string[]) => {
		return (
			<div className="flex flex-wrap gap-1 justify-center">
				{features.map((feature) => {
					const rawKey = feature
						.trim()
						.toLowerCase()
						.replace(/\s+/g, "_");
					const key =
						rawKey === "native_web_search"
							? "web_search"
							: rawKey === "structured_output"
								? "structured_outputs"
								: rawKey;
					const iconConfig =
						featureIcons[key as keyof typeof featureIcons];
					if (!iconConfig) return null;

					const IconComponent = iconConfig.icon;
					if (!IconComponent) return null;

					// Convert text color to border/background color
					const colorMap: Record<string, string> = {
						"text-yellow-600": "border-yellow-600 bg-yellow-50",
						"text-indigo-600": "border-indigo-600 bg-indigo-50",
						"text-cyan-600": "border-cyan-600 bg-cyan-50",
						"text-emerald-600": "border-emerald-600 bg-emerald-50",
						"text-blue-500": "border-blue-500 bg-blue-50",
						"text-red-500": "border-red-500 bg-red-50",
					};

					const borderClass =
						colorMap[iconConfig.color] ||
						"border-gray-600 bg-gray-50";

					return (
						<Tooltip key={feature}>
							<TooltipTrigger asChild>
								<div
									className={`inline-flex items-center justify-center w-6 h-6 rounded border ${borderClass}`}
								>
									<IconComponent
										className={`h-4 w-4 ${iconConfig.color}`}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p>{featureLabels[key] ?? feature}</p>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		);
	};

	const renderStatus = (status: string) => {
		const iconConfig = statusIcons[status as keyof typeof statusIcons];
		if (!iconConfig)
			return <span className="text-muted-foreground">{status}</span>;

		const IconComponent = iconConfig.icon;

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="inline-flex items-center justify-center w-6 h-6">
						{IconComponent && (
							<IconComponent
								className={`h-4 w-4 ${iconConfig.color}`}
							/>
						)}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					<p className="capitalize">{status}</p>
				</TooltipContent>
			</Tooltip>
		);
	};

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString();
	};

	const formatEndpoint = (endpoint?: string) => {
		const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
		return trimmed ? trimmed : "-";
	};

	const getPaginationRange = (current: number, total: number, delta = 1) => {
		if (total <= 1) return [1];

		const range: Array<number | "ellipsis"> = [];
		const left = Math.max(2, current - delta);
		const right = Math.min(total - 1, current + delta);

		range.push(1);
		if (left > 2) range.push("ellipsis");
		for (let page = left; page <= right; page += 1) {
			range.push(page);
		}
		if (right < total - 1) range.push("ellipsis");
		range.push(total);

		return range;
	};

	const paginationRange = getPaginationRange(safePage, totalPages, 1);

	return (
		<TooltipProvider>
			<div className="space-y-4">
				{/* Table */}
				<div className="border rounded-lg relative overflow-x-auto">
					<Table className="min-w-full w-max">
						<TableHeader>
							<TableRow className="bg-background">
								<TableHead className="bg-background min-w-48 border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("model")}
										className="h-auto p-0 font-semibold"
									>
										Model {getSortIcon("model")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-32 border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("provider")}
										className="h-auto p-0 font-semibold"
									>
										Provider {getSortIcon("provider")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-40 border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("endpoint")}
										className="h-auto p-0 font-semibold"
									>
										Endpoint {getSortIcon("endpoint")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-16 border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("status")}
										className="h-auto p-0 font-semibold"
									>
										Gateway Status {getSortIcon("status")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("inputPrice")}
										className="h-auto p-0 font-semibold"
									>
										Input $ {getSortIcon("inputPrice")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("outputPrice")
										}
										className="h-auto p-0 font-semibold"
									>
										Output $ {getSortIcon("outputPrice")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-16 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("tier")}
										className="h-auto p-0 font-semibold"
									>
										Tier {getSortIcon("tier")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-32 text-center border border-gray-200 shadow-sm">
									<div className="font-semibold">
										Input Modalities
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-32 text-center border border-gray-200 shadow-sm">
									<div className="font-semibold">
										Output Modalities
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center border border-gray-200 shadow-sm">
									<div className="font-semibold">
										Features
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("context")}
										className="h-auto p-0 font-semibold"
									>
										Context {getSortIcon("context")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("maxOutput")}
										className="h-auto p-0 font-semibold"
									>
										Max Output {getSortIcon("maxOutput")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("added")}
										className="h-auto p-0 font-semibold"
									>
										Added {getSortIcon("added")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("retired")}
										className="h-auto p-0 font-semibold"
									>
										Retired {getSortIcon("retired")}
									</Button>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell
										colSpan={14}
										className="text-center py-8 border border-gray-200"
									>
										Loading...
									</TableCell>
								</TableRow>
							) : filteredSortedData.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={14}
										className="text-center py-8 border border-gray-200"
									>
										No models match the current filters
									</TableCell>
								</TableRow>
							) : (
								pageData.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="font-medium border border-gray-200">
											{renderModel(
												item.model,
												item.organisationId,
												item.modelId,
											)}
										</TableCell>
										<TableCell className="border border-gray-200">
											{renderProvider(item.provider)}
										</TableCell>
										<TableCell className="font-mono text-sm border border-gray-200">
											{formatEndpoint(item.endpoint)}
										</TableCell>
										<TableCell className="text-center border border-gray-200">
											{renderStatus(item.gatewayStatus)}
										</TableCell>
										<TableCell className="font-mono text-center border border-gray-200">
											{renderPrice(
												item.provider.inputPrice,
											)}
										</TableCell>
										<TableCell className="font-mono text-center border border-gray-200">
											{renderPrice(
												item.provider.outputPrice,
											)}
										</TableCell>
										<TableCell className="text-center border border-gray-200 capitalize">
											{item.tier || "standard"}
										</TableCell>
										<TableCell className="text-center border border-gray-200">
											{renderModalities(
												item.inputModalities,
												"input",
											)}
										</TableCell>
										<TableCell className="text-center border border-gray-200">
											{renderModalities(
												item.outputModalities,
												"output",
											)}
										</TableCell>
										<TableCell className="text-center border border-gray-200">
											{renderFeatures(
												item.provider.features,
											)}
										</TableCell>
										<TableCell className="font-mono text-center border border-gray-200">
											{item.context > 0
												? item.context.toLocaleString()
												: "-"}
										</TableCell>
										<TableCell className="font-mono text-center border border-gray-200">
											{item.maxOutput > 0
												? item.maxOutput.toLocaleString()
												: "-"}
										</TableCell>
										<TableCell className="text-sm text-center border border-gray-200">
											{item.added
												? formatDate(item.added)
												: "-"}
										</TableCell>
										<TableCell className="text-sm text-center border border-gray-200">
											{item.retired
												? formatDate(item.retired)
												: "-"}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
					<div>
						Showing {totalItems === 0 ? 0 : pageStart + 1}-
						{Math.min(pageStart + PAGE_SIZE, totalItems)} of{" "}
						{totalItems}
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(Math.max(1, safePage - 1))}
							disabled={safePage <= 1}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<div className="flex items-center gap-1">
							{paginationRange.map((entry, index) => {
								if (entry === "ellipsis") {
									return (
										<span
											key={`ellipsis-${index}`}
											className="px-2 text-muted-foreground"
										>
											…
										</span>
									);
								}
								const pageNumber = entry;
								const isActive = pageNumber === safePage;
								return (
									<Button
										key={pageNumber}
										variant={
											isActive ? "default" : "outline"
										}
										size="sm"
										onClick={() => setPage(pageNumber)}
										disabled={isActive}
										className="h-8 w-8 px-0"
									>
										{pageNumber}
									</Button>
								);
							})}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setPage(Math.min(totalPages, safePage + 1))
							}
							disabled={safePage >= totalPages}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
