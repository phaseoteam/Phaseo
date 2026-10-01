import { planLegacyRows } from "./legacyMigration";

it("keeps existing conversations and imports colliding IDs without overwriting", () => {
	const rows = planLegacyRows("chats", [{ id: "chat", title: "old" }], [{ id: "chat", title: "new" }], "phaseo-chat", new Map());
	expect(rows).toHaveLength(1);
	expect(rows[0].id).not.toBe("chat");
	expect(rows[0].title).toBe("old");
	expect(planLegacyRows("chats", [{ id: "chat", title: "old" }], rows, "phaseo-chat", new Map())).toEqual([]);
});

it("remaps numeric preset IDs and their run references on conflicts", () => {
	const ids = new Map<unknown, unknown>();
	const presets = planLegacyRows("presets", [{ id: 1, key: "old" }], [{ id: 1, key: "new" }], "fusion", ids);
	const runs = planLegacyRows("runs", [{ id: 1, presetId: 1, originalPrompt: "old prompt" }], [{ id: 1 }], "fusion", ids);
	expect(presets[0].id).toBe(2);
	expect(runs[0].id).toBe(2);
	expect(runs[0].presetId).toBe(2);
	const resumedIds = new Map<unknown, unknown>();
	expect(planLegacyRows("presets", [{ id: 1, key: "old" }], presets, "fusion", resumedIds)).toEqual([]);
	expect(resumedIds.get(1)).toBe(2);
});

it("reuses an existing unique preset key instead of overwriting its settings", () => {
	const ids = new Map<unknown, unknown>();
	expect(planLegacyRows("presets", [{ id: 1, key: "default" }], [{ id: 5, key: "default" }], "fusion", ids)).toEqual([]);
	expect(ids.get(1)).toBe(5);
});
