import { retireCatalogueRows, retirementValues } from "./retirement";

const now = "2026-09-08T10:00:00.000Z";

describe("catalogue retirement", () => {
    it("ends current prices and disables routes without deleting their identities", () => {
        expect(retirementValues("v2_pricing_skus", { status: "active", effective_from: "2026-09-01T00:00:00Z" }, now))
            .toEqual({ status: "deprecated", effective_to: now });
        expect(retirementValues("v2_model_provider_routes", { provider_model_slug: null, status: "disabled", routing_enabled: false }, now))
            .toEqual({ effective_to: now });
        expect(retirementValues("v2_model_aliases", { enabled: true }, now))
            .toEqual({ enabled: false, effective_to: now });
    });

    it("preserves historical end dates and is idempotent", () => {
        const row = { status: "deprecated", effective_to: "2026-08-01T00:00:00Z" };
        expect(retirementValues("v2_pricing_skus", row, now)).toBeNull();
        expect(retirementValues("v2_pricing_skus", { ...row, status: "active" }, now))
            .toEqual({ status: "deprecated" });
    });

    it("keeps end dates strictly after future start dates", () => {
        expect(retirementValues("v2_pricing_skus", { effective_from: "2026-10-01T00:00:00Z" }, now))
            .toEqual({ status: "disabled", effective_to: "2026-10-01T00:00:00.001Z" });
        expect(retirementValues("v2_pricing_skus", {
            status: "disabled", effective_from: "2026-10-01T00:00:00Z", effective_to: "2026-10-01T00:00:00.001+00:00",
        }, now)).toBeNull();
    });

    it("retains models as hidden retired catalogue records", () => {
        expect(retirementValues("v2_models", {}, now))
            .toEqual({ hidden: true, status: "retired", catalogue_status: "retired", retired_at: now });
    });

    it("batches identities sharing a retirement update", async () => {
        const inIds = jest.fn().mockResolvedValue({ data: [], error: null });
        const update = jest.fn(() => ({ in: inIds }));
        const from = jest.fn(() => ({ update }));
        await retireCatalogueRows({ from } as never, "v2_benchmark_results", ["result_id"],
            Array.from({ length: 201 }, (_, index) => ({ result_id: String(index) })), now);
        expect(update).toHaveBeenCalledTimes(2);
        expect(update).toHaveBeenCalledWith({ effective_to: now });
        expect(inIds.mock.calls.map(call => call[1].length)).toEqual([200, 1]);
    });

    it("scopes membership updates by both parent and model", async () => {
        const eq = jest.fn();
        const query = { eq, then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }) };
        eq.mockReturnValue(query);
        const update = jest.fn(() => query);
        await retireCatalogueRows({ from: () => ({ update }) } as never, "v2_subscription_plan_models",
            ["plan_uuid", "model_slug"], [{ plan_uuid: "plan", model_slug: "lab/model" }], now);
        expect(eq.mock.calls).toEqual([["plan_uuid", "plan"], ["model_slug", "lab/model"]]);
    });
});
