import { describe, it, expect, vi, type MockedFunction } from "vitest";
import { isNotFound } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
vi.mock("@/lib/flags", () => ({ slackAgentSettingsEnabled: vi.fn() }));

import { slackAgentSettingsEnabled } from "@/lib/flags";
import { Route } from "@/routes/{-$locale}/_dashboard/settings/slack/route";

const mockEnabled = slackAgentSettingsEnabled as MockedFunction<typeof slackAgentSettingsEnabled>;
const beforeLoad = Route.options.beforeLoad as unknown as (options: { context: { queryClient: QueryClient } }) => Promise<void>;

describe("Settings → Slack route", () => {
	it("is a 404 while the Slack agent flag is off", async () => {
		mockEnabled.mockResolvedValue(false);
		const error = await beforeLoad({ context: { queryClient: new QueryClient() } }).catch((caught: unknown) => caught);
		expect(isNotFound(error)).toBe(true);
	});

	it("renders the page once the flag is on", async () => {
		mockEnabled.mockResolvedValue(true);
		await expect(beforeLoad({ context: { queryClient: new QueryClient() } })).resolves.toBeUndefined();
	});
});
