import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/client";
import { Calendar, Sparkles, TrendingUp, Check } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type OrganisationRow = {
	name?: string | null;
	organisation_id?: string | null;
};

type DataModelRelation = {
	name?: string | null;
	organisation_id?: string | null;
	organisation?: OrganisationRow | OrganisationRow[] | null;
};

type RecentModel = {
	model_id: string;
	api_model_id: string;
	created_at: string;
	is_active_gateway: boolean;
	data_models?: DataModelRelation | DataModelRelation[] | null;
};

function isoSevenDaysAgo(from = new Date()): string {
	const d = new Date(from);
	d.setUTCDate(d.getUTCDate() - 7);
	return d.toISOString();
}

async function getRecentModels(
	apiProviderId: string,
	opts?: { sinceTs?: string; limit?: number }
): Promise<RecentModel[]> {
	const supabase = createClient();
	const limit = opts?.limit ?? 5;

	try {
		let q = supabase
			.from("data_api_provider_models")
			.select(
				"internal_model_id, api_model_id, created_at, is_active_gateway"
			)
			.eq("provider_id", apiProviderId)
			.order("created_at", { ascending: false })
			.limit(limit);

		if (opts?.sinceTs) q = q.gte("created_at", opts.sinceTs);

		const { data: providerModels, error } = await q;

		if (error) {
			console.error("Error fetching recent models:", error);
			return [];
		}

		const modelIds = Array.from(
			new Set(
				(providerModels ?? [])
					.map((row) => row.internal_model_id)
					.filter(Boolean)
			)
		);
		const { data: models } = await supabase
			.from("data_models")
			.select(
				"model_id, name, organisation_id, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)"
			)
			.in("model_id", modelIds);

		const modelMap = new Map<string, DataModelRelation>();
		for (const model of models ?? []) {
			if (!model.model_id) continue;
			modelMap.set(model.model_id, {
				name: model.name ?? null,
				organisation_id: model.organisation_id ?? null,
				organisation: model.organisation ?? null,
			});
		}

		return (providerModels ?? []).map((row: any) => ({
			model_id: row.internal_model_id,
			api_model_id: row.api_model_id,
			created_at: row.created_at,
			is_active_gateway: row.is_active_gateway,
			data_models: row.internal_model_id
				? modelMap.get(row.internal_model_id) ?? null
				: null,
		})) as RecentModel[];
	} catch (err) {
		console.error("Unexpected error fetching recent models:", err);
		return [];
	}
}

async function getRecentTokenCount(
	apiProviderId: string,
	sinceTs: string
): Promise<number> {
	const supabase = createAdminClient();

	try {
		const { data, error } = await supabase.rpc("get_provider_token_usage", {
			provider_id: apiProviderId,
			since_ts: sinceTs,
		});

		if (error) {
			console.error("Error fetching recent token usage:", error);
			return 0;
		}

		const row = (data && data[0]) || null;
		return Number(row?.total_tokens ?? 0);
	} catch (err) {
		console.error("Unexpected error fetching recent token usage:", err);
		return 0;
	}
}

