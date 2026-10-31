import { it, expect, beforeEach, vi } from "vitest";
import { fetchSettingsPresetFeedback } from "./fetchSettingsPresetFeedback";
import { requireAuthenticatedUser, requireWorkspaceMembership } from "@/utils/serverActionAuth";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

vi.mock("@/utils/serverActionAuth", () => ({ requireAuthenticatedUser: vi.fn(), requireWorkspaceMembership: vi.fn() }));
vi.mock("@/utils/workspaceCookie", () => ({ getWorkspaceIdFromCookie: vi.fn() }));

const filters = { fromIso: "2026-09-01T00:00:00.000Z", toIso: "2026-09-02T00:00:00.000Z", rating: "all", metadataKey: "", metadataValue: "" };
function query(data: unknown[]) {
	const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), range: vi.fn(), is: vi.fn(), contains: vi.fn(), then: vi.fn() };
	for (const [name, fn] of Object.entries(builder)) if (name !== "then") fn.mockReturnValue(builder);
	builder.then.mockImplementation((resolve) => Promise.resolve({ data, error: null }).then(resolve));
	return builder;
}
const from = vi.fn();
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireAuthenticatedUser).mockResolvedValue({ user: { id: "alice" }, supabase: { from } } as never);
	vi.mocked(requireWorkspaceMembership).mockResolvedValue(undefined as never);
	vi.mocked(getWorkspaceIdFromCookie).mockResolvedValue("workspace-a");
});
it("requires fresh authentication before reading feedback", async () => {
	vi.mocked(requireAuthenticatedUser).mockRejectedValue(new Error("expired"));
	await expect(fetchSettingsPresetFeedback(JSON.stringify(filters))).rejects.toMatchObject({ status: 401 });
	expect(from).not.toHaveBeenCalled();
});
it("requires membership before querying either table", async () => {
	vi.mocked(requireWorkspaceMembership).mockRejectedValue(new Error("revoked"));
	await expect(fetchSettingsPresetFeedback(JSON.stringify(filters))).rejects.toMatchObject({ status: 403 });
	expect(from).not.toHaveBeenCalled();
});
it("scopes both tables and applies the selected time, rating and metadata filters", async () => {
	const presets = query([{ id: "preset-a" }]);
	const feedback = query([{ id: "feedback-a" }]);
	from.mockImplementation((table) => table === "presets" ? presets : feedback);
	const result = await fetchSettingsPresetFeedback(JSON.stringify({ ...filters, rating: "thumbs_up", metadataKey: "environment", metadataValue: "test" }));
	expect(requireWorkspaceMembership).toHaveBeenCalledWith({ from }, "alice", "workspace-a");
	expect(presets.eq).toHaveBeenCalledWith("workspace_id", "workspace-a");
	expect(feedback.eq).toHaveBeenCalledWith("workspace_id", "workspace-a");
	expect(feedback.in).toHaveBeenCalledWith("preset_id", ["preset-a"]);
	expect(feedback.gte).toHaveBeenCalledWith("created_at", filters.fromIso);
	expect(feedback.lte).toHaveBeenCalledWith("created_at", filters.toIso);
	expect(feedback.eq).toHaveBeenCalledWith("rating", "thumbs_up");
	expect(feedback.contains).toHaveBeenCalledWith("metadata_dimensions", { environment: "test" });
	expect(result.feedback).toEqual([{ id: "feedback-a" }]);
});
it("bounds pagination at ten thousand feedback rows", async () => {
	const presets = query([{ id: "preset-a" }]);
	const feedback = query(Array.from({ length: 1000 }, (_, id) => ({ id })));
	from.mockImplementation((table) => table === "presets" ? presets : feedback);
	const result = await fetchSettingsPresetFeedback(JSON.stringify({ ...filters, rating: "unrated" }));
	expect(result.feedback).toHaveLength(10000);
	expect(result.feedbackTruncated).toBe(true);
	expect(feedback.range).toHaveBeenLastCalledWith(9000, 9999);
	expect(feedback.range).toHaveBeenCalledTimes(10);
	expect(feedback.is).toHaveBeenCalledWith("rating", null);
});
it("rejects invalid filters before issuing a query", async () => {
	await expect(fetchSettingsPresetFeedback(JSON.stringify({ ...filters, metadataKey: "x".repeat(65) }))).rejects.toThrow();
	expect(from).not.toHaveBeenCalled();
});
