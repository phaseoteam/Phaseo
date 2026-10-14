import { describe, expect, it, vi } from "vitest";
import { CATALOGUE_PAGE_SIZE, selectAllRows } from "./models.catalogue";

describe("catalogue paging", () => {
    it("reads past the PostgREST row cap until a short page", async () => {
        const rows = Array.from({ length: CATALOGUE_PAGE_SIZE * 2 + 19 }, (_, index) => ({ id: index }));
        const page = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
        expect(await selectAllRows("model metadata", page)).toHaveLength(rows.length);
        expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    });

    it("asks for one more page when the last page is exactly full", async () => {
        const page = vi.fn(async (from: number) => ({ data: from === 0 ? Array.from({ length: CATALOGUE_PAGE_SIZE }, () => ({})) : [], error: null }));
        expect(await selectAllRows("model details", page)).toHaveLength(CATALOGUE_PAGE_SIZE);
        expect(page).toHaveBeenCalledTimes(2);
    });

    it("keeps the existing error message shape", async () => {
        await expect(selectAllRows("provider models", async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("Failed to load provider models: boom");
    });
});
