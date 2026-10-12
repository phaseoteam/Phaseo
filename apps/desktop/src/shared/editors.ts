export const editorDefinitions = [
	{ id: "vscode", name: "VS Code", commands: ["code"], windows: ["Code.exe"], mac: "Visual Studio Code.app/Contents/MacOS/Electron" },
	{ id: "cursor", name: "Cursor", commands: ["cursor"], windows: ["Cursor.exe"], mac: "Cursor.app/Contents/MacOS/Cursor", args: ["--classic"] },
	{ id: "vscode-insiders", name: "VS Code Insiders", commands: ["code-insiders"], windows: ["Code - Insiders.exe"], mac: "Visual Studio Code - Insiders.app/Contents/MacOS/Electron" },
	{ id: "vscodium", name: "VSCodium", commands: ["codium"], windows: ["VSCodium.exe"], mac: "VSCodium.app/Contents/MacOS/Electron" },
	{ id: "zed", name: "Zed", commands: ["zed", "zeditor"], windows: ["zed.exe"], mac: "Zed.app/Contents/MacOS/zed" },
	{ id: "trae", name: "Trae", commands: ["trae"], windows: ["Trae.exe"], mac: "Trae.app/Contents/MacOS/Trae" },
	{ id: "kiro", name: "Kiro", commands: ["kiro"], windows: ["Kiro.exe"], mac: "Kiro.app/Contents/MacOS/Electron", args: ["ide"] },
	{ id: "antigravity", name: "Antigravity", commands: ["antigravity-ide", "agy-ide"], windows: ["Antigravity.exe"], mac: "Antigravity.app/Contents/MacOS/Electron" },
	...([
		["idea", "IntelliJ IDEA"], ["aqua", "Aqua"], ["clion", "CLion"], ["datagrip", "DataGrip"], ["dataspell", "DataSpell"],
		["goland", "GoLand"], ["phpstorm", "PhpStorm"], ["pycharm", "PyCharm"], ["rider", "Rider"], ["rubymine", "RubyMine"], ["rustrover", "RustRover"], ["webstorm", "WebStorm"],
	] as const).map(([id, name]) => ({ id, name, commands: [id], windows: [`${id}64.exe`, `${id}.exe`], mac: `${name}.app/Contents/MacOS/${id}`, positionStyle: "line-column" as const })),
] as const;

export type EditorId = typeof editorDefinitions[number]["id"];
export type EditorInstallation = { id: EditorId; name: string; available: boolean };
export type FileReference = { filename: string; line?: number; column?: number };
export type ProjectOpenRequest = { editor: EditorId | "file-manager"; filename?: string; line?: number; column?: number };

export function parseFileReference(href: string): FileReference | undefined {
	if (!href || href.startsWith("#") || href.length > 4096) return;
	let value = href;
	if (/^file:\/\//i.test(value)) {
		try {
			const url = new URL(value);
			if (url.host && url.host !== "localhost" || url.search) return;
			value = url.pathname + url.hash;
			if (/^\/[a-z]:\//i.test(value)) value = value.slice(1);
		} catch { return; }
	} else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return;
	let line: number | undefined, column: number | undefined;
	const fragment = /#L(\d+)(?:C(\d+)|-L\d+)?$/i.exec(value);
	const position = fragment ?? /:(\d+)(?::(\d+))?$/.exec(value);
	if (position) { line = Number(position[1]); column = position[2] ? Number(position[2]) : undefined; value = value.slice(0, position.index); }
	else if (value.includes("#")) return;
	try { value = decodeURIComponent(value); } catch { return; }
	if (!value || value.includes("\0") || (line !== undefined && (!Number.isSafeInteger(line) || line < 1 || line > 10_000_000)) || (column !== undefined && (!Number.isSafeInteger(column) || column < 1 || column > 10_000_000))) return;
	return { filename: value, ...(line === undefined ? {} : { line }), ...(column === undefined ? {} : { column }) };
}

export function validateProjectOpen(value: unknown): ProjectOpenRequest {
	if (!value || typeof value !== "object") throw new Error("Invalid editor request.");
	const input = value as Record<string, unknown>;
	if (typeof input.editor !== "string" || (input.editor !== "file-manager" && !editorDefinitions.some(editor => editor.id === input.editor))) throw new Error("Choose a supported editor.");
	if (input.filename !== undefined && (typeof input.filename !== "string" || !input.filename || input.filename.length > 4096 || input.filename.includes("\0"))) throw new Error("Invalid file request.");
	for (const key of ["line", "column"]) if (input[key] !== undefined && (typeof input[key] !== "number" || !Number.isSafeInteger(input[key]) || (input[key] as number) < 1 || (input[key] as number) > 10_000_000)) throw new Error("Invalid file position.");
	if ((input.line !== undefined && (!input.filename || input.editor === "file-manager")) || (input.column !== undefined && input.line === undefined)) throw new Error("Choose a file and line for this position.");
	return { editor: input.editor as ProjectOpenRequest["editor"], ...(input.filename === undefined ? {} : { filename: input.filename as string }), ...(input.line === undefined ? {} : { line: input.line as number }), ...(input.column === undefined ? {} : { column: input.column as number }) };
}
