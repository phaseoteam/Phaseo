import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { fetchAdminCatalogRecord, sendAdminModelAnnouncement } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { sendInternalModelAnnouncementAction, testInternalModelDiscoveryNotifierAction } from "./actions";

jest.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchAdminCatalog", () => ({
	fetchAdminCatalogRecord: jest.fn(),
	sendAdminModelAnnouncement: jest.fn(),
	sendAdminModelAnnouncementTest: jest.fn(),
}));

describe("model discovery Discord colours", () => {
	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true } as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);
		jest.mocked(fetchAdminCatalogRecord).mockImplementation(async (resource) => ({
			row: resource === "organisation"
				? { name: "Anthropic", colour: "#cc785c" }
				: { model_id: "anthropic/claude-test", name: "Claude Test", lab_slug: "anthropic" },
		}));
	});

	it("uses the admin catalogue colour in notification previews", async () => {
		const result = await testInternalModelDiscoveryNotifierAction({
			modelsText: "anthropic/claude-test",
			send: false,
		});

		expect(result.ok).toBe(true);
		expect(JSON.parse(result.payloadPreview).embeds[0].color).toBe(0xcc785c);
		expect(fetchAdminCatalogRecord).toHaveBeenCalledWith("organisation", "anthropic");
	});

	it("uses the admin catalogue colour when sending a model announcement", async () => {
		jest.mocked(sendAdminModelAnnouncement).mockResolvedValue({ success: true, stateRecorded: true });

		const result = await sendInternalModelAnnouncementAction("anthropic/claude-test");

		expect(result.ok).toBe(true);
		expect(sendAdminModelAnnouncement).toHaveBeenCalledWith(
			"anthropic/claude-test",
			expect.objectContaining({ embeds: [expect.objectContaining({ color: 0xcc785c })] }),
		);
	});

	it("does not send a blue announcement when organisation metadata cannot be read", async () => {
		jest.mocked(fetchAdminCatalogRecord).mockImplementation(async (resource) => {
			if (resource === "organisation") throw new Error("Catalogue unavailable");
			return { row: { model_id: "anthropic/claude-test", name: "Claude Test", lab_slug: "anthropic" } };
		});

		const result = await sendInternalModelAnnouncementAction("anthropic/claude-test");

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Catalogue unavailable");
		expect(sendAdminModelAnnouncement).not.toHaveBeenCalled();
	});
});
