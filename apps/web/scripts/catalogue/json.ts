import { promises as fs } from "node:fs";
import { join } from "node:path";

const VERBOSE = process.argv.includes("--verbose");

export async function readJson<T = unknown>(filePath: string): Promise<T> {
	return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

export async function listDirs(directory: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(directory, { withFileTypes: true });
		const directories = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(directory, entry.name));
		if (VERBOSE) console.log(`[listDirs] ${directory} -> ${directories.length} dirs`);
		return directories;
	} catch {
		if (VERBOSE) console.log(`[listDirs] ${directory} -> (missing)`);
		return [];
	}
}
