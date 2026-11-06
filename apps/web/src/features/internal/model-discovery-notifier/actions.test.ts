import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { fetchAdminCatalogRecord, sendAdminModelAnnouncement } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { sendInternalModelAnnouncementAction, testInternalModelDiscoveryNotifierAction } from "@/features/internal/model-discovery-notifier/actions";

vi.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: vi.fn() }));
vi.mock("@/lib/fetchers/internal/fetchAdminCatalog", () => ({
	fetchAdminCatalogRecord: vi.fn(),
	sendAdminModelAnnouncement: vi.fn(),
	sendAdminModelAnnouncementTest: vi.fn(),
}));

describe("model discovery Discord colours", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true } as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);
		vi.mocked(fetchAdminCatalogRecord).mockImplementation(async (resource) => ({
			row: resource === "organisation"
				? { name: "Anthropic", colour: "#cc785c" }
				: { model_id: "anthropic/claude-test", name: "Claude Test", lab_slug: "anthropic" },
		}));
	});

	it("uses the admin catalogue colour in notification previews", async () => {
		const result = await testInternalModelDiscoveryNotifierAction({ data: {
			modelsText: "anthropic/claude-test",
			send: false,
		} });

		expect(result.ok).toBe(true);
		expect(JSON.parse(result.payloadPreview).embeds[0].color).toBe(0xcc785c);
		expect(fetchAdminCatalogRecord).toHaveBeenCalledWith("organisation", "anthropic");
	});

	it("uses the admin catalogue colour when sending a model announcement", async () => {
		vi.mocked(sendAdminModelAnnouncement).mockResolvedValue({ success: true, stateRecorded: true });

		const result = await sendInternalModelAnnouncementAction({ data: "anthropic/claude-test" });

		expect(result.ok).toBe(true);
		expect(sendAdminModelAnnouncement).toHaveBeenCalledWith(
			"anthropic/claude-test",
			expect.objectContaining({ embeds: [expect.objectContaining({ color: 0xcc785c })] }),
		);
	});

	it("does not send a blue announcement when organisation metadata cannot be read", async () => {
		vi.mocked(fetchAdminCatalogRecord).mockImplementation(async (resource) => {
			if (resource === "organisation") throw new Error("Catalogue unavailable");
			return { row: { model_id: "anthropic/claude-test", name: "Claude Test", lab_slug: "anthropic" } };
		});

		const result = await sendInternalModelAnnouncementAction({ data: "anthropic/claude-test" });

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Catalogue unavailable");
		expect(sendAdminModelAnnouncement).not.toHaveBeenCalled();
	});
});
