import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCountryName } from "@/lib/fetchers/countries/utils";
import { resolveLogo } from "@/lib/logos";
import { createClient } from "@/utils/supabase/server";
import { applyHiddenFilter, resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

type OgEntity =
	| "organisations"
	| "models"
	| "benchmarks"
	| "api-providers"
	| "countries"
	| "subscription-plans";

type OgStat = {
	label: string;
	value: string;
	helper?: string;
};

type OgPayload = {
	id: string;
	name: string;
	logoId?: string;
	subtitle?: string;
	badge?: string;
	stats?: OgStat[];
	flagEmoji?: string;
};

const brandLogoPath = "/wordmark_light.svg";

const ENTITY_LABELS: Record<OgEntity, string> = {
	organisations: "Organisation",
	models: "Model",
	benchmarks: "Benchmark",
	"api-providers": "API Provider",
	countries: "Country",
	"subscription-plans": "Subscription Plan",
};

async function loadOrganisation(
	supabase: SupabaseClient,
	slug: string
): Promise<OgPayload | null> {
	const { data, error } = await supabase
		.from("data_organisations")
		.select("organisation_id, name")
		.eq("organisation_id", slug)
		.single();

	if (error || !data) return null;

	return {
		id: data.organisation_id,
		name: data.name ?? data.organisation_id,
		logoId: data.organisation_id,
	};
}

async function loadModel(
	supabase: SupabaseClient,
	modelId: string
): Promise<OgPayload | null> {
	const includeHidden = await resolveIncludeHidden();
	const { data, error } = await applyHiddenFilter(
		supabase
			.from("data_models")
			.select("model_id, name, organisation_id, status, hidden")
			.eq("model_id", modelId),
		includeHidden
	).single();

	if (error || !data) return null;

	return {
		id: data.model_id,
		name: data.name ?? data.model_id,
		logoId: data.organisation_id ?? undefined,
		badge: data.status ?? undefined,
	};
}

async function loadBenchmark(
	supabase: SupabaseClient,
	slug: string
): Promise<OgPayload | null> {
	const { data, error } = await supabase
		.from("data_benchmarks")
		.select("id, name")
		.eq("id", slug)
		.single();

	if (error || !data) return null;

	return {
		id: data.id,
		name: data.name ?? data.id,
	};
}

async function loadApiProvider(
	supabase: SupabaseClient,
	slug: string
): Promise<OgPayload | null> {
	const { data, error } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name")
		.eq("api_provider_id", slug)
		.single();

	if (error || !data) return null;

	return {
		id: data.api_provider_id,
		name: data.api_provider_name ?? data.api_provider_id,
		logoId: data.api_provider_id,
	};
}

async function loadSubscriptionPlan(
	supabase: SupabaseClient,
	slug: string
): Promise<OgPayload | null> {
	const { data, error } = await supabase
		.from("data_subscription_plans")
		.select("plan_id, name, organisation_id")
		.eq("plan_id", slug)
		.limit(1)
		.single();

	if (error || !data) return null;

	return {
		id: data.plan_id,
		name: data.name ?? data.plan_id,
		logoId: data.organisation_id ?? undefined,
	};
}

async function loadCountry(slug: string): Promise<OgPayload | null> {
	const iso = slug.toUpperCase();
	if (!/^[A-Z]{2,3}$/.test(iso)) return null;
	const name = formatCountryName(iso);
	const flagEmoji = isoToFlagEmoji(iso);

	return {
		id: iso,
		name,
		flagEmoji,
	};
}

function isoToFlagEmoji(iso2: string): string {
	const base = 0x1f1e6;
	const [a, b] = iso2.toUpperCase();
	return String.fromCodePoint(
		base + (a.charCodeAt(0) - 65),
		base + (b.charCodeAt(0) - 65)
	);
}

function absoluteAsset(
	src: string | undefined,
	request: NextRequest
): string | undefined {
	if (!src) return undefined;
	try {
		return new URL(src, request.url).toString();
	} catch {
		return undefined;
	}
}

function getLogoUrl(
	logoId: string | undefined,
	request: NextRequest
): string | undefined {
	if (!logoId) return undefined;

	// 1) Try to force a light variant, but allow fallback to colour.
	let resolved = resolveLogo(logoId, {
		variant: "light",
		theme: "light",
		fallbackToColor: true,
	}) as any;

	// 2) If for some reason that didn't produce a src (misconfigured logo),
	// fall back to the normal "auto" resolution.
	if (!resolved?.src) {
		resolved = resolveLogo(logoId, {
			variant: "auto",
			theme: "light",
			fallbackToColor: true,
		}) as any;
	}

	// 3) If we *still* don't have anything, last-resort guess based on naming.
	const src: string | undefined =
		resolved?.src ?? `/logos/${logoId}_light.svg`;

	if (!src) return undefined;

	return absoluteAsset(src, request);
}

async function buildPayload(
	kind: OgEntity,
	segments: string[],
	supabase: SupabaseClient
): Promise<OgPayload | null> {
	console.log("Building payload for kind:", kind, "segments:", segments);
	switch (kind) {
		case "organisations": {
			const [slug] = segments;
			console.log("Loading organisation for slug:", slug);
			return slug ? loadOrganisation(supabase, slug) : null;
		}
		case "models": {
			const modelId = segments.join("/");
			console.log("Loading model for modelId:", modelId);
			return modelId ? loadModel(supabase, modelId) : null;
		}
		case "benchmarks": {
			const [slug] = segments;
			console.log("Loading benchmark for slug:", slug);
			return slug ? loadBenchmark(supabase, slug) : null;
		}
		case "api-providers": {
			const [slug] = segments;
			console.log("Loading API provider for slug:", slug);
			return slug ? loadApiProvider(supabase, slug) : null;
		}
		case "countries": {
			const [slug] = segments;
			console.log("Loading country for slug:", slug);
			return slug ? loadCountry(slug) : null;
		}
		case "subscription-plans": {
			const [slug] = segments;
			console.log("Loading subscription plan for slug:", slug);
			return slug ? loadSubscriptionPlan(supabase, slug) : null;
		}
		default:
			console.log("Unknown kind:", kind);
			return null;
	}
}

function normaliseSegments(
	request: NextRequest,
	slugParam?: string | string[]
) {
	if (Array.isArray(slugParam)) return slugParam;
	if (typeof slugParam === "string")
		return slugParam.split("/").filter(Boolean);
	const path = new URL(request.url).pathname.replace(/^\/|\/$/g, "");
	const parts = path.split("/").filter(Boolean);
	const ogIndex = parts.indexOf("og");
	if (ogIndex >= 0) {
		return parts.slice(ogIndex + 1);
	}
	return [];
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> }
) {
	console.log("OG Route called with params:", params);
	console.log("Request URL:", request.url);

	const { slug } = await params;
	const rawSegments = normaliseSegments(request, slug);
	console.log("Raw segments:", rawSegments);

	if (rawSegments.length < 2) {
		console.log("Missing OG target: segments length < 2");
		return new Response("Missing OG target", { status: 400 });
	}

	const [kindRaw, ...segments] = rawSegments;
	const kind = kindRaw as OgEntity;
	const isCountry = kind === "countries";

	console.log("Kind:", kind, "Segments:", segments);

	const supabase = await createClient();
	const payload = await buildPayload(kind, segments, supabase);
	console.log("Built payload:", payload);

	if (!payload) {
		console.log("Payload not found for kind:", kind, "segments:", segments);
		return new Response("Not found", { status: 404 });
	}

	const entityLabel = ENTITY_LABELS[kind] ?? "AI Stats";
	const badge = entityLabel.toUpperCase();

	const primaryLogoSrc = !isCountry
		? getLogoUrl(payload.logoId, request)
		: undefined;

	const brandLogoSrc = absoluteAsset(brandLogoPath, request);

	const stats = payload.stats ?? [];

	// constants for the top-right box
	const LOGO_BOX_WIDTH = 220;
	const LOGO_BOX_HEIGHT = 96;

	console.log(
		"Generating ImageResponse for payload:",
		payload.name,
		"logo:",
		primaryLogoSrc
	);

	return new ImageResponse(
		(
			<div
				tw="h-full w-full bg-white text-slate-900"
				style={{
					display: "flex",
					padding: "56px 64px",
					position: "relative",
					fontSize: 48,
					fontWeight: 500,
					fontFamily:
						"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
				}}
			>
				{/* MAIN COLUMN */}
				<div
					tw="w-full h-full"
					style={{ display: "flex", flexDirection: "column" }}
				>
					{/* TOP ID */}
					<div
						tw="text-sm text-slate-500"
						style={{ display: "flex" }}
					>
						<span
							tw="font-mono text-sm"
							style={{
								maxWidth: "520px",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{payload.id}
						</span>
					</div>

					{/* TITLE / SUBTITLE / STATS */}
					<div
						tw="mt-10 flex-1"
						style={{
							display: "flex",
							flexDirection: "column",
							marginTop: 40,
							flex: 1,
						}}
					>
						<div
							tw="text-[72px] leading-[1.05] font-bold tracking-tight max-w-[900px] mb-4"
							style={{
								display: "flex",
								maxWidth: "900px",
								marginBottom: 16,
							}}
						>
							{payload.name}
						</div>

						{payload.subtitle ? (
							<div
								tw="text-2xl text-slate-500 max-w-[900px] mb-10"
								style={{
									display: "flex",
									maxWidth: "900px",
									marginBottom: 40,
								}}
							>
								{payload.subtitle}
							</div>
						) : null}

						{stats.length > 0 ? (
							<div
								tw="flex flex-wrap"
								style={{ display: "flex", flexWrap: "wrap" }}
							>
								{stats.map((stat, index) => (
									<div
										key={stat.label}
										tw="flex flex-col min-w-[180px] mr-10"
										style={{
											display: "flex",
											flexDirection: "column",
											minWidth: 180,
											marginRight:
												index === stats.length - 1
													? 0
													: 40,
										}}
									>
										<div
											tw="text-[11px] uppercase text-slate-400"
											style={{ display: "flex" }}
										>
											{stat.label}
										</div>
										<div
											tw="mt-2 text-2xl font-semibold"
											style={{
												display: "flex",
												marginTop: 8,
											}}
										>
											{stat.value}
										</div>
										{stat.helper ? (
											<div
												tw="mt-1 text-xs text-slate-500"
												style={{
													display: "flex",
													marginTop: 4,
												}}
											>
												{stat.helper}
											</div>
										) : null}
									</div>
								))}
							</div>
						) : null}
					</div>

					{/* FOOTER */}
					<div
						tw="mt-auto pt-8 items-center justify-between border-t border-slate-200"
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							borderTop: "1px solid #e2e8f0",
							marginTop: "auto",
							paddingTop: 32,
						}}
					>
						<div
							tw="text-sm text-slate-500"
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-start",
							}}
						>
							<div
								tw="text-[11px] font-semibold uppercase mb-2"
								style={{ display: "flex" }}
							>
								{badge}
							</div>
							<span>ai-stats.phaseo.app</span>
						</div>

						{brandLogoSrc ? (
							<img
								src={brandLogoSrc}
								alt="AI Stats logo"
								width={180}
								height={60}
								style={{ objectFit: "contain" }}
							/>
						) : null}
					</div>
				</div>

				{/* TOP-RIGHT BOX – ABSOLUTE, FIXED SIZE, RIGHT-JUSTIFIED CONTENT */}
				{(isCountry || primaryLogoSrc) && (
					<div
						style={{
							position: "absolute",
							top: 56,
							right: 15,
							width: LOGO_BOX_WIDTH,
							height: LOGO_BOX_HEIGHT,
							display: "flex",
							alignItems: "flex-start",
							justifyContent: "flex-end",
						}}
					>
						{isCountry ? (
							<div
								style={{
									fontSize: 96,
									lineHeight: 1,
									position: "relative",
									left: -49,
								}}
							>
								{payload.flagEmoji ??
									isoToFlagEmoji(payload.id)}
							</div>
						) : (
							primaryLogoSrc && (
								<img
									src={primaryLogoSrc}
									alt={`${payload.name} logo`}
									style={{
										display: "block",
										maxWidth: "80%",
										maxHeight: "80%",
										objectFit: "contain",
									}}
								/>
							)
						)}
					</div>
				)}
			</div>
		),
		{
			width: 1200,
			height: 630,
			headers: {
				// Keep OG images at the edge for a year; they are expensive to render and rarely change.
				// This reduces Fast Origin Transfer by avoiding frequent regeneration/revalidation.
				"Cache-Control":
					"public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400, stale-if-error=86400",
			},
		}
	);
}
