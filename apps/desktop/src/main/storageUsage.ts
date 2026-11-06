import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import type { StorageArea, StorageUsage } from "../shared/maintenance";

/** Each top-level entry of the app's folder, by the area it belongs to; anything unlisted counts as Other. */
const areaOf: Record<string, StorageArea["id"]> = {
	workspace: "chats", "Local Storage": "chats", "Session Storage": "chats", settings: "chats",
	Cache: "caches", "Code Cache": "caches", GPUCache: "caches", DawnGraphiteCache: "caches", DawnWebGPUCache: "caches", GrShaderCache: "caches", ShaderCache: "caches", GPUPersistentCache: "caches", cache: "caches", "Shared Dictionary": "caches", "compile-cache": "caches",
	Partitions: "browser", "browser-recordings": "recordings", logs: "logs", "acp-agents": "agents",
};
const labels: Record<StorageArea["id"], string> = { chats: "Chats, settings and attachments", caches: "Caches", browser: "Browser profiles", recordings: "Browser recordings", logs: "Logs", agents: "Downloaded agents", other: "Other" };

/** Bytes under a path, not following links; files that vanish or can't be read count as nothing. */
export async function pathSize(target: string, budget = { entries: 200_000 }): Promise<number> {
	if (budget.entries-- <= 0) return 0;
	const info = await lstat(target).catch(() => undefined);
	if (!info || info.isSymbolicLink()) return 0;
	if (!info.isDirectory()) return info.size;
	const entries = await readdir(target).catch(() => [] as string[]);
	let total = 0;
	for (let index = 0; index < entries.length; index += 16) total += (await Promise.all(entries.slice(index, index + 16).map(entry => pathSize(path.join(target, entry), budget)))).reduce((sum, size) => sum + size, 0);
	return total;
}

export async function storageUsage(folder: string): Promise<StorageUsage> {
	const sizes = new Map<StorageArea["id"], number>();
	const budget = { entries: 200_000 };
	for (const entry of await readdir(folder).catch(() => [] as string[])) {
		const area = areaOf[entry] ?? "other";
		sizes.set(area, (sizes.get(area) ?? 0) + await pathSize(path.join(folder, entry), budget));
	}
	const areas = (Object.keys(labels) as StorageArea["id"][]).map(id => ({ id, label: labels[id], bytes: sizes.get(id) ?? 0 })).filter(area => area.bytes > 0).sort((a, b) => b.bytes - a.bytes);
	return { areas, total: areas.reduce((sum, area) => sum + area.bytes, 0), folder };
}
