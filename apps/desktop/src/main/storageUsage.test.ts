import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { storageUsage } from "./storageUsage";

it("adds up the app's folder by area, largest first", async () => {
	const folder = mkdtempSync(path.join(tmpdir(), "phaseo-storage-"));
	try {
		mkdirSync(path.join(folder, "workspace", "tasks"), { recursive: true }); writeFileSync(path.join(folder, "workspace", "workspace.sqlite"), Buffer.alloc(3000)); writeFileSync(path.join(folder, "workspace", "tasks", "a.json"), Buffer.alloc(1000));
		mkdirSync(path.join(folder, "Cache")); writeFileSync(path.join(folder, "Cache", "data_0"), Buffer.alloc(2000));
		writeFileSync(path.join(folder, "Preferences"), Buffer.alloc(10));
		const usage = await storageUsage(folder);
		expect(usage.areas.map(area => [area.id, area.bytes])).toEqual([["chats", 4000], ["caches", 2000], ["other", 10]]);
		expect(usage.total).toBe(6010);
	} finally { rmSync(folder, { recursive: true, force: true }); }
});
