import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGrafanaBrowserConfig } from "@/lib/grafana.functions";
import { Route } from "./__root";

vi.mock("@/lib/grafana.functions", () => ({ getGrafanaBrowserConfig: vi.fn() }));
vi.mock("@/components/layout/RootDocument", () => ({ RootDocument: () => null }));
vi.mock("@/components/layout/GlobalError", () => ({ GlobalError: () => null }));
vi.mock("@/components/layout/RouteBoundaries", () => ({ RouteNotFound: () => null }));
vi.mock("@/lib/start/streamedMetadata", () => ({ StreamedMetadata: () => null }));

function loadRoot() {
	const loader = Route.options.loader;
	if (typeof loader !== "function") throw new Error("Root loader is missing");
	return loader({} as never);
}

describe("root monitoring configuration", () => {
	beforeEach(() => vi.clearAllMocks());

	it("keeps the shell load successful when the monitoring request fails", async () => {
		vi.mocked(getGrafanaBrowserConfig).mockRejectedValue(new Error("Network unavailable"));
		await expect(loadRoot()).resolves.toBeUndefined();
	});

	it("passes successful public configuration to the shell", async () => {
		const config = { enabled: true, url: "https://faro-collector-prod-eu-west-0.grafana.net/collect/test", environment: "production", sampleRate: 0.1 };
		vi.mocked(getGrafanaBrowserConfig).mockResolvedValue(config);
		await expect(loadRoot()).resolves.toEqual(config);
	});
});
