jest.mock("@/lib/flags", () => ({ slackAgentSettingsEnabled: jest.fn() }));
jest.mock("@/lib/navigation", () => ({ notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));

import { notFound } from "@/lib/navigation";
import { slackAgentSettingsEnabled } from "@/lib/flags";
import SlackSettingsLayout from "./layout";

const mockEnabled = slackAgentSettingsEnabled as jest.MockedFunction<typeof slackAgentSettingsEnabled>;

describe("Settings → Slack route", () => {
	it("is a 404 while the Slack agent flag is off", async () => {
		mockEnabled.mockResolvedValue(false);
		await expect(SlackSettingsLayout({ children: "page" })).rejects.toThrow("NEXT_NOT_FOUND");
		expect(notFound).toHaveBeenCalled();
	});

	it("renders the page once the flag is on", async () => {
		mockEnabled.mockResolvedValue(true);
		await expect(SlackSettingsLayout({ children: "page" })).resolves.toBe("page");
	});
});
