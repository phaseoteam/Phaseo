import Link from "next/link";
import { redirect } from "next/navigation";
import { getProviderAudit } from "@/lib/fetchers/models/table-view/getProviderAudit";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
	title: "Provider Audit - Internal",
};

type SearchParams = {
	q?: string;
	provider?: string;
	gaps?: string;
};

function normalizeBool(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export default async function InternalProviderAuditPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const supabase = await createClient();
	const params = await searchParams;

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in");
	}

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		redirect("/internal");
	}

	const audit = await getProviderAudit();

	const query = (params.q ?? "").trim().toLowerCase();
	const selectedProvider = (params.provider ?? "").trim();
	const onlyGaps = normalizeBool(params.gaps);

	const providerOptions = audit.providers.map((provider) => ({
		providerId: provider.providerId,
		providerName: provider.providerName,
	}));

	const filteredProviders = audit.providers
		.map((provider) => {
			if (selectedProvider && provider.providerId !== selectedProvider) {
				return null;
			}

			const providerMatchesQuery = query.length > 0 &&
				(`${provider.providerName} ${provider.providerId}`).toLowerCase().includes(query);

			let rows = provider.rows;
			if (query && !providerMatchesQuery) {
				rows = rows.filter((row) => {
					const haystack = [
						row.apiModelId,
						row.internalModelId ?? "",
						row.providerModelSlug ?? "",
						row.capabilities.join(" "),
						row.gapReason ?? "",
					]
						.join(" ")
						.toLowerCase();
					return haystack.includes(query);
				});
			}

			if (onlyGaps) {
				rows = rows.filter((row) => row.isGatewayActiveNow && !row.hasPricing);
			}

			if (rows.length === 0) return null;

			const activeGatewayModels = rows.filter((row) => row.isGatewayActiveNow).length;
			const modelsWithPricing = rows.filter((row) => row.hasPricing).length;
			const activeWithoutPricing = rows.filter((row) => row.isGatewayActiveNow && !row.hasPricing).length;

			return {
				...provider,
				rows,
				totalModels: rows.length,
				activeGatewayModels,
				modelsWithPricing,
				activeWithoutPricing,
			};
		})
		.filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

	const filteredSummary = {
		totalProviders: filteredProviders.length,
		totalModels: filteredProviders.reduce((sum, provider) => sum + provider.totalModels, 0),
		activeGatewayModels: filteredProviders.reduce((sum, provider) => sum + provider.activeGatewayModels, 0),
		activeWithoutPricing: filteredProviders.reduce((sum, provider) => sum + provider.activeWithoutPricing, 0),
	};

	const filteredAlerts = filteredProviders
		.filter((provider) => provider.activeWithoutPricing > 0)
		.map((provider) => ({
			providerId: provider.providerId,
			providerName: provider.providerName,
			count: provider.activeWithoutPricing,
			models: provider.rows
				.filter((row) => row.isGatewayActiveNow && !row.hasPricing)
				.map((row) => row.apiModelId),
		}))
		.sort((a, b) => b.count - a.count);

	return (
		<div className="mx-8 py-8 space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Internal Provider Audit</h1>
					<p className="text-sm text-muted-foreground">
						Break down every provider by model coverage and pricing completeness.
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Link
						href="/internal/audit"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						Open Model Audit
					</Link>
					<Link
						href="/internal/data"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						Open Data Editor
					</Link>
				</div>
			</div>

			<form action="/internal/audit/providers" method="get" className="rounded-lg border p-4">
				<div className="grid gap-3 lg:grid-cols-4">
					<input
						name="q"
						defaultValue={params.q ?? ""}
						placeholder="Search provider, model, slug, or capability"
						className="w-full rounded-md border px-3 py-2 text-sm lg:col-span-2"
					/>
					<select
						name="provider"
						defaultValue={selectedProvider}
						className="w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="">All providers</option>
						{providerOptions.map((option) => (
							<option key={option.providerId} value={option.providerId}>
								{option.providerName}
							</option>
						))}
					</select>
					<label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<input type="checkbox" name="gaps" value="1" defaultChecked={onlyGaps} />
						Only active gaps (no pricing)
					</label>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90">
						Apply
					</button>
					<Link href="/internal/audit/providers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
						Clear
					</Link>
				</div>
			</form>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">Providers</div>
					<div className="text-2xl font-semibold">{filteredSummary.totalProviders}</div>
				</div>
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">Provider Models</div>
					<div className="text-2xl font-semibold">{filteredSummary.totalModels}</div>
				</div>
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">Gateway Active (Now)</div>
					<div className="text-2xl font-semibold">{filteredSummary.activeGatewayModels}</div>
				</div>
				<div className="rounded-md border border-red-200 px-4 py-3">
					<div className="text-xs text-muted-foreground">Active Without Pricing</div>
					<div className="text-2xl font-semibold text-red-700">{filteredSummary.activeWithoutPricing}</div>
				</div>
			</div>

			{filteredAlerts.length > 0 ? (
				<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
					<div className="text-sm font-medium text-red-700">
						Pricing Gaps: {filteredAlerts.reduce((sum, alert) => sum + alert.count, 0)} active provider-models missing pricing rules.
					</div>
					<div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{filteredAlerts.map((alert) => (
							<Link
								key={alert.providerId}
								href={`/internal/audit/providers?provider=${encodeURIComponent(alert.providerId)}&gaps=1`}
								className="rounded border border-red-200 bg-white px-3 py-2 text-sm hover:bg-red-50"
							>
								<div className="font-medium">{alert.providerName}</div>
								<div className="text-xs text-muted-foreground">
									{alert.count} gap{alert.count === 1 ? "" : "s"}
								</div>
							</Link>
						))}
					</div>
				</div>
			) : (
				<div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
					No active provider-model pricing gaps found for the current filters.
				</div>
			)}

			{filteredProviders.length === 0 ? (
				<div className="rounded-md border px-4 py-6 text-sm text-muted-foreground">
					No providers matched the current filters.
				</div>
			) : (
				filteredProviders.map((provider) => (
					<section key={provider.providerId} className="rounded-lg border">
						<div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="text-lg font-semibold">{provider.providerName}</h2>
								<div className="font-mono text-xs text-muted-foreground">{provider.providerId}</div>
							</div>
							<div className="flex flex-wrap gap-2 text-xs">
								<span className="rounded border px-2 py-1">Models: {provider.totalModels}</span>
								<span className="rounded border px-2 py-1">Active Now: {provider.activeGatewayModels}</span>
								<span className="rounded border px-2 py-1">With Pricing: {provider.modelsWithPricing}</span>
								<span className="rounded border border-red-200 px-2 py-1 text-red-700">
									Active Gaps: {provider.activeWithoutPricing}
								</span>
							</div>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full min-w-[980px] text-sm">
								<thead className="bg-muted/40 text-left">
									<tr>
										<th className="px-3 py-2">API Model ID</th>
										<th className="px-3 py-2">Internal Model ID</th>
										<th className="px-3 py-2">Provider Slug</th>
										<th className="px-3 py-2">Gateway</th>
										<th className="px-3 py-2">Pricing Rules (Active/Total)</th>
										<th className="px-3 py-2">Capabilities</th>
										<th className="px-3 py-2">Actions</th>
									</tr>
								</thead>
								<tbody>
									{provider.rows.map((row) => {
										const isGap = row.isGatewayActiveNow && !row.hasPricing;
										return (
											<tr key={`${provider.providerId}:${row.apiModelId}`} className={isGap ? "bg-red-50" : ""}>
												<td className="border-t px-3 py-2 font-mono text-xs">{row.apiModelId}</td>
												<td className="border-t px-3 py-2 font-mono text-xs">
													{row.internalModelId ?? "-"}
												</td>
												<td className="border-t px-3 py-2 font-mono text-xs">
													{row.providerModelSlug ?? "-"}
												</td>
												<td className="border-t px-3 py-2">
													{row.isGatewayActiveNow ? (
														<span className="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
															Active Now
														</span>
													) : row.isGatewayEnabled ? (
														<span className="rounded border px-2 py-1 text-xs text-muted-foreground">
															Enabled (Not Current)
														</span>
													) : (
														<span className="rounded border px-2 py-1 text-xs text-muted-foreground">
															Inactive
														</span>
													)}
												</td>
												<td className="border-t px-3 py-2">
													<div className="flex items-center gap-2">
														<span className={row.hasPricing ? "text-green-700" : "text-red-700"}>
															{row.pricingRulesCount}/{row.totalPricingRulesCount}
														</span>
														{isGap ? (
															<span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
																Gap
															</span>
														) : null}
													</div>
													{isGap && row.gapReason ? (
														<div className="mt-1 text-xs text-red-700">{row.gapReason}</div>
													) : null}
												</td>
												<td className="border-t px-3 py-2">
													<div className="max-w-[340px] truncate text-xs text-muted-foreground">
														{row.capabilities.length > 0 ? row.capabilities.join(", ") : "-"}
													</div>
												</td>
												<td className="border-t px-3 py-2">
													<div className="flex flex-wrap gap-2">
														<Link
															href={`/internal/data/api-providers/${provider.providerId}/edit`}
															className="rounded border px-2 py-1 text-xs hover:bg-muted/40"
														>
															Provider
														</Link>
														{row.internalModelId ? (
															<Link
																href={`/internal/data/models/edit/${row.internalModelId}?tab=providers&provider=${encodeURIComponent(provider.providerId)}`}
																className="rounded border px-2 py-1 text-xs hover:bg-muted/40"
															>
																Model Provider
															</Link>
														) : null}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</section>
				))
			)}
		</div>
	);
}
