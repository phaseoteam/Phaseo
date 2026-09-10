import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

import { fetchFrontendOgPayload } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { OgEntity } from "@/lib/fetchers/frontend/getOgPayload";
import { resolveLogo } from "@/lib/logos";

const brandLogoPath = "/wordmark_light.svg";
const OG_CACHE_CONTROL =
	"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400";
const ASSET_BASE_URL =
	process.env.NEXT_PUBLIC_WEBSITE_URL ??
	process.env.WEBSITE_URL ??
	"http://localhost:3000";

const montserratRegularPromise = readFile(
	new URL("../profile-share/assets/Montserrat-Regular.ttf", import.meta.url),
);
const montserratSemiboldPromise = readFile(
	new URL("../profile-share/assets/Montserrat-SemiBold.ttf", import.meta.url),
);
const montserratBoldPromise = readFile(
	new URL("../profile-share/assets/Montserrat-Bold.ttf", import.meta.url),
);

function isoToFlagEmoji(iso2: string): string {
	const base = 0x1f1e6;
	const [a, b] = iso2.toUpperCase();
	return String.fromCodePoint(
		base + (a.charCodeAt(0) - 65),
		base + (b.charCodeAt(0) - 65),
	);
}

function absoluteAsset(src: string | undefined, assetBaseUrl = ASSET_BASE_URL): string | undefined {
	if (!src) return undefined;
	if (!src.startsWith("/") || src.startsWith("//")) return undefined;
	try {
		return new URL(src, assetBaseUrl).toString();
	} catch {
		return undefined;
	}
}

function getLogoUrl(logoId: string | undefined, assetBaseUrl: string): string | undefined {
	if (!logoId) return undefined;
	const resolved = resolveLogo(logoId, {
		variant: "auto",
		theme: "light",
		fallbackToColor: true,
	}) as any;
	return absoluteAsset(resolved?.src, assetBaseUrl);
}

