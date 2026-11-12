import { describe, expect, it } from "vitest";
import { CATALOGUE_PAGE_SIZE, selectAllRows } from "./models.catalogue";

type Row = Record<string, string>;

/** An in-memory PostgREST query: ordered by the requested keys, filtered by the keyset cursor. */
function table(rows: Row[], calls: string[] = []) {
    return () => {
        const orders: string[] = [];
        let filter: (row: Row) => boolean = () => true;
        const query: any = {
            order(column: string) { orders.push(column); return query; },
            gt(column: string, value: unknown) { calls.push(`gt ${column} ${value}`); filter = (row) => row[column] > String(value); return query; },
            or(filters: string) {
                calls.push(`or ${filters}`);
                const match = /^(\w+)\.gt\."(.*)",and\(\1\.eq\."(.*)",(\w+)\.gt\."(.*)"\)$/.exec(filters);
                if (!match) throw new Error(`unexpected filter ${filters}`);
                const [, first, value, , second, secondValue] = match;
                filter = (row) => row[first] > value || (row[first] === value && row[second] > secondValue);
                return query;
            },
            limit(count: number) {
                const sorted = rows.filter(filter).sort((a, b) => {
                    for (const column of orders) if (a[column] !== b[column]) return a[column] < b[column] ? -1 : 1;
                    return 0;
                });
                return Promise.resolve({ data: sorted.slice(0, count), error: null });
            },
        };
        return query;
    };
}

const models = (count: number) => Array.from({ length: count }, (_, index) => ({ model_slug: `lab/model-${String(index).padStart(5, "0")}` }));

describe("catalogue keyset paging", () => {
    it("reads past the PostgREST row cap, one page after the last key", async () => {
        const calls: string[] = [];
        const rows = await selectAllRows<Row>("model metadata", [{ column: "model_slug" }], table(models(CATALOGUE_PAGE_SIZE * 2 + 19), calls));
        expect(rows).toHaveLength(CATALOGUE_PAGE_SIZE * 2 + 19);
        expect(new Set(rows.map((row) => row.model_slug)).size).toBe(rows.length);
        expect(calls).toEqual(["gt model_slug lab/model-00999", "gt model_slug lab/model-01999"]);
    });

    it("does not skip a row when an earlier one is deleted between pages", async () => {
        const source = models(CATALOGUE_PAGE_SIZE + 5);
        let pages = 0;
        const read = table(source);
        const rows = await selectAllRows<Row>("model metadata", [{ column: "model_slug" }], () => {
            if (pages++ === 1) source.splice(10, 1); // A row before the cursor disappears mid-read.
            return read();
        });
        expect(rows.map((row) => row.model_slug)).toContain(source.at(-1)!.model_slug);
        expect(rows).toHaveLength(CATALOGUE_PAGE_SIZE + 5);
    });

    it("pages a two-column key with quoted values and reads an aliased key field", async () => {
        const details = Array.from({ length: CATALOGUE_PAGE_SIZE + 3 }, (_, index) => ({ model_slug: `z-ai/glm-5.${Math.floor(index / 600)}`, detail_name: `d${String(index).padStart(5, "0")}` }));
        const calls: string[] = [];
        const rows = await selectAllRows<Row>("model details", [{ column: "model_slug" }, { column: "detail_name" }], table(details, calls));
        expect(rows).toHaveLength(details.length);
        expect(calls).toEqual(['or model_slug.gt."z-ai/glm-5.1",and(model_slug.eq."z-ai/glm-5.1",detail_name.gt."d00999")']);
        const aliased = models(CATALOGUE_PAGE_SIZE + 1).map((row) => ({ model_slug: row.model_slug, model_id: row.model_slug }));
        expect(await selectAllRows<Row>("model metadata", [{ column: "model_slug", field: "model_id" }], table(aliased))).toHaveLength(CATALOGUE_PAGE_SIZE + 1);
    });

    it("keeps the existing error message shape", async () => {
        const failing = () => { const query: any = { order: () => query, limit: async () => ({ data: null, error: { message: "boom" } }) }; return query; };
        await expect(selectAllRows("provider models", [{ column: "provider_model_id" }], failing)).rejects.toThrow("Failed to load provider models: boom");
    });
});
