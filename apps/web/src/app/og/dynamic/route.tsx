import { ImageResponse } from "@/lib/og/imageResponse";
import { NextRequest } from "next/server";

import { parseDynamicOgParams } from "@/lib/og/dynamicOg";
import { montserratBoldPromise, montserratRegularPromise, wordmarkDataUrlPromise } from "@/lib/og/ogAssets";

// Public, parameterised share image: /og/dynamic?title=…&description=…&pathname=…
// Inputs are validated in parseDynamicOgParams; anything rejected gets a 400
// that is never cached, and accepted images carry their own cache tag so they
// can be purged if the filter is tightened later.

const DYNAMIC_OG_CACHE_CONTROL =
	"public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=604800";
const DYNAMIC_OG_CACHE_TAG = "dynamic-og";
const NO_STORE_HEADERS = {
	"Cache-Control": "private, no-store",
	"CDN-Cache-Control": "no-store",
	"Vercel-CDN-Cache-Control": "no-store",
	"X-Robots-Tag": "noindex",
};


function getTitleFontSize(title: string): number {
	const len = title.length;
	if (len > 70) return 52;
	if (len > 54) return 58;
	if (len > 38) return 64;
	return 74;
}

export async function GET(request: NextRequest) {
	const parsed = parseDynamicOgParams(request.nextUrl.searchParams);
	if (parsed.ok === false) {
		return Response.json(
			{ error: parsed.reason, ...(parsed.field ? { field: parsed.field } : {}) },
			{ status: 400, headers: NO_STORE_HEADERS },
		);
	}
	const { title, description, pathname } = parsed.value;

	const [montserratRegular, montserratBold, wordmarkSrc] = await Promise.all([
		montserratRegularPromise,
		montserratBoldPromise,
		wordmarkDataUrlPromise,
	]);

	return new ImageResponse(
		(
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					padding: "72px 58px 38px",
					background: "#fbfaf6",
					fontFamily: "Montserrat",
					color: "#111315",
					position: "relative",
				}}
			>
				<div
					style={{
						display: "flex",
						maxWidth: 1000,
						fontSize: getTitleFontSize(title),
						fontWeight: 700,
						lineHeight: 1.04,
						letterSpacing: -1.2,
						textWrap: "balance",
					}}
				>
					{title}
				</div>
				{pathname ? (
					<div
						style={{
							display: "flex",
							marginTop: 18,
							fontFamily:
								"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
							fontSize: 18,
							color: "#77736d",
						}}
					>
						{pathname}
					</div>
				) : null}

				{description ? (
					<div
						style={{
							position: "absolute",
							left: 58,
							right: 58,
							top: 369,
							display: "flex",
							paddingTop: 22,
							borderTop: "1px solid #d9d2c7",
							fontSize: 24,
							lineHeight: 1.35,
							color: "#514d47",
						}}
					>
						{description}
					</div>
				) : null}

				<div
					style={{
						position: "absolute",
						left: 58,
						right: 58,
						bottom: 38,
						display: "flex",
						alignItems: "flex-end",
						justifyContent: "space-between",
					}}
				>
					<img
						src={wordmarkSrc}
						alt="Phaseo"
						width={132}
						height={27}
						style={{ objectFit: "contain", objectPosition: "left bottom" }}
					/>
					<div style={{ color: "#77736d", fontSize: 18, fontWeight: 700, letterSpacing: 0.2 }}>
						phaseo.app
					</div>
				</div>
			</div>
		),
		{
			width: 1200,
			height: 630,
			fonts: [
				{ name: "Montserrat", data: montserratRegular, weight: 400, style: "normal" },
				{ name: "Montserrat", data: montserratBold, weight: 700, style: "normal" },
			],
			headers: {
				"Cache-Control": DYNAMIC_OG_CACHE_CONTROL,
				"CDN-Cache-Control": DYNAMIC_OG_CACHE_CONTROL,
				"Vercel-CDN-Cache-Control": DYNAMIC_OG_CACHE_CONTROL,
				"Vercel-Cache-Tag": DYNAMIC_OG_CACHE_TAG,
				"X-Robots-Tag": "noindex",
			},
		},
	);
}
