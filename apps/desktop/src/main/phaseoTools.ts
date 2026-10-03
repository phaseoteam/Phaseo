import { defineTool } from "@phaseo/agent-sdk";
import { listProjectFiles, readProjectFile } from "./projectFiles";
import { runProjectCommand } from "./runProjectCommand";
import { contentHash, writeProjectFile } from "./projectEdits";

function inputObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected tool arguments.");
	return value as Record<string, unknown>;
}
function textField(value: Record<string, unknown>, field: string): string {
	if (typeof value[field] !== "string") throw new Error(`Expected ${field}.`);
	return value[field];
}
export function phaseoTools(root: string, writable: boolean) {
	const files = defineTool({
		id: "project_files", description: "List a project directory or read a text file. Reading returns its content hash for safe edits.",
		parameters: { type: "object", properties: { path: { type: "string" }, action: { type: "string", enum: ["list", "read"] } }, required: ["path", "action"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw); const filename = textField(input, "path");
			if (input.action === "list") return listProjectFiles(root, filename);
			if (input.action !== "read") throw new Error("Choose read or list.");
			const content = await readProjectFile(root, filename); return { content, hash: contentHash(content) };
		},
	});
	const edit = defineTool({
		id: "write_project_file", description: "Write a complete text file after approval. Supply the hash returned by reading an existing file; use new for a new file.", requireApproval: true,
		parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, expectedHash: { type: "string" } }, required: ["path", "content", "expectedHash"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw); const filename = textField(input, "path"); const content = textField(input, "content"); const expected = textField(input, "expectedHash");
			return writeProjectFile(root, filename, content, expected);
		},
	});
	const command = defineTool({
		id: "run_project_command", description: `Run a command in the project after approval, using ${process.platform === "win32" ? "PowerShell" : "sh"}. Commands stop after 60 seconds and return the exit code and output.`, requireApproval: true,
		parameters: { type: "object", properties: { command: { type: "string" }, directory: { type: "string" } }, required: ["command"], additionalProperties: false },
		async execute(raw: unknown, context) { const input = inputObject(raw); return runProjectCommand(root, textField(input, "command"), input.directory === undefined ? "." : textField(input, "directory"), context.signal); },
	});
	return writable ? [files, edit, command] : [files];
}
