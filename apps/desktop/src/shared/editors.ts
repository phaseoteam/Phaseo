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
	] as const).map(([id, name]) => ({ id, name, commands: [id], windows: [`${id}64.exe`, `${id}.exe`], mac: `${name}.app/Contents/MacOS/${id}` })),
] as const;

export type EditorId = typeof editorDefinitions[number]["id"];
export type EditorInstallation = { id: EditorId; name: string; available: boolean };
export type ProjectOpenRequest = { editor: EditorId | "file-manager"; filename?: string };

export function validateProjectOpen(value: unknown): ProjectOpenRequest {
	if (!value || typeof value !== "object") throw new Error("Invalid editor request.");
	const input = value as Record<string, unknown>;
	if (typeof input.editor !== "string" || (input.editor !== "file-manager" && !editorDefinitions.some(editor => editor.id === input.editor))) throw new Error("Choose a supported editor.");
	if (input.filename !== undefined && (typeof input.filename !== "string" || !input.filename || input.filename.length > 4096 || input.filename.includes("\0"))) throw new Error("Invalid file request.");
	return { editor: input.editor as ProjectOpenRequest["editor"], ...(input.filename === undefined ? {} : { filename: input.filename as string }) };
}
