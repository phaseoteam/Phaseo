import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FileChange } from "./types.js";

export async function readOptionalFile(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export function renderPlan(changes: FileChange[]): string {
	if (changes.length === 0) return "No changes required.\n";
	return changes.map((change) => `${change.description}\n  ${change.path}\n`).join("");
}

export async function applyChanges(changes: FileChange[]): Promise<void> {
	const applied: Array<{ path: string; backup: string | null }> = [];
	try {
		for (const change of changes) {
			await mkdir(dirname(change.path), { recursive: true });
			let backup: string | null = null;
			if (change.before !== null) {
				backup = `${change.path}.phaseo-backup-${Date.now()}`;
				await writeFile(backup, change.before, { mode: 0o600 });
			}
			if (change.after === null) {
				await unlink(change.path).catch((error: NodeJS.ErrnoException) => {
					if (error.code !== "ENOENT") throw error;
				});
			} else {
				const temporary = `${change.path}.phaseo-tmp-${process.pid}`;
				await writeFile(temporary, change.after, { mode: 0o600 });
				await rename(temporary, change.path);
			}
			applied.push({ path: change.path, backup });
		}
	} catch (error) {
		for (const item of applied.reverse()) {
			if (item.backup) {
				const contents = await readFile(item.backup, "utf8");
				await writeFile(item.path, contents, { mode: 0o600 });
			}
		}
		throw error;
	}
}
