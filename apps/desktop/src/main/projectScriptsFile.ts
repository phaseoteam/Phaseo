import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseProjectFile, projectFileName, type ProjectFileState } from "../shared/projectSettings";

/** A checkout's checked-in project file, for importing its scripts as actions. */
export async function readProjectScriptsFile(directory: string): Promise<ProjectFileState> {
	const file = path.join(directory, projectFileName);
	let text: string;
	try {
		const info = await stat(file);
		if (!info.isFile() || info.size > 1024 * 1024) return { status: "invalid", scripts: [] };
		text = await readFile(file, "utf8");
	} catch (error) {
		return { status: ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "") ? "missing" : "invalid", scripts: [] };
	}
	try { return { status: "ok", scripts: parseProjectFile(text.replace(/^\uFEFF/, "")) }; } catch { return { status: "invalid", scripts: [] }; }
}
