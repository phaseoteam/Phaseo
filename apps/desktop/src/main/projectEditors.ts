import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { homedir } from "node:os";
import { editorDefinitions, validateProjectOpen, type EditorId, type EditorInstallation, type FileReference } from "../shared/editors";
import { resolveProjectPath } from "./projectFiles";

type EditorDefinition = typeof editorDefinitions[number];
type Lookup = { platform: NodeJS.Platform; searchPath: string; home: string; localAppData?: string; programFiles?: string };
const lookupDefaults = (): Lookup => ({ platform: process.platform, searchPath: process.env.PATH ?? "", home: homedir(), localAppData: process.env.LOCALAPPDATA, programFiles: process.env.ProgramFiles });

export function editorCandidates(editor: EditorDefinition, lookup: Lookup): string[] {
	const api = lookup.platform === "win32" ? path.win32 : path.posix;
	const directories = lookup.searchPath.split(lookup.platform === "win32" ? ";" : ":").filter(directory => api.isAbsolute(directory));
	const candidates = directories.flatMap(directory => lookup.platform === "win32"
		? [...editor.windows.map(name => api.join(directory, name)), ...editor.windows.map(name => api.resolve(directory, "..", name))]
		: editor.commands.map(name => api.join(directory, name)));
	if (lookup.platform === "darwin") for (const root of ["/Applications", api.join(lookup.home, "Applications")]) candidates.push(api.join(root, editor.mac));
	if (lookup.platform === "win32") {
		const folders: Partial<Record<EditorId, string>> = { vscode: "Microsoft VS Code", cursor: "cursor", "vscode-insiders": "Microsoft VS Code Insiders", vscodium: "VSCodium", zed: "Zed", trae: "Trae", kiro: "Kiro", antigravity: "Antigravity" };
		const folder = folders[editor.id];
		if (folder) for (const root of [lookup.localAppData && api.join(lookup.localAppData, "Programs"), lookup.programFiles]) if (root) candidates.push(...editor.windows.map(name => api.join(root, folder, name)));
	}
	return [...new Set(candidates)];
}

export async function findEditor(editor: EditorDefinition, lookup = lookupDefaults()): Promise<string | undefined> {
	for (const candidate of editorCandidates(editor, lookup)) {
		try { if ((await stat(candidate)).isFile()) { await access(candidate, lookup.platform === "win32" ? constants.F_OK : constants.X_OK); return candidate; } } catch { /* Try the next installation. */ }
	}
}

export async function editorInstallations(): Promise<EditorInstallation[]> {
	return Promise.all(editorDefinitions.map(async editor => ({ id: editor.id, name: editor.name, available: Boolean(await findEditor(editor)) })));
}

export function editorArguments(editor: EditorDefinition, target: string, executable?: string, position?: Pick<FileReference, "line" | "column">): string[] {
	const args = "args" in editor ? [...editor.args] : [];
	// The Kiro terminal launcher needs `ide`; its native app already is the IDE.
	if (editor.id === "kiro" && executable && path.basename(executable) !== "kiro") args.length = 0;
	if (!position?.line) return [...args, target];
	if ("positionStyle" in editor && editor.positionStyle === "line-column") return [...args, "--line", String(position.line), ...(position.column ? ["--column", String(position.column)] : []), target];
	const location = `${target}:${position.line}${position.column ? `:${position.column}` : ""}`;
	return [...args, ...(editor.id === "zed" ? [] : ["--goto"]), location];
}

export async function launchEditor(executable: string, args: string[], cwd: string): Promise<void> {
	const environment = { ...process.env };
	delete environment.ELECTRON_RUN_AS_NODE;
	delete environment.NODE_OPTIONS;
	await new Promise<void>((resolve, reject) => {
		const child = spawn(executable, args, { cwd, env: environment, shell: false, windowsHide: true, detached: true, stdio: "ignore" });
		child.once("error", reject);
		child.once("spawn", () => { child.unref(); resolve(); });
	});
}

type EditorPorts = {
	find: typeof findEditor;
	launch: typeof launchEditor;
	reveal: (filename: string) => void;
	openFolder: (directory: string) => Promise<string>;
};

export async function openProjectTarget(root: string, value: unknown, ports: EditorPorts): Promise<void> {
	const request = validateProjectOpen(value);
	const relative = request.filename && path.isAbsolute(request.filename) ? path.relative(await realpath(root), await realpath(request.filename)) : request.filename ?? "";
	const target = await resolveProjectPath(root, relative);
	const metadata = await stat(target);
	if (request.filename ? !metadata.isFile() : !metadata.isDirectory()) throw new Error("Choose an existing project file or folder.");
	if (request.editor === "file-manager") {
		if (request.filename) ports.reveal(target);
		else { const error = await ports.openFolder(target); if (error) throw new Error(error); }
		return;
	}
	const editor = editorDefinitions.find(editor => editor.id === request.editor)!;
	const executable = await ports.find(editor);
	if (!executable) throw new Error(`${editor.name} is unavailable. Install it and refresh the editor list.`);
	await ports.launch(executable, editorArguments(editor, target, executable, request), await resolveProjectPath(root, ""));
}
