import { copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";

/**
 * Factory's own files. A save goes to a temporary file that then replaces the old one, so quitting or
 * crashing mid-save leaves the last good copy, never half a file. The first save each session keeps the
 * file it replaces as `.bak`. A file that can't be read is never treated as a first launch: the backup is
 * read instead, and the unreadable file is kept under another name rather than saved over.
 */

export type Loaded<T> = { value: T; from: "file" | "backup" } | { value: null; from: "none" } | { value: null; from: "unreadable"; keptAt: string };

export async function readSaved<T>(file: string): Promise<Loaded<T>> {
	const attempt = async (path: string): Promise<T | null | "missing"> => {
		try {
			return JSON.parse(await readFile(path, "utf8")) as T;
		} catch (error) {
			return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : null;
		}
	};
	const main = await attempt(file);
	if (main !== null && main !== "missing") return { value: main, from: "file" };
	const backup = await attempt(`${file}.bak`);
	// Nothing was ever saved: a first launch.
	if (main === "missing" && (backup === "missing" || backup === null)) return { value: null, from: "none" };
	let keptAt = "";
	if (main === null) {
		keptAt = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
		await rename(file, keptAt).catch(() => undefined);
	}
	if (backup !== null && backup !== "missing") return { value: backup, from: "backup" };
	return main === null ? { value: null, from: "unreadable", keptAt } : { value: null, from: "none" };
}

const backedUp = new Set<string>();
let saves = 0;

/** Callers save one at a time; each save still writes a temporary file of its own, so no two can share one. */
export async function writeSaved(file: string, data: string): Promise<void> {
	const temporary = `${file}.saving-${process.pid}-${++saves}`;
	try {
		await writeFile(temporary, data, "utf8");
		if (!backedUp.has(file)) {
			backedUp.add(file);
			await copyFile(file, `${file}.bak`).catch(() => undefined);
		}
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined);
	}
}
