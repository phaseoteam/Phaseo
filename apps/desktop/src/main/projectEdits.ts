import { createHash } from "node:crypto";
import { realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { readProjectFile, resolveProjectPath } from "./projectFiles";

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function writeProjectFile(root: string, filename: string, content: string, expected: string) {
	if (!filename || path.isAbsolute(filename) || filename.includes("\0") || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error("Invalid file edit.");
	let destination: string;
	if (expected === "new") {
		const parent = await resolveProjectPath(root, path.dirname(filename)); destination = path.join(parent, path.basename(filename));
		await writeFile(destination, content, { encoding: "utf8", flag: "wx" });
	} else {
		destination = await resolveProjectPath(root, filename);
		if (contentHash(await readProjectFile(root, filename)) !== expected) throw new Error("The file changed since it was read. Read it again before editing.");
		if (await realpath(destination) !== await resolveProjectPath(root, filename)) throw new Error("The file path changed.");
		await writeFile(destination, content, "utf8");
	}
	return { path: filename, hash: contentHash(content) };
}
