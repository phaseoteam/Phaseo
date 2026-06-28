import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Badge } from "@/components/ui/badge";
import {
	Megaphone,
	Rocket,
	Ban,
	Archive,
	CircleQuestionMark,
	ShieldAlert,
	KeyRound,
} from "lucide-react";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import type { OrganisationOverview as OrganisationPage } from "@/lib/fetchers/organisations/getOrganisation";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipProvider,
} from "@/components/ui/tooltip";
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyMedia,
} from "@/components/ui/empty";

interface ModelsDisplayProps {
	models: ModelCardType[];
	showStatusHeadings?: boolean;
}

// Local alias for models that might include status & dates
type DisplayModel = ModelCardType & {
	status?: string | null;
	release_date?: string | null;
	announcement_date?: string | null;
};

export default function ModelsDisplay({
	models,
	showStatusHeadings = true,
}: ModelsDisplayProps) {
	if (!models || models.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Megaphone size={24} />
					</EmptyMedia>
					<EmptyTitle>No models found</EmptyTitle>
					<EmptyDescription>
						There are no models to display for this organisation.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	if (!showStatusHeadings) {
		return (
			<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				{sortModels(models as DisplayModel[]).map((model) => (
					<div key={model.model_id}>
						<ModelCard model={model} />
					</div>
				))}
			</div>
		);
	}

	// Group models by status using model.status
	const rumoured: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Rumoured"
	);
	const available: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Available"
	);
	const announced: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Announced"
	);
	const limitedAccess: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Limited Access"
	);
	const withheld: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Withheld"
	);
	const deprecated: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Deprecated"
	);
	const retired: DisplayModel[] = models.filter(
		(m: DisplayModel) => m.status === "Retired"
	);
	// Models with missing or unrecognised status
	const unknown: DisplayModel[] = models.filter(
		(m: DisplayModel) =>
			![
				"Rumoured",
				"Available",
				"Announced",
				"Limited Access",
				"Withheld",
				"Deprecated",
				"Retired",
			].includes(m.status ?? "")
	);

	// Sort each group by most recent (announced or released)
	function sortModels(arr: DisplayModel[]) {
		const getTimestamp = (model: DisplayModel) =>
			model.primary_timestamp ?? 0;
		return [...arr].sort(
			(a, b) => getTimestamp(b) - getTimestamp(a)
		);
	}

	// Badge components for section headers
	const SectionBadge = ({ status }: { status: string }) => {
		if (status === "Rumoured") {
			return (
				<Badge className="bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 text-xs flex items-center gap-1 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 transition-colors hover:bg-blue-200 hover:border-blue-400 dark:hover:bg-blue-900 dark:hover:border-blue-500">
					<Megaphone size={14} className="mr-1" />
					Rumoured
				</Badge>
			);
		}
		if (status === "Announced") {
			return (
				<Badge className="bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:hover:border-blue-700">
					<Megaphone size={14} className="mr-1" />
					Announced
				</Badge>
			);
		}
		if (status === "Withheld") {
			return (
				<Badge className="bg-violet-100 text-violet-800 border border-violet-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800 dark:hover:bg-violet-900 dark:hover:text-violet-200 dark:hover:border-violet-700">
					<ShieldAlert size={14} className="mr-1" />
					Withheld
				</Badge>
			);
		}
		if (status === "Limited Access") {
			return (
				<Badge className="bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800 dark:hover:bg-fuchsia-900 dark:hover:text-fuchsia-200 dark:hover:border-fuchsia-700">
					<KeyRound size={14} className="mr-1" />
					Limited Access
				</Badge>
			);
		}
		if (status === "Available") {
			return (
				<Badge className="bg-green-100 text-green-800 border border-green-300 px-2 py-1 text-xs flex items-center gap-1 dark:bg-green-950 dark:text-green-300 dark:border-green-800 transition-colors hover:bg-green-200 hover;border-green-400 dark:hover:bg-green-900 dark:hover:border-green-500">
					<Rocket size={14} className="mr-1" />
					Available
				</Badge>
			);
		}
		if (status === "Deprecated") {
			return (
				<Badge className="bg-red-100 text-red-800 border border-red-300 px-2 py-1 text-xs flex items-center gap-1 dark:bg-red-950 dark:text-red-300 dark:border-red-800 transition-colors hover:bg-red-200 hover:border-red-400 dark:hover:bg-red-900 dark:hover:border-red-500">
					<Ban size={14} className="mr-1" />
					Deprecated
				</Badge>
			);
		}
		if (status === "Retired") {
			return (
				<Badge className="bg-zinc-300 text-zinc-800 border border-zinc-400 px-2 py-1 text-xs flex items-center gap-1 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 transition-colors hover:bg-zinc-400 hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:border-zinc-500">
					<Archive size={14} className="mr-1" />
					Retired
				</Badge>
			);
		}
		if (status === "Unknown Status") {
			return (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 text-xs flex items-center gap-1 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 transition-colors hover:bg-amber-200 hover:border-amber-400 dark:hover:bg-amber-900 dark:hover:border-amber-500">
								<CircleQuestionMark
									size={14}
									className="mr-1"
								/>
								Unknown Status
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							These models do not have a status recorded in the
							database, so their lifecycle state is unknown.
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		}
		return null;
	};

	// Render section if models exist
	function renderSection(title: string, group: DisplayModel[]) {
		if (!group || group.length === 0) return null;
		return (
			<div className="mb-8">
				<div className="flex items-center gap-2 mb-3">
					<SectionBadge status={title} />
					<span className="text-base font-semibold">
						{title} Models
					</span>
				</div>
				<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
					{sortModels(group).map((model) => (
						<div key={model.model_id}>
							<ModelCard model={model} />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div>
			{showStatusHeadings && renderSection("Rumoured", rumoured)}
			{showStatusHeadings && renderSection("Available", available)}
			{showStatusHeadings && renderSection("Announced", announced)}
			{showStatusHeadings && renderSection("Limited Access", limitedAccess)}
			{showStatusHeadings && renderSection("Withheld", withheld)}
			{showStatusHeadings && renderSection("Deprecated", deprecated)}
			{showStatusHeadings && renderSection("Retired", retired)}
			{showStatusHeadings && renderSection("Unknown Status", unknown)}
		</div>
	);
}
