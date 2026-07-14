import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { fetchFrontendLandingStats } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import DatabaseStats from "./DatabaseStatistics";

jest.mock("@/lib/fetchers/frontend/fetchPublicCatalog", () => ({
	fetchFrontendLandingStats: jest.fn(),
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

const mockFetchFrontendLandingStats = jest.mocked(fetchFrontendLandingStats);

describe("DatabaseStats", () => {
	it("links Monthly Tokens to the rankings page", async () => {
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

		const html = renderToStaticMarkup(await DatabaseStats());

		expect(html).toMatch(/<a[^>]*href="\/rankings"[^>]*>.*Monthly Tokens/);
	});
});
