import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

import { fetchFrontendOgPayload } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { OgEntity } from "@/lib/fetchers/frontend/getOgPayload";
import { resolveLogo } from "@/lib/logos";

const brandLogoPath = "/wordmark_light.svg";
const FALLBACK_HOST = "phaseo.app";
const ASSET_BASE_URL =
	process.env.NEXT_PUBLIC_WEBSITE_URL ??
	process.env.WEBSITE_URL ??
	"http://localhost:3000";

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
): string | undefined {
	if (!src) return undefined;
	if (!src.startsWith("/") || src.startsWith("//")) return undefined;
	try {
		return new URL(src, ASSET_BASE_URL).toString();
	} catch {
		return undefined;
	}
}

function getLogoUrl(logoId: string | undefined): string | undefined {
	if (!logoId) return undefined;

	// Prefer a visible logo variant on the light OG background.
	let resolved = resolveLogo(logoId, {
		variant: "auto",
		theme: "light",
		fallbackToColor: true,
	}) as any;

	// If that didn't produce a src, try light as a fallback.
	if (!resolved?.src) {
		resolved = resolveLogo(logoId, {
			variant: "light",
			theme: "light",
			fallbackToColor: true,
		}) as any;
	}

	// 3) If we *still* don't have anything, last-resort guess based on naming.
	const src: string | undefined =
		resolved?.src ?? `/logos/${logoId}_light.svg`;

	if (!src) return undefined;

	return absoluteAsset(src);
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

function getTitleFontSize(name: string): number {
	const len = name.trim().length;
	if (len > 70) return 44;
	if (len > 54) return 52;
	if (len > 38) return 60;
	return 72;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> }
) {
	const { slug } = await params;
	const rawSegments = normaliseSegments(request, slug);

	if (rawSegments.length < 2) {
		return new Response("Missing OG target", {
			status: 400,
			headers: {
				"Cache-Control":
					"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
			},
		});
	}

	const [kindRaw, ...segments] = rawSegments;
	const kind = kindRaw as OgEntity;
	const isCountry = kind === "countries";

	const payload = await fetchFrontendOgPayload(kind, segments);

	if (!payload) {
		return new Response("Not found", {
			status: 404,
			headers: {
				"Cache-Control":
					"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
			},
		});
	}

	const primaryLogoSrc = !isCountry
		? getLogoUrl(payload.logoId)
		: undefined;

	const brandLogoSrc = absoluteAsset(brandLogoPath);

	const stats = payload.stats ?? [];
	const titleFontSize = getTitleFontSize(payload.name);
	let hostLabel = FALLBACK_HOST;
	try {
		hostLabel = new URL(request.url).host || FALLBACK_HOST;
	} catch {
		hostLabel = FALLBACK_HOST;
	}

	return new ImageResponse(
		(
			<div
				style={{
					display: "flex",
					height: "100%",
					width: "100%",
					padding: "56px 64px 48px",
					position: "relative",
					fontSize: 48,
					color: "#0f172a",
					background: "#ffffff",
					fontFamily:
						"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
				}}
			>
				{/* MAIN COLUMN */}
				<div
					style={{
						display: "flex",
						width: "100%",
						height: "100%",
						flexDirection: "column",
						zIndex: 1,
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "flex-start",
							gap: 0,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								maxWidth: 700,
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
								fontSize: 28,
								color: "#475569",
								overflow: "hidden",
								whiteSpace: "nowrap",
								textOverflow: "ellipsis",
							}}
						>
							{payload.id}
						</div>
					</div>

					{/* TITLE / SUBTITLE / STATS */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							marginTop: 40,
							flex: 1,
						}}
					>
						<div
							style={{
								display: "flex",
								maxWidth: "900px",
								marginBottom: 16,
								lineHeight: 1.05,
								letterSpacing: "-0.025em",
								fontSize: titleFontSize,
								color: "#020617",
							}}
						>
							{payload.name}
						</div>

						{payload.subtitle ? (
							<div
								style={{
									display: "flex",
									maxWidth: "900px",
									marginBottom: 40,
									color: "#334155",
								}}
							>
								{payload.subtitle}
							</div>
						) : null}

						{stats.length > 0 ? (
							<div
								style={{ display: "flex", flexWrap: "wrap" }}
							>
								{stats.map((stat, index) => (
									<div
										key={stat.label}
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
											style={{
												display: "flex",
												fontSize: 11,
												textTransform: "uppercase",
												color: "#94a3b8",
											}}
										>
											{stat.label}
										</div>
										<div
											style={{
												display: "flex",
												marginTop: 8,
												fontSize: 24,
											}}
										>
											{stat.value}
										</div>
										{stat.helper ? (
											<div
												style={{
													display: "flex",
													marginTop: 4,
													fontSize: 12,
													color: "#64748b",
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
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							borderTop: "1px solid rgba(100, 116, 139, 0.26)",
							marginTop: "auto",
							paddingTop: 24,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
							}}
						>
							<span style={{ fontSize: 16, color: "#475569" }}>{hostLabel}</span>
						</div>

						{brandLogoSrc ? (
							<img
								src={brandLogoSrc}
								alt="Phaseo logo"
								width={160}
								height={54}
								style={{ objectFit: "contain", opacity: 0.96 }}
							/>
						) : null}
					</div>
				</div>

				{/* TOP-RIGHT ICON */}
				{(isCountry || primaryLogoSrc) && (
					<div
						style={{
							position: "absolute",
							top: 48,
							right: 64,
							display: "flex",
							alignItems: "flex-start",
							justifyContent: "flex-end",
							zIndex: 3,
						}}
					>
						{isCountry ? (
							<div
								style={{
									fontSize: 92,
									lineHeight: 1,
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
										width: 64,
										height: 64,
										objectFit: "contain",
										objectPosition: "right center",
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