function titleCaseLabel(value: string): string {
	return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function normaliseSegments(
	request: NextRequest,
	slugParam?: string | string[],
) {
	if (Array.isArray(slugParam)) return slugParam;
	if (typeof slugParam === "string") return slugParam.split("/").filter(Boolean);
	const path = new URL(request.url).pathname.replace(/^\/|\/$/g, "");
	const parts = path.split("/").filter(Boolean);
	const ogIndex = parts.indexOf("og");
	return ogIndex >= 0 ? parts.slice(ogIndex + 1) : [];
}

function getTitleFontSize(name: string): number {
	const len = name.trim().length;
	if (len > 70) return 46;
	if (len > 54) return 54;
	if (len > 38) return 60;
	return 70;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	const { slug } = await params;
	const rawSegments = normaliseSegments(request, slug);

	if (rawSegments.length < 2) return new Response("Missing OG target", { status: 400 });

	const [kindRaw, ...segments] = rawSegments;
	const kind = kindRaw as OgEntity;
	const isCountry = kind === "countries";
	const payload = await fetchFrontendOgPayload(kind, segments);

	if (!payload) return new Response("Not found", { status: 404 });

	const [montserratRegular, montserratSemibold, montserratBold] = await Promise.all([
		montserratRegularPromise,
		montserratSemiboldPromise,
		montserratBoldPromise,
	]);
	let assetBaseUrl = ASSET_BASE_URL;
	try {
		assetBaseUrl = new URL(request.url).origin;
	} catch {
		assetBaseUrl = ASSET_BASE_URL;
	}
	const primaryLogoSrc = !isCountry ? getLogoUrl(payload.logoId, assetBaseUrl) : undefined;
	const brandLogoSrc = absoluteAsset(brandLogoPath, assetBaseUrl);
	const stats = (payload.stats ?? []).slice(0, 4);
	const releaseDateFontSize = 35;
	const titleFontSize = getTitleFontSize(payload.name);

	return new ImageResponse(
		(
			<div
				style={{
					display: "flex",
					width: "100%",
					height: "100%",
					background: "#fbfaf6",
					fontFamily: "Montserrat",
					color: "#111315",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						padding: "72px 58px 38px",
						background: "#fbfaf6",
						position: "relative",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "flex-start",
						}}
					>
						<div style={{ display: "flex", alignItems: "flex-start", flex: 1, paddingRight: 40 }}>
							{primaryLogoSrc ? (
								<img
									src={primaryLogoSrc}
									alt={`${payload.name} logo`}
									width={88}
									height={88}
									style={{ flexShrink: 0, marginRight: 26, objectFit: "contain" }}
								/>
							) : isCountry ? (
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
										width: 88,
										height: 88,
										marginRight: 26,
										fontSize: 58,
										lineHeight: 1,
									}}
								>
									{payload.flagEmoji ?? isoToFlagEmoji(payload.id)}
								</div>
							) : null}

							<div style={{ display: "flex", flexDirection: "column", paddingTop: 4 }}>
								<div
									style={{
										maxWidth: 760,
										fontSize: titleFontSize,
										fontWeight: 700,
										lineHeight: 1.04,
										letterSpacing: -1.2,
										textWrap: "balance",
									}}
								>
									{payload.name}
								</div>
								<div
									style={{
										marginTop: 18,
										fontFamily:
											"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
									fontSize: 18,
										color: "#77736d",
									}}
								>
									{payload.id}
								</div>
							</div>
						</div>
					</div>

					<div
						style={{
							position: "absolute",
							left: 58,
							right: 58,
							top: 369,
							display: "flex",
							flexDirection: "column",
						}}
					>
						{stats.length > 0 ? (
							<div
								style={{
									display: "flex",
									paddingTop: 22,
									borderTop: "1px solid #d9d2c7",
								}}
							>
								{stats.map((stat, index) => {
									const originalPrice = stat.originalValue;
									const priceContent = originalPrice ? (
										<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginTop: 8 }}>
											<div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
												<div style={{ fontSize: 35, fontWeight: 700, lineHeight: 1, letterSpacing: -1.1 }}>
													{stat.value}
												</div>
												{stat.promotion ? (
													<div style={{ color: "#2f7d4e", fontSize: 19, fontWeight: 700, letterSpacing: -0.2, whiteSpace: "nowrap" }}>
														{stat.promotion}
													</div>
												) : null}
											</div>
											<div style={{ marginTop: 7, fontSize: 18, fontWeight: 600, lineHeight: 1, letterSpacing: -0.4, color: "#9b948a", textDecoration: "line-through" }}>
												{originalPrice}
											</div>
										</div>
									) : (
										<div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
											<div style={{ fontSize: stat.label === "RELEASED" ? releaseDateFontSize : 35, fontWeight: 700, lineHeight: 1, letterSpacing: -1.1 }}>
												{stat.value}
											</div>
											{stat.promotion ? (
												<div style={{ color: "#2f7d4e", fontSize: 16, fontWeight: 700, letterSpacing: -0.2, whiteSpace: "nowrap" }}>
													{stat.promotion}
												</div>
											) : null}
										</div>
									);

									return (
										<div
											key={stat.label}
											style={{
												display: "flex",
												flexDirection: "column",
												flex: 1,
												paddingLeft: index === 0 ? 0 : 20,
												marginLeft: index === 0 ? 0 : 20,
												borderLeft: index === 0 ? "none" : "1px solid #d9d2c7",
											}}
										>
											<div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.4, color: "#77736d" }}>
												{titleCaseLabel(stat.label)}
											</div>
											{priceContent}
											{stat.helper ? (
												<div style={{ marginTop: 6, fontSize: 14, color: "#9b948a" }}>
													{stat.helper}
												</div>
											) : null}
										</div>
									);
								})}
							</div>
						) : payload.subtitle ? (
							<div style={{ paddingTop: 20, fontSize: 21, lineHeight: 1.3, color: "#514d47" }}>
								{payload.subtitle}
							</div>
						) : null}

						{brandLogoSrc ? (
							<div
								style={{
									display: "flex",
									alignItems: "flex-end",
									justifyContent: "space-between",
									marginTop: 88,
								}}
							>
								<img
									src={brandLogoSrc}
									alt="Phaseo"
									width={132}
									height={27}
									style={{ objectFit: "contain", objectPosition: "left bottom" }}
								/>
								<div style={{ color: "#77736d", fontSize: 18, fontWeight: 600, letterSpacing: 0.2 }}>
									phaseo.app
								</div>
							</div>
						) : null}
					</div>
				</div>
			</div>
		),
		{
			width: 1200,
			height: 630,
			fonts: [
				{ name: "Montserrat", data: montserratRegular, weight: 400, style: "normal" },
				{ name: "Montserrat", data: montserratSemibold, weight: 600, style: "normal" },
				{ name: "Montserrat", data: montserratBold, weight: 700, style: "normal" },
			],
			headers: {
				"Cache-Control": OG_CACHE_CONTROL,
			},
		},
	);
}
