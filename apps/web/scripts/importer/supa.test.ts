import {
    ImporterDatabaseError,
    isTransientImporterError,
    touchModelTimestamps,
} from "./supa";

describe("isTransientImporterError", () => {
    it("retries transient database and network failures", () => {
        expect(isTransientImporterError(new ImporterDatabaseError("upsert", { code: "40001" }))).toBe(true);
        expect(isTransientImporterError(new Error("fetch failed: connection reset"))).toBe(true);
    });

    it("does not retry deterministic constraint failures", () => {
        expect(isTransientImporterError(new ImporterDatabaseError("upsert", { code: "23505" }))).toBe(false);
    });
});

describe("touchModelTimestamps", () => {
    it("updates unique trimmed model ids in batches", async () => {
        const inMock = jest
            .fn()
            .mockResolvedValue({ data: null, error: null });
        const updateMock = jest.fn(() => ({ in: inMock }));
        const fromMock = jest.fn(() => ({ update: updateMock }));
        const supa = { from: fromMock } as any;
        const modelIds = [
            ...Array.from({ length: 501 }, (_, index) => ` model-${index} `),
            "model-0",
            "   ",
        ];

        await touchModelTimestamps(
            supa,
            modelIds,
            "2026-06-09T12:00:00.000Z"
        );

        expect(fromMock).toHaveBeenCalledTimes(2);
        expect(fromMock).toHaveBeenNthCalledWith(1, "data_models");
        expect(fromMock).toHaveBeenNthCalledWith(2, "data_models");
        expect(updateMock).toHaveBeenCalledTimes(2);
        expect(updateMock).toHaveBeenNthCalledWith(1, {
            updated_at: "2026-06-09T12:00:00.000Z",
        });
        expect(updateMock).toHaveBeenNthCalledWith(2, {
            updated_at: "2026-06-09T12:00:00.000Z",
        });
        expect(inMock).toHaveBeenCalledTimes(2);
        expect(inMock).toHaveBeenNthCalledWith(
            1,
            "model_id",
            Array.from({ length: 500 }, (_, index) => `model-${index}`)
        );
        expect(inMock).toHaveBeenNthCalledWith(2, "model_id", ["model-500"]);
    });

    it("skips writes when there are no model ids", async () => {
        const inMock = jest.fn();
        const updateMock = jest.fn(() => ({ in: inMock }));
        const fromMock = jest.fn(() => ({ update: updateMock }));
        const supa = { from: fromMock } as any;

        await touchModelTimestamps(supa, ["", "   "], "2026-06-09T12:00:00.000Z");

        expect(fromMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(inMock).not.toHaveBeenCalled();
    });
});
