import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
	fetchFrontendLandingStats,
	fetchFrontendSignInSupportedModelsStats,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import DatabaseStats from "./DatabaseStatistics";

jest.mock("@/lib/fetchers/frontend/fetchPublicCatalog", () => ({
	fetchFrontendLandingStats: jest.fn(),
	fetchFrontendSignInSupportedModelsStats: jest.fn(),
}));

jest.mock("next/link", () => ({
	__esModule: true,
	default: ({
		href,
		children,
		...props
	}: {
		href: string;
		children: React.ReactNode;
		className?: string;
	}) => React.createElement("a", { ...props, href }, children),
}));

jest.mock("next-intl/server", () => ({
	getTranslations: jest.fn(async () => {
		const labels: Record<string, string> = {
			"statistics.catalogModels": "Catalog models",
			"statistics.routableModels": "Routable models",
			"statistics.catalogProviders": "Catalog providers",
			"statistics.monthlyTokensRouted": "Monthly tokens routed",
		};
		return (key: string) => labels[key] ?? key;
	}),
}));

const mockFetchFrontendLandingStats = jest.mocked(fetchFrontendLandingStats);
const mockFetchFrontendSignInSupportedModelsStats = jest.mocked(
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
			monthlyTokenTotal: 1_234,
		});
		mockFetchFrontendSignInSupportedModelsStats.mockResolvedValue({
			modelsCount: 100,
			orgsCount: 12,
			apiCount: 75,
			recentCount: 8,
		});

		const html = renderToStaticMarkup(await DatabaseStats());

		expect(html).toContain("Catalog models");
		expect(html).toContain("Routable models");
		expect(html).toMatch(
			/<a[^>]*href="\/rankings"[^>]*>.*Monthly tokens routed/,
		);
	});
});
