import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseT3ProjectFile, t3ProjectFileName, type T3ProjectFileState } from "../shared/projectSettings";

/** A checkout's t3.json (T3 Code's checked-in project file), for importing its scripts as actions. */
export async function readT3ProjectFile(directory: string): Promise<T3ProjectFileState> {
	const file = path.join(directory, t3ProjectFileName);
	let text: string;
	try {
		const info = await stat(file);
		if (!info.isFile() || info.size > 1024 * 1024) return { status: "invalid", scripts: [] };
		text = await readFile(file, "utf8");
	} catch (error) {
		return { status: ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "") ? "missing" : "invalid", scripts: [] };
	}
	try { return { status: "ok", scripts: parseT3ProjectFile(text.replace(/^\uFEFF/, "")) }; } catch { return { status: "invalid", scripts: [] }; }
}
