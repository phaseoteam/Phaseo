import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import type { WorktreeSize } from "../shared/worktreeCleanup";

const dependencyFolders = new Set(["node_modules", ".pnpm-store", "vendor", ".venv", "venv", "__pypackages__"]);
const buildFolders = new Set(["dist", "build", "out", ".next", ".turbo", "target", ".vite", ".cache", "coverage", "release"]);

/**
 * How much a worktree holds on disk, split into dependencies, build output and the rest, by folder name. The walk is
 * bounded by entries and time so a huge checkout cannot stall the dialog; a cut-short count is marked as a minimum.
 * Links are counted as themselves, never followed.
 */
export async function measureWorktree(directory: string, limits = { entries: 400_000, ms: 20_000 }): Promise<WorktreeSize> {
	const size: WorktreeSize = { bytes: 0, dependencies: 0, build: 0, partial: false };
	const deadline = Date.now() + limits.ms;
	let entries = 0;
	const queue: { folder: string; kind: "dependencies" | "build" | "other" }[] = [{ folder: directory, kind: "other" }];
	while (queue.length) {
		if (entries >= limits.entries || Date.now() > deadline) { size.partial = true; break; }
		const { folder, kind } = queue.pop()!;
		let children;
		try { children = await readdir(folder, { withFileTypes: true }); } catch { continue; }
		for (const child of children) {
			entries++;
			const full = path.join(folder, child.name);
			if (child.isDirectory()) { queue.push({ folder: full, kind: kind !== "other" ? kind : dependencyFolders.has(child.name) ? "dependencies" : buildFolders.has(child.name) ? "build" : "other" }); continue; }
			const info = await lstat(full).catch(() => undefined);
			if (!info) continue;
			size.bytes += info.size;
			if (kind === "dependencies") size.dependencies += info.size; else if (kind === "build") size.build += info.size;
		}
	}
	return size;
}
