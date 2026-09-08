import { updateModel } from "@/app/(dashboard)/models/actions";
import { saveModelDraft } from "./saveModelDraft";

jest.mock("@/app/(dashboard)/models/actions", () => ({ updateModel: jest.fn() }));
const update = jest.mocked(updateModel);

describe("saving a model draft", () => {
	beforeEach(() => update.mockReset());
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
		expect(update).toHaveBeenCalledWith(draft);
	});
});
