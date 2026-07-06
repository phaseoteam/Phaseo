import { readFile } from "node:fs/promises"
import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

import { PUBLIC_LONG_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders"
import {
	parseProfileShareCardToken,
} from "@/lib/profileShare"

type RouteProps = {
	params: Promise<{ card: string }>
}

const montserratRegularPromise = readFile(
	new URL("../assets/Montserrat-Regular.ttf", import.meta.url),
)
const montserratSemiboldPromise = readFile(
	new URL("../assets/Montserrat-SemiBold.ttf", import.meta.url),
)
const montserratBoldPromise = readFile(
	new URL("../assets/Montserrat-Bold.ttf", import.meta.url),
)
const wordmarkDataUrlPromise = readFile(
	new URL("../assets/wordmark_light.svg", import.meta.url),
	"utf8",
).then(
	(svg) => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
)

export async function GET(_request: NextRequest, { params }: RouteProps) {
	const { card } = await params
	const payload = parseProfileShareCardToken(card)
	const [montserratRegular, montserratSemibold, montserratBold, wordmarkSrc] =
		await Promise.all([
			montserratRegularPromise,
			montserratSemiboldPromise,
			montserratBoldPromise,
			wordmarkDataUrlPromise,
		])

	return new ImageResponse(
		(
			<div
				style={{
					display: "flex",
					width: "100%",
					height: "100%",
					padding: "44px",
					background:
						"radial-gradient(circle at top left, rgba(124,101,246,0.22), transparent 30%), linear-gradient(180deg, #fdfdff 0%, #f3f4f8 100%)",
					fontFamily: "Montserrat",
					color: "#0f172a",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						width: "100%",
						borderRadius: 34,
						border: "1px solid rgba(148,163,184,0.20)",
						background: "rgba(255,255,255,0.94)",
						padding: "34px 36px",
						boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "flex-start",
						}}
					>
						<div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
							<img
								src={wordmarkSrc}
								alt="Phaseo"
								width={172}
								height={36}
								style={{
									width: 172,
									height: 36,
									objectFit: "contain",
									objectPosition: "left center",
								}}
							/>
							<div
								style={{
									display: "flex",
									marginTop: 22,
									fontSize: 64,
									fontWeight: 700,
									letterSpacing: "-0.05em",
									lineHeight: 1,
								}}
							>
								{payload.displayName}
							</div>
						</div>
					</div>

					<div
						style={{
							display: "flex",
							marginTop: 36,
							gap: 18,
						}}
					>
						{[
							{
								label: "Total Requests",
								value: payload.totalRequests.toLocaleString(),
							},
							{
								label: "Total Tokens",
								value: payload.totalTokens.toLocaleString(),
							},
							{
								label: "Longest Streak",
								value: `${payload.longestStreak} days`,
							},
							{
								label: "Avg Week",
								value: payload.avgPerWeek.toFixed(1),
							},
						].map((stat) => (
							<div
								key={stat.label}
								style={{
									display: "flex",
									flexDirection: "column",
									flex: 1,
									padding: "24px 24px 22px",
									borderRadius: 24,
									background: "#f8fafc",
									border: "1px solid rgba(226,232,240,0.86)",
								}}
							>
								<div
									style={{
										display: "flex",
										fontSize: 16,
										color: "#64748b",
									}}
								>
									{stat.label}
								</div>
								<div
									style={{
										display: "flex",
										marginTop: 12,
										fontSize: 38,
										fontWeight: 700,
										letterSpacing: "-0.04em",
									}}
								>
									{stat.value}
								</div>
							</div>
						))}
					</div>

					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginTop: "auto",
							paddingTop: 28,
							borderTop: "1px solid rgba(148,163,184,0.22)",
						}}
					>
						<div
							style={{
								display: "flex",
								fontSize: 22,
								color: "#475569",
							}}
						>
							{payload.workspaceName?.trim()
								? `${payload.workspaceName} workspace`
								: "Personal workspace"}
						</div>
						<div
							style={{
								display: "flex",
								fontSize: 22,
								fontWeight: 600,
								color: "#111827",
							}}
						>
							phaseo.ai
						</div>
					</div>
				</div>
			</div>
		),
		{
			width: 1200,
			height: 630,
			fonts: [
				{
					name: "Montserrat",
					data: montserratRegular,
					weight: 400,
					style: "normal",
				},
				{
					name: "Montserrat",
					data: montserratSemibold,
					weight: 600,
					style: "normal",
				},
				{
					name: "Montserrat",
					data: montserratBold,
					weight: 700,
					style: "normal",
				},
			],
			headers: {
				"Cache-Control": PUBLIC_LONG_CDN_CACHE_CONTROL,
			},
		},
	)
}
