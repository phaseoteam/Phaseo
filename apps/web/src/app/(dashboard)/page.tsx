// app/page.tsx
import Image from "next/image";
import { Suspense } from "react";
import { Pill, ThemedGitHubIcon, LiveDot } from "@/components/landingPage/Pill";
import GatewayTeaser from "@/components/landingPage/GatewayTeaser";
import DatabaseStats from "@/components/landingPage/DatabaseStatistics";
import PartnerLogos from "@/components/landingPage/PartnerLogos/PartnerLogos";
import LatestUpdates from "@/components/landingPage/LatestUpdates";
import type { Metadata } from "next";
import { withUTM } from "@/lib/utm";
import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";

export const metadata: Metadata = {
	title: "Home",
	description:
		"Discover and compare the world's most comprehensive AI model database and gateway. Browse benchmarks, features, pricing, and access state-of-the-art AI models.",
	alternates: {
		canonical: "/",
	},
};

function DatabaseStatsFallback() {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
			{Array.from({ length: 5 }).map((_, index) => (
				<div
					key={index}
					className="h-32 animate-pulse rounded-xl bg-muted"
				/>
			))}
		</div>
	);
}

function LatestUpdatesFallback() {
	return (
		<section className="space-y-4">
			<div className="h-10 w-80 animate-pulse rounded bg-muted" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<div
						key={index}
						className="h-56 animate-pulse rounded-xl bg-muted"
					/>
				))}
			</div>
		</section>
	);
}

async function GatewayTeaserServer() {
	const gatewayMetrics = await getGatewayMarketingMetrics();

	return (
		<GatewayTeaser
			providers={gatewayMetrics.summary.supportedProviders ?? 20}
			models={gatewayMetrics.summary.supportedModels ?? 500}
		/>
	);
}

export default function Page() {
	return (
		<div className="container mx-auto mt-12 mb-12 space-y-12 px-4 sm:px-6 lg:px-8">
			<section className="space-y-8 text-center">
				<h1 className="text-4xl font-semibold text-gray-900 drop-shadow-xs animate-fade-in dark:text-gray-100 md:text-5xl">
					The Most Comprehensive AI Model Database
				</h1>

				<div className="flex flex-wrap justify-center gap-3">
					<Pill
						href={withUTM("https://github.com/AI-Stats/AI-Stats", {
							campaign: "hero-pill",
							content: "github",
						})}
						label="Open Source"
						icon={<ThemedGitHubIcon />}
						target="_blank"
						rel="noopener noreferrer"
						ariaLabel="Open GitHub repository"
					/>
					<Pill
						href="/updates"
						label="Instant Updates"
						icon={<LiveDot className="mr-1" />}
						rightIcon={null}
						ariaLabel="Dataset updates as soon as available"
					/>
					<Pill
						href={withUTM("https://discord.gg/zDw73wamdX", {
							campaign: "hero-pill",
							content: "discord",
						})}
						label="Join our Discord"
						icon={
							<Image
								src="/social/discord.svg"
								alt="Discord"
								width={16}
								height={16}
								className="h-4 w-4"
							/>
						}
						target="_blank"
						rel="noopener noreferrer"
						ariaLabel="Join our Discord"
					/>
				</div>
			</section>

			<Suspense fallback={<DatabaseStatsFallback />}>
				<DatabaseStats />
			</Suspense>

			<div className="space-y-8">
				<Suspense fallback={<LatestUpdatesFallback />}>
					<LatestUpdates />
				</Suspense>
			</div>

			<div className="mt-4 space-y-4 px-4 sm:px-6 lg:px-8">
				<Suspense fallback={<GatewayTeaser providers={20} models={500} />}>
					<GatewayTeaserServer />
				</Suspense>
				<PartnerLogos />
			</div>
		</div>
	);
}
