import type { GitDiffContents } from "../shared/workspace";
import { open } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git } from "./gitProcess";
import { gitFilename } from "./gitHunks";
import { withGitLock } from "./gitOperations";
import { parseGitStatus, resolveProjectPath } from "./projectFiles";
import { contentHash } from "./projectEdits";

function textContents(text: string) {
	if (text.includes("\0")) throw new Error("Binary files cannot expand unchanged text.");
	if (Buffer.byteLength(text) > 1024 * 1024 || text.split("\n").length > 10_000) throw new Error("Full context supports text files up to 1 MB and 10,000 lines.");
	return text;
}

function byteContents(bytes: Buffer) {
	if (bytes.length > 1024 * 1024) throw new Error("Full context supports text files up to 1 MB and 10,000 lines.");
	if (bytes.includes(0)) throw new Error("Binary files cannot expand unchanged text.");
	try { return textContents(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)); }
	catch (error) { if (error instanceof TypeError) throw new Error("Full context requires UTF-8 text.", { cause: error }); throw error; }
}

const execute = promisify(execFile);
async function blobContents(root: string, revision: string) {
	try { return byteContents((await execute("git", ["--no-pager", "show", revision], { cwd: root, windowsHide: true, timeout: 30_000, encoding: "buffer", maxBuffer: 1024 * 1024 + 1 })).stdout); }
	catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("Full context supports text files up to 1 MB and 10,000 lines.", { cause: error });
		throw error;
	}
}

async function workingContents(root: string, filename: string) {
	const file = await open(await resolveProjectPath(root, filename), "r");
	try {
		const metadata = await file.stat();
		if (!metadata.isFile() || metadata.size > 1024 * 1024) throw new Error("Full context supports text files up to 1 MB and 10,000 lines.");
		const bytes = Buffer.alloc(1024 * 1024 + 1); let offset = 0;
		while (offset < bytes.length) { const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
		return byteContents(bytes.subarray(0, offset));
	} finally { await file.close(); }
}

export async function readGitDiffContents(root: string, value: unknown): Promise<GitDiffContents> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diff context request.");
	const request = value as Record<string, unknown>, filename = gitFilename(request.filename);
	if (typeof request.staged !== "boolean" || typeof request.hash !== "string" || !/^[a-f0-9]{64}$/.test(request.hash)) throw new Error("Invalid diff context request.");
	const staged = request.staged;
	return withGitLock(root, async () => {
		const readDiff = () => git(root, ["diff", ...(staged ? ["--cached"] : []), "--no-ext-diff", "--no-textconv", "--full-index"]);
		const verifyDiff = async () => { if (contentHash(await readDiff()) !== request.hash) throw new Error("The diff changed. Refresh Git review before expanding context."); };
		await verifyDiff();
		const file = parseGitStatus(await git(root, ["status", "--porcelain=v1", "-z"])).find(file => file.path === filename);
		if (!file || !["M", "R", "C"].includes(staged ? file.indexStatus : file.worktreeStatus)) throw new Error("Full context is available for changed tracked text files.");
		const oldName = staged && /[RC]/.test(file.indexStatus) ? gitFilename(file.oldPath) : filename;
		const index = (await git(root, ["ls-files", "--stage", "-z", "--", `:(literal)${filename}`])).split("\0").filter(Boolean);
		if (index.length !== 1 || !/^100(?:644|755) [a-f0-9]+ 0\t/.test(index[0])) throw new Error("Full context requires a regular tracked file without conflicts.");
		if (staged) {
			const before = await git(root, ["ls-tree", "-z", "HEAD", "--", `:(literal)${oldName}`]);
			if (!/^100(?:644|755) blob /.test(before)) throw new Error("Full context requires a regular tracked file.");
		}
		const [oldText, newText] = await Promise.all([
			blobContents(root, `${staged ? "HEAD" : ":0"}:${oldName}`),
			staged ? blobContents(root, `:0:${filename}`) : workingContents(root, filename),
		]);
		await verifyDiff();
		return { oldFile: { name: oldName, contents: oldText }, newFile: { name: filename, contents: newText } };
	});
}