export default async function Updates({
	apiProviderId,
}: {
	apiProviderId: string;
}) {
	const now = new Date(); // one stable timestamp for this render
	const sinceTs = isoSevenDaysAgo(now);

	const [recentModels, newModels, recentTokens] = await Promise.all([
		getRecentModels(apiProviderId, { limit: 5 }),
		getRecentModels(apiProviderId, { sinceTs, limit: 5 }),
		getRecentTokenCount(apiProviderId, sinceTs),
	]);

	const latestModelDisplay =
		recentModels.length > 0
			? resolveModelDisplayInfo(recentModels[0])
			: undefined;
	const latestModelDate =
		recentModels.length > 0
			? formatModelDate(recentModels[0].created_at)
			: undefined;

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
			<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
				<div className="mb-4">
					<h3 className="text-lg font-semibold mb-2">New Models</h3>
					<p className="text-sm text-muted-foreground">
						Recently added models with gateway availability status.
					</p>
				</div>
				{newModels.length > 0 ? (
					<div className="space-y-3">
						{newModels.map((model) => {
							const display = resolveModelDisplayInfo(model);
							const formattedDate = formatModelDate(
								model.created_at
							);

							return (
								<div
									key={model.api_model_id}
									className="border border-gray-200 dark:border-gray-700 bg-background rounded-lg p-4 transition hover:border-blue-500 dark:hover:border-blue-400"
								>
									<div className="flex items-start justify-between gap-6">
										<div className="flex-1 space-y-1">
											<div className="flex items-center gap-2">
												<p className="font-semibold text-sm leading-tight">
													{display.name}
												</p>
												{model.is_active_gateway && (
													<Tooltip>
														<TooltipTrigger asChild>
															<Check className="h-4 w-4 text-green-600" />
														</TooltipTrigger>
														<TooltipContent>
															Available on Gateway
														</TooltipContent>
													</Tooltip>
												)}
											</div>
											{display.organisationName && (
												<p className="text-xs text-muted-foreground">
													{display.organisationName}
												</p>
											)}
										</div>
										<div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
											<span className="text-[11px] font-semibold uppercase tracking-wide">
												Added
											</span>
											<span className="text-sm font-medium text-foreground">
												{formattedDate}
											</span>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="py-8">
						<Empty size="compact">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Sparkles className="h-5 w-5" />
								</EmptyMedia>
								<EmptyTitle>No New Models</EmptyTitle>
								<EmptyDescription>
									New models will appear here when added to
									the platform.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				)}
			</div>

			<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
				<div className="mb-4">
					<h3 className="text-lg font-semibold mb-2">
						Recent Activity
					</h3>
					<p className="text-sm text-muted-foreground">
						Usage statistics and model availability overview.
					</p>
				</div>
				<div className="space-y-6">
					{/* Token count */}
					<div className="text-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
						<div className="text-3xl font-bold mb-1">
							{recentTokens.toLocaleString()}
						</div>
						<p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
							<TrendingUp className="h-3 w-3" />
							Tokens in last 7 days
						</p>
					</div>

					{/* Model count */}
					<div className="text-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
						<div className="text-2xl font-bold mb-1">
							{recentModels.length}
						</div>
						<p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
							<Sparkles className="h-3 w-3" />
							Total models available
						</p>
					</div>

					{/* Latest model */}
					{recentModels.length > 0 && (
						<div className="pt-2 border-t border-gray-200 dark:border-gray-700">
							<p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
								<Calendar className="h-3 w-3" />
								Latest model added:
							</p>
							<div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="text-sm font-semibold mb-1">
											<Link
												href={`/models/${recentModels[0].model_id}`}
												className="hover:text-primary transition-colors"
											>
												<span className="relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
													{latestModelDisplay?.name ??
														recentModels[0]
															.model_id}
												</span>
											</Link>
										</p>
										{latestModelDisplay?.organisationName && (
											<p className="text-xs text-muted-foreground">
												{latestModelDisplay.organisationId ? (
													<Link
														href={`/organisations/${latestModelDisplay.organisationId}`}
														className="text-xs hover:text-primary transition-colors"
													>
														<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
															{
																latestModelDisplay.organisationName
															}
														</span>
													</Link>
												) : (
													<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
														{
															latestModelDisplay.organisationName
														}
													</span>
												)}
											</p>
										)}
									</div>
									<div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
										<span className="text-[11px] font-semibold uppercase tracking-wide">
											Added
										</span>
										<span className="text-sm font-semibold text-foreground">
											{latestModelDate}
										</span>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

type ModelDisplayInfo = {
	name: string;
	organisationName?: string;
	organisationId?: string;
};

function resolveModelDisplayInfo(model: RecentModel): ModelDisplayInfo {
	const relatedModel = Array.isArray(model.data_models)
		? model.data_models[0]
		: model.data_models;
	const nestedOrg = Array.isArray(relatedModel?.organisation)
		? relatedModel?.organisation[0]
		: relatedModel?.organisation;

	const organisationId =
		nestedOrg?.organisation_id ??
		relatedModel?.organisation_id ??
		undefined;

	let name = relatedModel?.name ?? model.model_id;
	if (model.api_model_id?.endsWith(":free")) {
		name += " (free)";
	}

	return {
		name,
		organisationName: nestedOrg?.name ?? undefined,
		organisationId,
	};
}

function formatModelDate(timestamp: string): string {
	return new Date(timestamp).toLocaleDateString("en-GB", { timeZone: "UTC" });
}
