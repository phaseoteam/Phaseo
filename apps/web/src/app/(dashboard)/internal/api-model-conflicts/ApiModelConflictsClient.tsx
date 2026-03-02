"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, GitCompare, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ApiModelConflictsSnapshot } from "@/lib/internal/apiModelConflicts";

type ApiModelConflictsClientProps = {
	snapshot: ApiModelConflictsSnapshot;
};

function formatTimestamp(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export default function ApiModelConflictsClient({
	snapshot,
}: ApiModelConflictsClientProps) {
	const [query, setQuery] = useState("");
	const [providerFilter, setProviderFilter] = useState<string>("all");
	const [conflictsOnly, setConflictsOnly] = useState(false);
	const [missingPricingOnly, setMissingPricingOnly] = useState(false);
	const [likelyMismatchOnly, setLikelyMismatchOnly] = useState(false);

	const providerOptions = useMemo(() => {
		return Array.from(
			new Set(snapshot.entries.map((entry) => entry.providerId)),
		).sort((a, b) => a.localeCompare(b));
	}, [snapshot.entries]);

	const filteredEntries = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return snapshot.entries
			.filter((entry) => {
				if (providerFilter !== "all" && entry.providerId !== providerFilter) {
					return false;
				}
				if (conflictsOnly && !entry.hasPotentialAliasConflict) {
					return false;
				}
				if (missingPricingOnly && entry.missingPricingCapabilities.length === 0) {
					return false;
				}
				if (likelyMismatchOnly && entry.likelyMismatchPricingSlugs.length === 0) {
					return false;
				}
				if (!normalizedQuery) return true;

				const haystack = [
					entry.providerId,
					entry.apiModelId,
					entry.providerApiModelId,
					entry.internalModelId ?? "",
					entry.canonicalKey,
					entry.conflictApiModelIds.join(" "),
				]
					.join(" ")
					.toLowerCase();
				return haystack.includes(normalizedQuery);
			})
			.sort((a, b) => {
				if (
					a.likelyMismatchPricingSlugs.length !==
					b.likelyMismatchPricingSlugs.length
				) {
					return (
						b.likelyMismatchPricingSlugs.length - a.likelyMismatchPricingSlugs.length
					);
				}
				if (
					a.missingPricingCapabilities.length !== b.missingPricingCapabilities.length
				) {
					return (
						b.missingPricingCapabilities.length - a.missingPricingCapabilities.length
					);
				}
				if (a.providerId !== b.providerId) {
					return a.providerId.localeCompare(b.providerId);
				}
				return a.apiModelId.localeCompare(b.apiModelId);
			});
	}, [
		conflictsOnly,
		likelyMismatchOnly,
		missingPricingOnly,
		providerFilter,
		query,
		snapshot.entries,
	]);

	const filteredConflictGroups = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return snapshot.conflictGroups
			.filter((group) => {
				if (
					providerFilter !== "all" &&
					!group.providers.includes(providerFilter)
				) {
					return false;
				}
				if (!normalizedQuery) return true;
				const haystack = [
					group.canonicalKey,
					group.apiModelIds.join(" "),
					group.providers.join(" "),
				]
					.join(" ")
					.toLowerCase();
				return haystack.includes(normalizedQuery);
			})
			.sort((a, b) => {
				if (b.entryCount !== a.entryCount) return b.entryCount - a.entryCount;
				return a.canonicalKey.localeCompare(b.canonicalKey);
			});
	}, [providerFilter, query, snapshot.conflictGroups]);

	const likelyMismatches = useMemo(
		() => filteredEntries.filter((entry) => entry.likelyMismatchPricingSlugs.length > 0),
		[filteredEntries],
	);

	const filteredOrphans = useMemo(() => {
		return snapshot.orphanPricingByProvider
			.filter((provider) => {
				if (providerFilter === "all") return true;
				return provider.providerId === providerFilter;
			})
			.sort((a, b) => a.providerId.localeCompare(b.providerId));
	}, [providerFilter, snapshot.orphanPricingByProvider]);

	const hasActiveFilters =
		query.trim().length > 0 ||
		providerFilter !== "all" ||
		conflictsOnly ||
		missingPricingOnly ||
		likelyMismatchOnly;

	const visibleRows = filteredEntries.slice(0, 500);

	return (
		<div className="mx-8 py-8 space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold">API Model Conflict Inspector</h1>
				<p className="text-sm text-muted-foreground">
					Compare provider API model IDs, detect likely aliases, and spot model-to-pricing
					mismatches.
				</p>
				<p className="text-xs text-muted-foreground">
					Generated: {formatTimestamp(snapshot.generatedAt)}
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Provider Models</CardDescription>
						<CardTitle className="text-2xl">
							{snapshot.totals.providerModels}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Potential Alias Conflicts</CardDescription>
						<CardTitle className="text-2xl">
							{snapshot.totals.conflictGroups}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Missing Pricing Rows</CardDescription>
						<CardTitle className="text-2xl text-amber-700">
							{snapshot.totals.modelsWithMissingPricing}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Likely Model/Pricing Mismatches</CardDescription>
						<CardTitle className="text-2xl text-red-700">
							{snapshot.totals.likelyMismatchRows}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Filters</CardTitle>
					<CardDescription>
						Narrow by provider or focus only on conflict and pricing issues.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 lg:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="api-model-conflicts-search">Search</Label>
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									id="api-model-conflicts-search"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="provider, model id, internal id, canonical key..."
									className="pl-9"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="api-model-conflicts-provider">Provider</Label>
							<Select value={providerFilter} onValueChange={setProviderFilter}>
								<SelectTrigger id="api-model-conflicts-provider">
									<SelectValue placeholder="All providers" />
								</SelectTrigger>
								<SelectContent className="max-h-80">
									<SelectItem value="all">All providers</SelectItem>
									{providerOptions.map((providerId) => (
										<SelectItem key={providerId} value={providerId}>
											{providerId}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-6">
						<label className="flex items-center gap-2 text-sm">
							<Switch checked={conflictsOnly} onCheckedChange={setConflictsOnly} />
							<span>Conflicts only</span>
						</label>
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={missingPricingOnly}
								onCheckedChange={setMissingPricingOnly}
							/>
							<span>Missing pricing only</span>
						</label>
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={likelyMismatchOnly}
								onCheckedChange={setLikelyMismatchOnly}
							/>
							<span>Likely mismatch only</span>
						</label>

						{hasActiveFilters ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setQuery("");
									setProviderFilter("all");
									setConflictsOnly(false);
									setMissingPricingOnly(false);
									setLikelyMismatchOnly(false);
								}}
							>
								Clear Filters
							</Button>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Likely Mismatches</CardTitle>
					<CardDescription>
						Rows with missing pricing where an orphan pricing directory in the same provider
						looks like the same model family.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Provider</TableHead>
									<TableHead>API Model</TableHead>
									<TableHead>Missing Pricing</TableHead>
									<TableHead>Candidate Pricing Slugs</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{likelyMismatches.length === 0 ? (
									<TableRow>
										<TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
											No likely mismatches for current filters.
										</TableCell>
									</TableRow>
								) : (
									likelyMismatches.slice(0, 200).map((entry) => (
										<TableRow key={`${entry.providerApiModelId}-likely`}>
											<TableCell className="font-mono text-xs">{entry.providerId}</TableCell>
											<TableCell className="font-mono text-xs">{entry.apiModelId}</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{entry.missingPricingCapabilities.map((capabilityId) => (
														<Badge key={capabilityId} variant="destructive">
															{capabilityId}
														</Badge>
													))}
												</div>
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{entry.likelyMismatchPricingSlugs.map((slug) => (
														<Badge key={slug} variant="outline" className="font-mono text-xs">
															{slug}
														</Badge>
													))}
												</div>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Potential Alias Conflict Groups</CardTitle>
					<CardDescription>
						Canonicalized model IDs where multiple raw API model IDs appear to represent the
						same family.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Canonical Key</TableHead>
									<TableHead>Variants</TableHead>
									<TableHead>Providers</TableHead>
									<TableHead>Issues</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredConflictGroups.length === 0 ? (
									<TableRow>
										<TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
											No conflict groups for current filters.
										</TableCell>
									</TableRow>
								) : (
									filteredConflictGroups.slice(0, 200).map((group) => (
										<TableRow key={group.canonicalKey}>
											<TableCell className="font-mono text-xs">{group.canonicalKey}</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{group.apiModelIds.map((apiModelId) => (
														<Badge key={apiModelId} variant="outline" className="font-mono text-xs">
															{apiModelId}
														</Badge>
													))}
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs">
												{group.providers.join(", ")}
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap items-center gap-2">
													<Badge variant="secondary">{group.entryCount} rows</Badge>
													{group.missingPricingCount > 0 ? (
														<Badge variant="destructive">
															{group.missingPricingCount} missing pricing
														</Badge>
													) : null}
													{group.likelyMismatchCount > 0 ? (
														<Badge variant="outline" className="border-amber-500 text-amber-700">
															{group.likelyMismatchCount} likely mismatch
														</Badge>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Provider API Model Rows</CardTitle>
					<CardDescription>
						Showing {visibleRows.length} of {filteredEntries.length} matching rows.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="overflow-x-auto rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Provider</TableHead>
									<TableHead>API Model ID</TableHead>
									<TableHead>Internal Model</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Pricing Coverage</TableHead>
									<TableHead>Conflict</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visibleRows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
											No rows match the current filters.
										</TableCell>
									</TableRow>
								) : (
									visibleRows.map((entry) => (
										<TableRow key={entry.providerApiModelId}>
											<TableCell className="font-mono text-xs">
												<Link href={`/api-providers/${entry.providerId}/models`} className="underline">
													{entry.providerId}
												</Link>
											</TableCell>
											<TableCell className="font-mono text-xs">{entry.apiModelId}</TableCell>
											<TableCell className="font-mono text-xs">
												{entry.internalModelId ?? "-"}
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap items-center gap-2">
													{entry.isActiveGateway ? (
														<Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
															Gateway Active
														</Badge>
													) : (
														<Badge variant="secondary">Gateway Inactive</Badge>
													)}
													<Badge variant="outline">
														{entry.activeCapabilities.length} capabilities
													</Badge>
													<Badge variant="outline">
														{entry.supportedParams.length} params
													</Badge>
												</div>
											</TableCell>
											<TableCell>
												{entry.missingPricingCapabilities.length === 0 ? (
													<div className="flex items-center gap-2 text-emerald-700">
														<CheckCircle2 className="h-4 w-4" />
														<span className="text-sm">Complete</span>
													</div>
												) : (
													<div className="space-y-2">
														<div className="flex flex-wrap gap-1">
															{entry.missingPricingCapabilities.map((capabilityId) => (
																<Badge key={capabilityId} variant="destructive">
																	{capabilityId}
																</Badge>
															))}
														</div>
														{entry.likelyMismatchPricingSlugs.length > 0 ? (
															<div className="flex items-start gap-1 text-amber-700">
																<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
																<div className="text-xs">
																	Candidate slug(s):{" "}
																	{entry.likelyMismatchPricingSlugs.join(", ")}
																</div>
															</div>
														) : null}
													</div>
												)}
											</TableCell>
											<TableCell>
												{entry.hasPotentialAliasConflict ? (
													<div className="space-y-2">
														<div className="flex items-center gap-2 text-amber-700">
															<GitCompare className="h-4 w-4" />
															<span className="text-sm">
																{entry.conflictApiModelIds.length} variants
															</span>
														</div>
														<div className="flex flex-wrap gap-1">
															{entry.conflictApiModelIds.slice(0, 6).map((apiModelId) => (
																<Badge
																	key={`${entry.providerApiModelId}-${apiModelId}`}
																	variant="outline"
																	className="font-mono text-xs"
																>
																	{apiModelId}
																</Badge>
															))}
															{entry.conflictApiModelIds.length > 6 ? (
																<Badge variant="outline">
																	+{entry.conflictApiModelIds.length - 6}
																</Badge>
															) : null}
														</div>
													</div>
												) : (
													<span className="text-sm text-muted-foreground">No conflict</span>
												)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{filteredEntries.length > visibleRows.length ? (
						<p className="text-xs text-muted-foreground">
							Only the first 500 rows are shown. Refine filters to inspect additional rows.
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Orphan Pricing Directories</CardTitle>
					<CardDescription>
						Pricing model folders present under `src/data/pricing` that do not map to any
						provider API model ID slug.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{filteredOrphans.length === 0 ? (
						<p className="text-sm text-muted-foreground">No orphan pricing directories.</p>
					) : (
						filteredOrphans.map((provider) => (
							<div key={provider.providerId} className="rounded-md border p-3">
								<div className="mb-2 flex items-center gap-2">
									<Badge variant="outline" className="font-mono text-xs">
										{provider.providerId}
									</Badge>
									<Badge variant="secondary">
										{provider.orphanModelSlugs.length} orphan slug
										{provider.orphanModelSlugs.length === 1 ? "" : "s"}
									</Badge>
								</div>
								<div className="flex flex-wrap gap-1">
									{provider.orphanModelSlugs.map((slug) => (
										<Badge key={`${provider.providerId}-${slug}`} variant="outline" className="font-mono text-xs">
											{slug}
										</Badge>
									))}
								</div>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}
