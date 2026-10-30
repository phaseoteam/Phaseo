import { reorderByokEntries, type ByokKeyEntry } from "./ByokProviderKeys";

function key(id: string, routingMode: "priority" | "fallback", sortOrder: number): ByokKeyEntry {
	return { id, providerId: "openai", name: id, lastUsedAt: null, enabled: true, errorMessage: null, alwaysUse: routingMode === "priority", routingMode, sortOrder, verificationStatus: null };
}

describe("reorderByokEntries", () => {
	it("moves a key live within its current stage", () => {
		const result = reorderByokEntries([key("a", "priority", 0), key("b", "priority", 1)], "b", "a");
		expect(result.filter((entry) => entry.routingMode === "priority").sort((a, b) => a.sortOrder - b.sortOrder).map((entry) => entry.id)).toEqual(["b", "a"]);
	});

	it("moves a key between priority and fallback", () => {
		const result = reorderByokEntries([key("a", "priority", 0), key("b", "fallback", 0)], "a", "section-fallback");
		const moved = result.find((entry) => entry.id === "a");
		expect(moved).toMatchObject({ routingMode: "fallback", alwaysUse: false, sortOrder: 1 });
	});
});
