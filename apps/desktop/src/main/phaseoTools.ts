import { defineTool } from "@phaseo/agent-sdk";
import { listProjectFiles, readProjectFile } from "./projectFiles";
import { runProjectCommand } from "./runProjectCommand";
import { contentHash, writeProjectFile } from "./projectEdits";
import type { ProjectInstructions } from "./projectInstructions";

function inputObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected tool arguments.");
	return value as Record<string, unknown>;
}
function textField(value: Record<string, unknown>, field: string): string {
	if (typeof value[field] !== "string") throw new Error(`Expected ${field}.`);
	return value[field];
}
export function phaseoTools(root: string, writable: boolean, instructions?: ProjectInstructions) {
	const instructionState = () => instructions ? { instructionRevision: instructions.revision(), instructionFiles: instructions.list().map(file => file.path) } : {};
	const instructionGate = (input: Record<string, unknown>) => instructions && ((instructions.list().length && input.instructionRevision === undefined) || (input.instructionRevision !== undefined && input.instructionRevision !== instructions.revision()))
		? { blocked: true, reason: "Project instructions changed or were newly loaded. Review them before retrying this action.", ...instructionState() } : undefined;
	const files = defineTool({
		id: "project_files", description: "List a project directory or read a text file. Reading returns its content hash for safe edits.",
		parameters: { type: "object", properties: { path: { type: "string" }, action: { type: "string", enum: ["list", "read"] } }, required: ["path", "action"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw); const filename = textField(input, "path");
			if (input.action === "list") { await instructions?.load(filename, true); return instructions ? { files: await listProjectFiles(root, filename), ...instructionState() } : listProjectFiles(root, filename); }
			if (input.action !== "read") throw new Error("Choose read or list.");
			await instructions?.load(filename);
			const content = await readProjectFile(root, filename); return { content, hash: contentHash(content), ...instructionState() };
		},
	});
	const edit = defineTool({
		id: "write_project_file", description: "Write a complete text file after approval. Supply the hash returned by reading an existing file; use new for a new file.", requireApproval: true,
		parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, expectedHash: { type: "string" }, instructionRevision: { type: "string", description: "Current project instruction revision from the instructions or latest file read." } }, required: ["path", "content", "expectedHash"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw); const filename = textField(input, "path"); const content = textField(input, "content"); const expected = textField(input, "expectedHash");
			await instructions?.load(filename); const blocked = instructionGate(input); if (blocked) return blocked;
			return writeProjectFile(root, filename, content, expected);
		},
	});
	const command = defineTool({
		id: "run_project_command", description: `Run a command in the project after approval, using ${process.platform === "win32" ? "PowerShell" : "sh"}. Commands stop after 60 seconds and return the exit code and output.`, requireApproval: true,
		parameters: { type: "object", properties: { command: { type: "string" }, directory: { type: "string" }, instructionRevision: { type: "string", description: "Current project instruction revision." } }, required: ["command"], additionalProperties: false },
		async execute(raw: unknown, context) {
			const input = inputObject(raw), directory = input.directory === undefined ? "." : textField(input, "directory");
			await instructions?.load(directory, true); const blocked = instructionGate(input); if (blocked) return blocked;
			return runProjectCommand(root, textField(input, "command"), directory, context.signal);
		},
	});
	return writable ? [files, edit, command] : [files];
}
