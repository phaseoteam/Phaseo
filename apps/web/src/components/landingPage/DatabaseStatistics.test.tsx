import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
	fetchFrontendLandingStats,
	fetchFrontendSignInSupportedModelsStats,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { DisplayPreferencesProvider } from "@/components/providers/DisplayPreferencesProvider";
import DatabaseStats from "./DatabaseStatistics";
import { landingStatsQuery, landingSupportedModelsStatsQuery } from "./landing.queries";

vi.mock("@/lib/fetchers/frontend/fetchPublicCatalog", () => ({
	fetchFrontendLandingStats: vi.fn(),
	fetchFrontendSignInSupportedModelsStats: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
	Link: ({
		href,
		children,
		prefetch: _prefetch,
		...props
	}: {
		href: string;
		children: React.ReactNode;
		className?: string;
		prefetch?: boolean | null;
	}) => React.createElement("a", { ...props, href }, children),
}));

vi.mock("@/i18n/react", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/i18n/react")>()),
	useTranslations: () => {
		const labels: Record<string, string> = {
			"statistics.catalogModels": "Catalog models",
			"statistics.routableModels": "Routable models",
			"statistics.catalogProviders": "Catalog providers",
			"statistics.monthlyTokensRouted": "Monthly tokens routed",
		};
		return (key: string) => labels[key] ?? key;
	},
}));

const mockFetchFrontendLandingStats = vi.mocked(fetchFrontendLandingStats);
const mockFetchFrontendSignInSupportedModelsStats = vi.mocked(
	fetchFrontendSignInSupportedModelsStats,
);

describe("DatabaseStats", () => {
	it("separates catalog models from routable models", async () => {
		mockFetchFrontendLandingStats.mockResolvedValue({
			db: {
				models: 100,
				organisations: 0,
				benchmarks: 0,
				benchmark_results: 0,
				api_providers: 10,
			},
			monthlyTokenTotal: 49_910_627,
		});
		mockFetchFrontendSignInSupportedModelsStats.mockResolvedValue({
			modelsCount: 100,
			orgsCount: 12,
			apiCount: 75,
			recentCount: 8,
		});

		// The section reads both queries with useSuspenseQueries; prefetch them as the route loader does.
		const queryClient = new QueryClient();
		await Promise.all([
			queryClient.prefetchQuery(landingStatsQuery()),
			queryClient.prefetchQuery(landingSupportedModelsStatsQuery()),
		]);
		const html = renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<DisplayPreferencesProvider locale="en-GB"><DatabaseStats /></DisplayPreferencesProvider>
			</QueryClientProvider>,
		);

		expect(html).toContain("Catalog models");
		expect(html).toContain("Routable models");
		expect(html).toMatch(
			/<a[^>]*href="\/rankings"[^>]*>.*Monthly tokens routed/,
		);
		expect(html).toContain("49.91M+");
	});
});
