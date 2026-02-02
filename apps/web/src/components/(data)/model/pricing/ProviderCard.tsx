"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
	BarChart3,
	Settings,
	CheckCircle2,
	XCircle,
	Network,
	Clock,
	AlertTriangle,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	TokenTripleSection,
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	CacheWriteSection,
	RequestsSection,
} from "@/components/(data)/model/pricing/sections";
import {
	buildProviderSections,
	fmtUSD,
} from "@/components/(data)/model/pricing/pricingHelpers";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { Logo } from "@/components/Logo";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";

export default function ProviderCard({
	provider,
	plan,
}: {
	provider: ProviderPricing;
	plan: string;
}) {
	const sec = useMemo(
		() => buildProviderSections(provider, plan),
		[provider, plan]
	);

	const now = new Date();
	const msIn7Days = 7 * 24 * 60 * 60 * 1000;

        const planRules = provider.pricing_rules.filter(
                (r) => (r.pricing_plan || "standard") === plan
        );
        const hasPlanPricing = planRules.length > 0;
        const hasDatedPricing = planRules.some(
                (r) => r.effective_from || r.effective_to
        );

        const planModelKeys = new Set(planRules.map((r) => r.model_key));
        const matchingProviderModel = provider.provider_models.find((pm) =>
                planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
        );
	const isActiveGateway = matchingProviderModel?.is_active_gateway ?? false;

	const comingSoonRule = planRules
		.filter((r) => {
			if (!r.effective_from) return false;
			const from = new Date(r.effective_from).getTime();
			return from > now.getTime() && from - now.getTime() <= msIn7Days;
		})
		.sort(
			(a, b) =>
				new Date(a.effective_from!).getTime() -
				new Date(b.effective_from!).getTime()
		)[0];

	const leavingSoonRule = planRules
		.filter((r) => {
			if (!r.effective_to) return false;
			const to = new Date(r.effective_to).getTime();
			return to > now.getTime() && to - now.getTime() <= msIn7Days;
		})
		.sort(
			(a, b) =>
				new Date(a.effective_to!).getTime() -
				new Date(b.effective_to!).getTime()
		)[0];

        let status: "Active" | "Leaving Soon" | "Coming Soon" | "Inactive";
        let statusIcon: React.ElementType;
        let statusClass: string;

        if (isActiveGateway && leavingSoonRule) {
                status = "Leaving Soon";
                statusIcon = AlertTriangle;
                statusClass = "h-3.5 w-3.5 text-amber-500";
        } else if (comingSoonRule) {
                status = "Coming Soon";
                statusIcon = Clock;
                statusClass = "h-3.5 w-3.5 text-amber-500";
        } else if (isActiveGateway && hasDatedPricing) {
                status = "Active";
                statusIcon = CheckCircle2;
                statusClass = "h-3.5 w-3.5 text-emerald-500";
        } else {
                status = "Inactive";
                statusIcon = XCircle;
                statusClass = "h-3.5 w-3.5 text-red-500";
        }

	const formatCountdown = (ms: number) => {
		const totalHours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
		const days = Math.floor(totalHours / 24);
		const hours = totalHours % 24;
		if (days > 0) return `${days}d ${hours}h`;
		return `${hours}h`;
	};

        const countdownMs =
                status === "Coming Soon" && comingSoonRule
                        ? new Date(comingSoonRule.effective_from!).getTime() - now.getTime()
                        : status === "Leaving Soon" && leavingSoonRule
                        ? new Date(leavingSoonRule.effective_to!).getTime() - now.getTime()
                        : null;
        const inactiveReason = !isActiveGateway
                ? "Model not active in gateway"
                : "Pricing window not specified";

	const supportedCapabilities = new Set(
		provider.provider_models
			.filter((pm) => pm.is_active_gateway)
			.map((pm) => pm.endpoint)
	);

	const supportedEndpoints = new Set<string>();
	for (const cap of supportedCapabilities) {
		const eps = capabilityToEndpoints[cap] || [];
		eps.forEach((ep) => supportedEndpoints.add(ep));
	}

	const supportedParams = new Set<string>();
	for (const pm of provider.provider_models) {
		if (pm.params && typeof pm.params === "object") {
			Object.keys(pm.params).forEach((key) => supportedParams.add(key));
		}
	}

	// Define all possible endpoints grouped by category
	const allEndpointCategories = [
		{
			name: "Text",
			endpoints: [
				{ key: "/chat/completions", label: "Chat Completions" },
				{ key: "/responses", label: "Responses" },
				{ key: "/messages", label: "Messages" },
			],
		},
		{
			name: "Image",
			endpoints: [
				{ key: "/images/generations", label: "Image Generations" },
				{ key: "/images/edits", label: "Image Edits" },
				{ key: "/images/variations", label: "Image Variations" },
			],
		},
		{
			name: "Video",
			endpoints: [
				{ key: "/videos/generations", label: "Video Generations" },
			],
		},
		{
			name: "Audio",
			endpoints: [
				{ key: "/audio/transcriptions", label: "Audio Transcriptions" },
				{ key: "/audio/speech", label: "Audio Speech" },
				{ key: "/audio/translations", label: "Audio Translations" },
			],
		},
		{
			name: "Specialized",
			endpoints: [
				{ key: "/embeddings", label: "Embeddings" },
				{ key: "/moderations", label: "Moderations" },
				{ key: "/batches", label: "Batch" },
			],
		},
	];

	// Filter to only supported endpoints
	const endpointCategories = allEndpointCategories
		.map((category) => ({
			...category,
			endpoints: category.endpoints.filter((ep) =>
				supportedEndpoints.has(ep.key)
			),
		}))
		.filter((category) => category.endpoints.length > 0);

	const isFreePlan = plan === "free";
	const imageInputs = sec.mediaInputs?.filter((r) => r.mod === "image") ?? [];
	const videoInputs = sec.mediaInputs?.filter((r) => r.mod === "video") ?? [];
	const allEmpty =
		!sec.textTokens &&
		!sec.imageTokens &&
		!sec.audioTokens &&
		!sec.videoTokens &&
		!sec.imageGen &&
		!sec.videoGen &&
		!imageInputs.length &&
		!videoInputs.length &&
		!sec.cacheWrites?.length &&
		!sec.requests?.length &&
		!sec.otherRules.length;

        if (!hasPlanPricing) return null;
        if (allEmpty && !isFreePlan) return null;

	return (
		<Card className="border-slate-200">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Link
							href={`/api-providers/${sec.providerId}`}
							className="group"
						>
							<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
								<div className="w-7 h-7 relative">
									<Logo
										id={sec.providerId}
										alt={`${sec.providerName} logo`}
										className="object-contain group-hover:opacity-80 transition"
										fill
									/>
								</div>
							</div>
						</Link>
						<Link
							href={`/api-providers/${sec.providerId}`}
							className="group"
						>
							<CardTitle className="text-lg group-hover:text-primary transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
								{sec.providerName}
							</CardTitle>
						</Link>
						<div className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<span className="inline-flex items-center gap-1">
											{React.createElement(statusIcon, {
												className: statusClass,
											})}
											<span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
												{status}
											</span>
										</span>
									</TooltipTrigger>
									<TooltipContent>
										{countdownMs !== null && (
											<p>
												{status === "Coming Soon"
													? "Pricing available in "
													: "Expires in "}
												{formatCountdown(countdownMs)}
											</p>
										)}
                                        {status === "Inactive" && (
                                        <p>{inactiveReason}</p>
                                )}
										{status === "Active" && !countdownMs && (
											<p>Model is active in gateway</p>
										)}
										{status === "Leaving Soon" && !countdownMs && (
											<p>Model leaving soon</p>
										)}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span>
										<Button
											variant="ghost"
											size="sm"
											disabled
											className="h-8 w-8 p-0"
										>
											<BarChart3 className="h-4 w-4" />
										</Button>
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<p>Coming Soon: Performance Stats</p>
								</TooltipContent>
							</Tooltip>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-8 w-8 p-0"
										title="Supported Parameters"
										disabled={status === "Inactive"}
									>
										<Settings className="h-4 w-4" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-72" side="right">
									<div className="space-y-4">
										<h4 className="font-semibold text-sm">
											Supported Parameters
										</h4>
										{supportedParams.size > 0 ? (
											<div className="flex flex-wrap gap-1">
												{Array.from(
													supportedParams
												).map((param) => (
													<span
														key={param}
														className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs font-medium"
													>
														{param}
													</span>
												))}
											</div>
										) : (
											<p className="text-sm text-muted-foreground">
												No parameter information
												available.
											</p>
										)}
									</div>
								</PopoverContent>
							</Popover>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-8 w-8 p-0"
										title="Supported Endpoints"
										disabled={status === "Inactive"}
									>
										<Network className="h-4 w-4" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-72" side="right">
									<div className="space-y-4">
										<h4 className="font-semibold text-sm">
											Gateway Endpoint Support
										</h4>
										<div className="space-y-4">
											{endpointCategories.map(
												(category) => (
													<div
														key={category.name}
														className="space-y-2"
													>
														<h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
															{category.name}
														</h5>
														<div className="space-y-1">
															{category.endpoints.map(
																(endpoint) => (
																	<div
																		key={
																			endpoint.key
																		}
																		className="flex items-center justify-between"
																	>
																		<span className="text-sm">
																			{
																				endpoint.label
																			}
																		</span>
																		<CheckCircle2 className="h-4 w-4 text-green-600" />
																	</div>
																)
															)}
														</div>
													</div>
												)
											)}
										</div>
									</div>
								</PopoverContent>
							</Popover>
						</TooltipProvider>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{isFreePlan && (
					<div className="rounded-lg border p-4">
						<div className="text-xs text-muted-foreground mb-1">
							Per 1M tokens
						</div>
						<div className="text-xl font-semibold">{fmtUSD(0)}</div>
					</div>
				)}
				{/* Text Tokens */}
				{!isFreePlan && sec.textTokens && (
					<TokenTripleSection
						title="Text Tokens"
						triple={sec.textTokens}
					/>
				)}
				{/* Cache Writes for Text */}
				{!isFreePlan &&
					sec.cacheWrites &&
					sec.cacheWrites.length > 0 && (
						<CacheWriteSection rows={sec.cacheWrites} />
					)}

				{/* Requests */}
				{!isFreePlan && sec.requests && sec.requests.length > 0 && (
					<RequestsSection rows={sec.requests} />
				)}

				{/* Image inputs */}
				{!isFreePlan && imageInputs.length > 0 && (
					<InputsSection title="Image inputs" rows={imageInputs} />
				)}

				{/* Video inputs */}
				{!isFreePlan && videoInputs.length > 0 && (
					<InputsSection title="Video inputs" rows={videoInputs} />
				)}

				{/* Image Tokens */}
				{!isFreePlan && sec.imageTokens && (
					<TokenTripleSection
						title="Image Tokens"
						triple={sec.imageTokens}
					/>
				)}
				{/* Image Generation */}
				{!isFreePlan && sec.imageGen && (
					<ImageGenSection rows={sec.imageGen} />
				)}

				{/* Audio Tokens */}
				{!isFreePlan && sec.audioTokens && (
					<TokenTripleSection
						title="Audio Tokens"
						triple={sec.audioTokens}
					/>
				)}

				{/* Video Tokens */}
				{!isFreePlan && sec.videoTokens && (
					<TokenTripleSection
						title="Video Tokens"
						triple={sec.videoTokens}
					/>
				)}
				{/* Video Generation */}
				{!isFreePlan && sec.videoGen && (
					<VideoGenSection rows={sec.videoGen} />
				)}

				{/* Advanced pricing */}
				{!isFreePlan && sec.otherRules.length > 0 && (
					<AdvancedTable rows={sec.otherRules} />
				)}
			</CardContent>
		</Card>
	);
}
