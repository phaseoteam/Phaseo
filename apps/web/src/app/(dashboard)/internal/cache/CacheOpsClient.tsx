"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	revalidateAppsDataAction,
	revalidateBenchmarkScopeAction,
	revalidateCountryDataAction,
	revalidateCustomScopeAction,
	revalidateLandingDataAction,
	revalidateModelScopeAction,
	revalidateOrganisationScopeAction,
	revalidateProfileDataAction,
	revalidateProviderScopeAction,
	revalidatePublicModelCatalogueAction,
	revalidateRankingsAction,
	revalidateSearchDataAction,
	revalidateSubscriptionPlansAction,
} from "./actions";

type StatusState = {
	ok: boolean;
	message: string;
} | null;

export default function CacheOpsClient() {
	const [isPending, startTransition] = useTransition();
	const [status, setStatus] = useState<StatusState>(null);
	const [modelId, setModelId] = useState("");
	const [benchmarkId, setBenchmarkId] = useState("");
	const [providerId, setProviderId] = useState("");
	const [organisationId, setOrganisationId] = useState("");
	const [appId, setAppId] = useState("");
	const [countryIso, setCountryIso] = useState("");
	const [profileSlug, setProfileSlug] = useState("");
	const [customTagsText, setCustomTagsText] = useState("");
	const [customPathsText, setCustomPathsText] = useState("");

	function runAction(action: () => Promise<{ ok: boolean; message: string }>) {
		setStatus(null);
		startTransition(async () => {
			const result = await action();
			setStatus(result);
		});
	}

	return (
		<div className="container mx-auto space-y-6 py-8">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Cache Ops</h1>
					<p className="text-sm text-muted-foreground">
						Revalidate production cache surfaces without redeploying.
					</p>
				</div>
				<div className="flex gap-2">
					<Link href="/internal" className="rounded-md border px-3 py-2 text-sm">
						Back to Internal
					</Link>
					<Link href="/internal/data" className="rounded-md border px-3 py-2 text-sm">
						Data Editor
					</Link>
				</div>
			</div>

			{status ? (
				<p
					className={
						status.ok
							? "rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700"
							: "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
					}
				>
					{status.message}
				</p>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Per-model revalidation</CardTitle>
					<CardDescription>
						Target one model ID for data-only, API-only, or full invalidation.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={modelId}
						onChange={(event) => setModelId(event.target.value)}
						placeholder="minimax/minimax-m2-7-2026-03-18"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() =>
								runAction(() =>
									revalidateModelScopeAction({ modelId, scope: "data" })
								)
							}
						>
							Revalidate Model Data
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() =>
								runAction(() =>
									revalidateModelScopeAction({ modelId, scope: "api" })
								)
							}
						>
							Revalidate Model API
						</Button>
						<Button
							type="button"
							disabled={isPending}
							onClick={() =>
								runAction(() =>
									revalidateModelScopeAction({ modelId, scope: "all" })
								)
							}
						>
							Revalidate Model Everything
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Models + providers</CardTitle>
					<CardDescription>
						Use this after adding or editing a model, provider, pricing row,
						gateway row, or capability. It refreshes the public catalogue,
						model pages, provider pages, chat picker, search, sign-in, and
						related API endpoints.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						type="button"
						disabled={isPending}
						onClick={() => runAction(revalidatePublicModelCatalogueAction)}
					>
						Refresh Models + Providers
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Other global scopes</CardTitle>
					<CardDescription>
						Target non-model surfaces when only that area changed.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() => runAction(revalidateSubscriptionPlansAction)}
					>
						Subscription Plans
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() => runAction(revalidateSearchDataAction)}
					>
						Search
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() => runAction(revalidateLandingDataAction)}
					>
						Landing
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() => runAction(revalidateRankingsAction)}
					>
						Rankings
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Benchmarks</CardTitle>
					<CardDescription>
						Revalidate all benchmark caches, or one benchmark ID.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={benchmarkId}
						onChange={(event) => setBenchmarkId(event.target.value)}
						placeholder="Optional benchmark id (e.g. mmlu-pro)"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() =>
								runAction(() => revalidateBenchmarkScopeAction({}))
							}
						>
							Revalidate Benchmarks (Global)
						</Button>
						<Button
							type="button"
							disabled={isPending || !benchmarkId.trim()}
							onClick={() =>
								runAction(() =>
									revalidateBenchmarkScopeAction({ benchmarkId })
								)
							}
						>
							Revalidate This Benchmark
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Providers</CardTitle>
					<CardDescription>
						Target one provider ID. Use Models + providers for global provider
						changes.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={providerId}
						onChange={(event) => setProviderId(event.target.value)}
						placeholder="Optional provider id (e.g. openai)"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							disabled={isPending || !providerId.trim()}
							onClick={() =>
								runAction(() =>
									revalidateProviderScopeAction({ providerId })
								)
							}
						>
							Revalidate This Provider
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Organisations</CardTitle>
					<CardDescription>
						Revalidate all organisation caches, or one organisation ID.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={organisationId}
						onChange={(event) => setOrganisationId(event.target.value)}
						placeholder="Optional organisation id (e.g. anthropic)"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() =>
								runAction(() => revalidateOrganisationScopeAction({}))
							}
						>
							Revalidate Organisations (Global)
						</Button>
						<Button
							type="button"
							disabled={isPending || !organisationId.trim()}
							onClick={() =>
								runAction(() =>
									revalidateOrganisationScopeAction({ organisationId })
								)
							}
						>
							Revalidate This Organisation
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Apps</CardTitle>
					<CardDescription>
						Revalidate all app surfaces, or one specific app by ID.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={appId}
						onChange={(event) => setAppId(event.target.value)}
						placeholder="Optional app id (leave empty for global)"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() => runAction(() => revalidateAppsDataAction())}
						>
							Revalidate Apps (Global)
						</Button>
						<Button
							type="button"
							disabled={isPending || !appId.trim()}
							onClick={() => runAction(() => revalidateAppsDataAction(appId))}
						>
							Revalidate This App
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Countries</CardTitle>
					<CardDescription>
						Revalidate country catalogue surfaces, or one country by ISO code.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={countryIso}
						onChange={(event) => setCountryIso(event.target.value)}
						placeholder="Optional ISO code (leave empty for global)"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() => runAction(() => revalidateCountryDataAction())}
						>
							Revalidate Countries (Global)
						</Button>
						<Button
							type="button"
							disabled={isPending || !countryIso.trim()}
							onClick={() =>
								runAction(() => revalidateCountryDataAction(countryIso))
							}
						>
							Revalidate This Country
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Profiles</CardTitle>
					<CardDescription>
						Revalidate public profile surfaces, or one specific profile by slug.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						value={profileSlug}
						onChange={(event) => setProfileSlug(event.target.value)}
						placeholder="Optional profile slug (leave empty for global)"
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() => runAction(() => revalidateProfileDataAction())}
						>
							Revalidate Profiles (Global)
						</Button>
						<Button
							type="button"
							disabled={isPending || !profileSlug.trim()}
							onClick={() => runAction(() => revalidateProfileDataAction(profileSlug))}
						>
							Revalidate This Profile
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Advanced: custom scope</CardTitle>
					<CardDescription>
						Use comma or newline-separated tags/paths. Admin-only and intended for incident response.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="space-y-2">
						<div className="text-sm font-medium">Tags</div>
						<Textarea
							value={customTagsText}
							onChange={(event) => setCustomTagsText(event.target.value)}
							placeholder={"data:models\npage:models"}
							rows={4}
						/>
					</div>
					<div className="space-y-2">
						<div className="text-sm font-medium">Paths</div>
						<Textarea
							value={customPathsText}
							onChange={(event) => setCustomPathsText(event.target.value)}
							placeholder={"/models\n/api-providers"}
							rows={4}
						/>
					</div>
					<Button
						type="button"
						variant="destructive"
						disabled={isPending}
						onClick={() =>
							runAction(() =>
								revalidateCustomScopeAction({
									tagsText: customTagsText,
									pathsText: customPathsText,
								})
							)
						}
					>
						Run Custom Revalidation
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
