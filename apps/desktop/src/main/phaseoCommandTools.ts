import { defineTool, type AgentTool } from "@phaseo/agent-sdk";
import type { BackgroundCommands, BackgroundRead, BackgroundSummary } from "./backgroundCommands";
import { commandEnvironment } from "./commandEnvironment";
import { COMMAND_TIMEOUT_MS, commandShell, formatBytes, MAX_COMMAND_TIMEOUT_MS, runProjectCommand, type CommandResult, type ShellName } from "./runProjectCommand";
import { refreshProjectIndex } from "./projectFileSearch";

/** Command output a model sees from one call: a quarter from the start, the rest from the end. */
const MODEL_OUTPUT_LIMIT = 64 * 1024;
/** How long start_background_command waits for the first output. */
const FIRST_OUTPUT_MS = 2000;
const LONG_COMMAND = 4000;

const SHELL_LABELS: Record<ShellName, string> = { pwsh: "PowerShell 7 (pwsh)", powershell: "Windows PowerShell 5.1", sh: "/bin/sh" };
const SHELL_GUIDANCE: Record<ShellName, string> = {
	powershell: "This is Windows PowerShell 5.1, not bash: && and || are syntax errors, so separate commands with ; and use if ($?) { ... } to continue only after success. Use Get-ChildItem (-Force for hidden files) rather than ls -la, Select-String rather than grep, and $env:NAME for environment variables. Quote paths that contain spaces, and run a program at a quoted path with & \"C:\\path\\tool.exe\". Native exit codes are in $LASTEXITCODE.",
	pwsh: "This is PowerShell 7, not bash: && and || work, but use Get-ChildItem (-Force for hidden files) rather than ls -la, Select-String rather than grep, and $env:NAME for environment variables. Quote paths that contain spaces, and run a program at a quoted path with & \"C:\\path\\tool.exe\".",
	sh: "This is POSIX sh, not bash: avoid bash-only syntax such as [[ ]] and arrays, or run bash -c explicitly.",
};

function inputObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected the tool arguments as an object.");
	return value as Record<string, unknown>;
}
function requiredText(input: Record<string, unknown>, field: string) {
	if (typeof input[field] !== "string" || !(input[field] as string).trim()) throw new Error(`Expected ${field} as a non-empty string.`);
	return input[field] as string;
}
function optionalText(input: Record<string, unknown>, field: string) {
	if (input[field] === undefined || input[field] === null) return undefined;
	if (typeof input[field] !== "string") throw new Error(`Expected ${field} as a string.`);
	return input[field] as string;
}
function optionalNumber(input: Record<string, unknown>, field: string, minimum: number, maximum: number, advice: string) {
	if (input[field] === undefined || input[field] === null) return undefined;
	const value = input[field];
	if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${field} must be a number from ${minimum} to ${maximum}. ${advice}`);
	return value;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const outputBlock = (output: string) => output.trim() ? output.replace(/\s+$/, "") : "(none)";

/** A command result as plain text for the model. */
export function formatCommandResult(result: CommandResult) {
	return [
		`Exit code: ${result.exitCode ?? "none (stopped)"}`, `Duration: ${seconds(result.durationMs)}`, `Shell: ${result.shell}`,
		...result.stopped ? [`Stopped: ${result.stopped}`] : [],
		...result.truncated ? [`Truncated: ${formatBytes(result.truncated)} from the middle of the output were omitted.`] : [],
		"Output:", outputBlock(result.output),
	].join("\n");
}
function status(read: Pick<BackgroundRead, "running" | "exitCode" | "durationMs">) {
	return read.running ? `running for ${seconds(read.durationMs)}` : `exited with code ${read.exitCode ?? "none (stopped)"} after ${seconds(read.durationMs)}`;
}
function formatRead(id: string, read: BackgroundRead) {
	return [
		`Background command ${id}: ${status(read)}.`,
		...read.omitted ? [`[… ${formatBytes(read.omitted)} omitted; pass since=${read.startOffset - read.omitted} to read older output while it is still kept …]`] : [],
		read.output ? `Output (bytes ${read.startOffset}–${read.nextOffset}):\n${read.output.replace(/\s+$/, "")}` : "No new output.",
		`Next offset: ${read.nextOffset}`,
	].join("\n");
}
const summaryLine = (entry: BackgroundSummary) => `${entry.id}  ${entry.running ? `running ${seconds(entry.durationMs)}` : `${entry.stopped ? "stopped" : `exited ${entry.exitCode ?? ""}`.trim()} after ${seconds(entry.durationMs)}`}  pid ${entry.pid}  ${formatBytes(entry.outputBytes)} output  in ${entry.directory}\n    ${entry.command.split(/\r?\n/)[0].slice(0, 200)}${entry.command.includes("\n") || entry.command.length > 200 ? " …" : ""}`;

/** Approval-card text for a command tool call: the command verbatim, where and how long it runs, and warnings. */
export function describeCommandCall(name: string, input: unknown): { title: string; details: string } {
	const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
	const text = (field: string) => typeof value[field] === "string" ? value[field] as string : undefined;
	if (name === "run_command" || name === "start_background_command") {
		const command = text("command") ?? "", directory = text("directory"), timeout = value.timeoutSeconds;
		const warnings = commandWarnings(command);
		const lines = [
			...warnings.map(warning => `Warning: ${warning}`), ...warnings.length ? [""] : [],
			command, "",
			`Directory: ${directory && directory !== "." ? directory : "project root"}`,
			name === "run_command" ? `Timeout: ${typeof timeout === "number" ? `${timeout} s` : `${COMMAND_TIMEOUT_MS / 1000} s (default)`}` : "Runs in the background until stopped.",
		];
		return { title: name === "run_command" ? "Run command" : "Start background command", details: lines.join("\n") };
	}
	const titles: Record<string, string> = { read_background_output: "Read background output", stop_background_command: "Stop background command", list_background_commands: "List background commands" };
	if (titles[name]) return { title: titles[name], details: text("id") ? `Background command ${text("id")}` : "" };
	return { title: name, details: JSON.stringify(input, null, 2) ?? "" };
}

/** Control characters other than tab and line breaks, zero-width characters and bidirectional overrides. */
const hidden = (code: number) => (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0x7f || (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff;
/** Signs that a command hides what it does, or is too long to review at a glance. */
export function commandWarnings(command: string) {
	const warnings: string[] = [];
	if (command.length > LONG_COMMAND) warnings.push(`this command is ${command.length.toLocaleString("en-GB")} characters long. Read all of it before approving.`);
	// PowerShell accepts any prefix of -EncodedCommand down to -e.
	if (/-encodedc/i.test(command) || /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n;|]*\s[-/]e(?:c|n|nc|nco\w*)?\s+["']?[A-Za-z0-9+/=]{16,}/i.test(command)) warnings.push("it runs PowerShell with -EncodedCommand, which hides the script being run.");
	if (/FromBase64String|base64\s+(?:-d|--decode)|\[char\]\s*0x?[0-9a-f]+\s*\+|-join\s*\(\s*\[char/i.test(command)) warnings.push("it decodes text at run time, which can hide what it runs.");
	if (/[A-Za-z0-9+/]{200,}={0,2}/.test(command)) warnings.push("it contains a long base64-like string, which may hide a payload.");
	if ([...command].some(character => hidden(character.codePointAt(0)!))) warnings.push("it contains invisible or control characters that can make it look different from what runs.");
	return warnings;
}

/**
 * Shell tools for the Phaseo harness: `run_command`, plus background commands when `background` is given. `gate`
 * runs first with the command's directory; a string it returns becomes the tool result instead of running anything.
 */
export function phaseoCommandTools(root: string, options: { taskId: string; background?: BackgroundCommands; gate?: (path: string, kind: "file" | "directory") => Promise<string | undefined> }): AgentTool[] {
	const shell = commandShell(commandEnvironment()).name, label = SHELL_LABELS[shell];
	const run = defineTool({
		id: "run_command", requireApproval: true, onError: "return-to-model", timeoutMs: MAX_COMMAND_TIMEOUT_MS + 30_000,
		description: [
			`Run a shell command in the project after approval and get its exit code, duration and output (stdout and stderr together). Commands run in ${label}, without a terminal or input, so pass non-interactive flags (for example git commit -m, --yes).`,
			`The default timeout is ${COMMAND_TIMEOUT_MS / 1000} s; set timeoutSeconds up to ${MAX_COMMAND_TIMEOUT_MS / 1000} for long installs, builds or test suites. Processes the command starts are stopped when it finishes, so use start_background_command for dev servers, watchers and anything else that keeps running.`,
			SHELL_GUIDANCE[shell],
			"For searching, prefer rg or git grep when available. Long output keeps its start and end. Environment variables that look like credentials are not passed to commands.",
		].join(" "),
		parameters: { type: "object", properties: {
			command: { type: "string", description: `The command, in ${label} syntax.` },
			directory: { type: "string", description: "Folder to run in, relative to the project root. Defaults to the root." },
			timeoutSeconds: { type: "number", minimum: 1, maximum: MAX_COMMAND_TIMEOUT_MS / 1000, description: `Defaults to ${COMMAND_TIMEOUT_MS / 1000}.` },
		}, required: ["command"], additionalProperties: false },
		async execute(raw: unknown, context) {
			const input = inputObject(raw), command = requiredText(input, "command"), directory = optionalText(input, "directory") ?? ".";
			const timeout = optionalNumber(input, "timeoutSeconds", 1, MAX_COMMAND_TIMEOUT_MS / 1000, "Use start_background_command for anything that runs longer, such as servers and watchers.");
			const blocked = await options.gate?.(directory, "directory"); if (blocked) return blocked;
			// A command can create or delete files, so file search starts from a fresh index afterwards.
			try { return formatCommandResult(await runProjectCommand(root, command, directory, { signal: context.signal, timeoutMs: timeout === undefined ? undefined : timeout * 1000, outputLimit: MODEL_OUTPUT_LIMIT })); }
			finally { refreshProjectIndex(root); }
		},
	});
	const background = options.background;
	if (!background) return [run];
	const start = defineTool({
		id: "start_background_command", requireApproval: true, onError: "return-to-model", timeoutMs: 60_000,
		description: `Start a long-running command after approval, such as a dev server, watcher or log tail, in ${label}. It keeps running after this call returns, which gives its id and its first ~2 seconds of output. Check on it with read_background_output and stop it with stop_background_command when done. At most 8 per chat; they are stopped when the chat is deleted or archived, or the app quits.`,
		parameters: { type: "object", properties: {
			command: { type: "string", description: `The command, in ${label} syntax.` },
			directory: { type: "string", description: "Folder to run in, relative to the project root. Defaults to the root." },
		}, required: ["command"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw), command = requiredText(input, "command"), directory = optionalText(input, "directory") ?? ".";
			const blocked = await options.gate?.(directory, "directory"); if (blocked) return blocked;
			const started = await background.start(options.taskId, root, command, directory);
			await background.wait(options.taskId, started.id, FIRST_OUTPUT_MS);
			return `Started background command ${started.id} (PID ${started.pid}, shell ${started.shell}).\n${formatRead(started.id, background.read(options.taskId, started.id))}`;
		},
	});
	const read = defineTool({
		id: "read_background_output", onError: "return-to-model", timeoutMs: 30_000,
		description: "Read a background command's output. By default returns what it wrote since the last read (only the latest part of a large backlog); pass since with an earlier offset to page through older output, or tail for its last lines. Also reports whether it is still running.",
		parameters: { type: "object", properties: {
			id: { type: "string" },
			since: { type: "number", minimum: 0, description: "Byte offset to read from, such as a previous Next offset." },
			tail: { type: "number", minimum: 1, maximum: 2000, description: "Return only the last this many lines." },
		}, required: ["id"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw), id = requiredText(input, "id");
			const since = optionalNumber(input, "since", 0, Number.MAX_SAFE_INTEGER, "Use a Next offset from an earlier result."), tail = optionalNumber(input, "tail", 1, 2000, "Ask for fewer lines.");
			const blocked = await options.gate?.(".", "directory"); if (blocked) return blocked;
			return formatRead(id, background.read(options.taskId, id, { ...since !== undefined ? { since } : {}, ...tail !== undefined ? { tail } : {} }));
		},
	});
	const stop = defineTool({
		id: "stop_background_command", onError: "return-to-model", timeoutMs: 30_000,
		description: "Stop a background command and every process it started. Returns its final output since the last read.",
		parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
		async execute(raw: unknown) {
			const input = inputObject(raw), id = requiredText(input, "id");
			const blocked = await options.gate?.(".", "directory"); if (blocked) return blocked;
			const summary = await background.stop(options.taskId, id);
			const last = background.read(options.taskId, id, { maxBytes: 8 * 1024 });
			return `Stopped background command ${id}${summary.exitCode === null ? "" : ` (exit code ${summary.exitCode})`} after ${seconds(summary.durationMs)}.\n${last.output ? `Final output:\n${last.output.replace(/\s+$/, "")}` : "No new output."}`;
		},
	});
	const list = defineTool({
		id: "list_background_commands", onError: "return-to-model", timeoutMs: 30_000,
		description: "List this chat's background commands with their ids and whether they are still running.",
		parameters: { type: "object", properties: {}, additionalProperties: false },
		async execute() {
			const blocked = await options.gate?.(".", "directory"); if (blocked) return blocked;
			const entries = background.list(options.taskId);
			return entries.length ? entries.map(summaryLine).join("\n") : "No background commands in this chat.";
		},
	});
	return [run, start, read, stop, list];
}
