import React, { useRef, useEffect } from "react";
import Image from "next/image";
import { ExtendedModel, SubscriptionPlans } from "@/data/types";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { withUTM } from "@/lib/utm";

interface ModelInProductsProps {
	model: ExtendedModel; // currently viewed model
	plans: SubscriptionPlans[]; // plans with embedded models
}

export default function ModelInProducts({
	model,
	plans,
}: ModelInProductsProps) {
	// Plans that include the current model
	const matchingPlans = plans.filter(
		(plan: any) =>
			Array.isArray(plan.models) &&
			plan.models.some((m: any) => m.model_id === model.id)
	);

	// --- Scroll Sync for Features List ---
	const featuresScrollRefs = useRef<(HTMLDivElement | null)[]>([]);
	const isSyncing = useRef(false);

	useEffect(() => {
		const refs = featuresScrollRefs.current;
		const handlers: ((e: Event) => void)[] = [];
		refs.forEach((ref, idx) => {
			const handler = (e: Event) => {
				if (isSyncing.current) return;
				isSyncing.current = true;
				const target = e.target as HTMLDivElement;
				const scrollTop = target.scrollTop;
				refs.forEach((otherRef, i) => {
					if (otherRef && i !== idx) {
						otherRef.scrollTop = scrollTop;
					}
				});
				isSyncing.current = false;
			};
			handlers.push(handler);
			if (ref) {
				ref.addEventListener("scroll", handler);
			}
		});
		return () => {
			refs.forEach((ref, idx) => {
				if (ref) {
					ref.removeEventListener("scroll", handlers[idx]);
				}
			});
		};
	}, [matchingPlans.length]);

	if (matchingPlans.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
				<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
					<span className="text-xl">📦</span>
				</div>
				<p className="text-base font-medium">
					No product or subscription plan availability yet
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					We&apos;re continuously adding product data. Have info to
					share?
				</p>
				<div className="mt-3">
					<a
						href={withUTM("https://github.com/AI-Stats/AI-Stats", {
							campaign: "model-products-empty-state",
							content: "model-in-products",
						})}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
					>
						Contribute on GitHub
					</a>
				</div>
			</div>
		);
	}

	// --- Helpers ---
	const formatUsd = (v: unknown) => {
		const n =
			typeof v === "string"
				? parseFloat(v)
				: typeof v === "number"
				? v
				: NaN;
		if (!Number.isFinite(n)) return null;
		return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
	};

	// Build a normalised, de-duped list of ALL features shown across the visible plans
	const seen = new Map<string, string>(); // key -> original case
	for (const p of matchingPlans) {
		if (!Array.isArray(p.features)) continue;
		for (const f of p.features) {
			if (!f || !f.feature_name) continue;
			const key = f.feature_name.trim().toLowerCase();
			if (!seen.has(key)) {
				seen.set(key, f.feature_name.trim());
			}
		}
	}
	// Sort alphabetically by display name for stable UI
	const allFeatures = Array.from(seen.entries())
		.map(([key, original]) => ({ key, name: original }))
		.sort((a, b) => a.name.localeCompare(b.name));

	// For fast membership checks per plan
	const planFeatureSets = matchingPlans.map((p) => {
		const set = new Map<string, { name: string }>();
		if (Array.isArray(p.features)) {
			for (const f of p.features) {
				if (!f?.feature_name) continue;
				const key = f.feature_name.trim().toLowerCase();
				set.set(key, {
					name: f.feature_name.trim(),
				});
			}
		}
		return set;
	});

	return (
		<>
			<div className="space-y-4">
				<h3 className="text-lg font-semibold mb-2">
					Product & Subscription Plan Availability
				</h3>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{matchingPlans.map((plan, planIdx) => {
						const thisModelEntry = Array.isArray(plan.models)
							? plan.models.find((m) => m.model_id === model.id)
							: undefined;

						const providerLabel: string | undefined =
							plan.provider_name || plan.provider_id;
						const displayName: string = plan.name || "Plan";

						const rawUsd =
							(plan as any).usd_price ??
							(plan as any)["usd-price"];
						const priceBadge = formatUsd(rawUsd);
						const frequency = plan.frequency || "mo";

						const rateLimit: string | null =
							thisModelEntry?.rate_limit ?? null;
						const modelInfo: string | null =
							thisModelEntry?.model_info ?? null;

						// membership for this plan
						const featureSet = planFeatureSets[planIdx];

						return (
							<Card
								key={plan.plan_id || displayName}
								className="flex flex-col h-full"
							>
								<CardHeader className="pb-3 pt-4 px-4">
									<CardTitle className="flex items-center justify-between gap-2 min-w-0 text-base">
										<div className="flex items-center gap-2 min-w-0">
											{plan.provider_id && (
												<Image
													src={`/providers/${plan.provider_id}.svg`}
													alt={
														providerLabel ||
														plan.provider_id
													}
													width={22}
													height={22}
													className="rounded-sm bg-muted border mr-2"
													style={{
														minWidth: 22,
														minHeight: 22,
													}}
												/>
											)}
											<span className="font-medium truncate">
												{displayName}
											</span>
											{priceBadge && (
												<span className="text-[11px] font-semibold px-2 py-1 rounded-md border bg-muted/50 ml-2">
													{priceBadge} / {frequency}
												</span>
											)}
										</div>
										{providerLabel && (
											<span className="text-xs text-muted-foreground ml-2">
												{providerLabel}
											</span>
										)}
									</CardTitle>
								</CardHeader>

								<Separator />

								<CardContent className="flex flex-col gap-3 pt-4">
									{plan.description && (
										<div className="text-sm text-muted-foreground">
											{plan.description}
										</div>
									)}

									<div className="mt-1 rounded-md border bg-muted/40 p-3">
										<div className="text-sm font-semibold mb-1">
											This model
										</div>
										<div className="flex flex-col gap-1 text-sm">
											<div className="flex items-center gap-2">
												<span className="text-muted-foreground">
													Rate limit:
												</span>
												<span className="font-medium">
													{rateLimit ||
														"No published rate limit"}
												</span>
											</div>
											{modelInfo && (
												<div className="text-muted-foreground">
													<span className="font-medium">
														Notes:
													</span>{" "}
													{modelInfo}
												</div>
											)}
										</div>
									</div>

									{/* Normalised Features block */}
									{allFeatures.length > 0 && (
										<div className="mt-1">
											<span className="font-semibold text-sm">
												Features:
											</span>
											<div
												ref={(el) => {
													featuresScrollRefs.current[
														planIdx
													] = el;
												}}
												className="mt-2 space-y-2 overflow-y-auto h-[30vh]"
												// style={{
												// 	maxHeight: "40vh",
												// 	minHeight: "40vh",
												// 	WebkitOverflowScrolling:
												// 		"touch",
												// }}
											>
												<ul className="space-y-2">
													{allFeatures.map(
														({ key, name }) => {
															const present =
																featureSet.has(
																	key
																);
															return (
																<li
																	key={key}
																	className={`flex items-start gap-2 text-sm rounded-md px-3 py-2 border ${
																		present
																			? "bg-muted/60"
																			: "bg-background"
																	}`}
																>
																	<span
																		className={`mt-0.5 ${
																			present
																				? "text-green-600 dark:text-green-400"
																				: "text-red-600 dark:text-red-400"
																		}`}
																		aria-label={
																			present
																				? "Included"
																				: "Not included"
																		}
																		title={
																			present
																				? "Included"
																				: "Not included"
																		}
																	>
																		{present ? (
																			<Check className="h-4 w-4" />
																		) : (
																			<X className="h-4 w-4" />
																		)}
																	</span>
																	<span>
																		<span
																			className={`font-medium ${
																				!present
																					? "opacity-80"
																					: ""
																			}`}
																		>
																			{
																				name
																			}
																		</span>
																	</span>
																</li>
															);
														}
													)}
												</ul>
											</div>
										</div>
									)}

									{plan.link && (
										<a
											href={plan.link}
											target="_blank"
											rel="noopener noreferrer"
											className="mt-1 inline-block text-xs text-blue-600 underline decoration-transparent hover:decoration-current transition-colors duration-200"
										>
											Learn more
										</a>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>
		</>
	);
}

