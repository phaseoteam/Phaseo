import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateModel } from "@/features/models/actions";
import { revalidateSingleModelAllAction } from "@/features/internal/data/actions";
import { saveModelDraft } from "./saveModelDraft";

vi.mock("@/features/models/actions", () => ({ updateModel: vi.fn() }));
vi.mock("@/features/internal/data/actions", () => ({ revalidateSingleModelAllAction: vi.fn() }));
const update = vi.mocked(updateModel);
const refresh = vi.mocked(revalidateSingleModelAllAction);

describe("saving a model draft", () => {
	beforeEach(() => {
		update.mockReset();
		refresh.mockReset();
	});
	it("surfaces rejected saves instead of reporting success", async () => {
		update.mockResolvedValue({ ok: false, error: "Your session expired" });
		await expect(saveModelDraft({ modelId: "test/model" })).rejects.toThrow("Your session expired");
	});
	it("provides an error when the server omits one", async () => {
		update.mockResolvedValue({ ok: false });
		await expect(saveModelDraft({ modelId: "test/model" })).rejects.toThrow("Failed to save");
	});
	it("sends the draft and completes only after a successful save", async () => {
		update.mockResolvedValue({ ok: true });
		const draft = { modelId: "test/model", name: "Updated model" };
		await expect(saveModelDraft(draft)).resolves.toBeUndefined();
		expect(update).toHaveBeenCalledWith({ data: draft });
		expect(refresh).toHaveBeenCalledWith({ data: draft.modelId });
	});
	it("reports a cache failure as a saved edit, not a failed write", async () => {
		update.mockResolvedValue({ ok: true });
		refresh.mockRejectedValue(new Error("cache unavailable"));
		await expect(saveModelDraft({ modelId: "test/model" })).rejects.toThrow("changes were saved, but the public cache refresh failed");
	});
});
