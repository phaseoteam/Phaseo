import { nativeActionPrefix, type NativeAction, type NativeActionEntry } from "../../shared/nativeActions";
import type { PromptCommand } from "../../shared/promptCommands";

/** `/` only opens at the start of a message; `@` and `#` (pull requests, T3's composer) open after a space or at the start. */
export type Trigger = { kind: "slash" | "mention" | "pull-request"; query: string; start: number; end: number };
export function findTrigger(value: string, caret: number): Trigger | undefined {
	const before = value.slice(0, caret);
	const slash = /^\/(\S*)$/.exec(before);
	if (slash) return { kind: "slash", query: slash[1], start: 0, end: caret };
	const mention = /(?:^|\s)@([^\s@]*)$/.exec(before);
	if (mention) return { kind: "mention", query: mention[1], start: caret - mention[1].length - 1, end: caret };
	const pull = /(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)?$/u.exec(before);
	if (pull) return { kind: "pull-request", query: pull[1] ?? "", start: caret - (pull[1] ?? "").length - 1, end: caret };
}

/** Where a typed `/name` resolves at send time: a saved prompt is expanded, a native command is sent as one. */
export function resolveSlash(text: string, commands: PromptCommand[], actions: NativeActionEntry[]): { command?: PromptCommand; action?: NativeAction; arguments: string } | undefined {
	const match = /^(\/\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
	if (!match) return;
	const argumentsValue = (match[2] ?? "").trim();
	const command = commands.find(value => `/${value.name}` === match[1]);
	if (command) return { command, arguments: argumentsValue };
	const entry = actions.find(value => nativeActionPrefix(value) === match[1]);
	if (entry) return { action: { kind: entry.kind, id: entry.id, name: entry.name, arguments: argumentsValue }, arguments: argumentsValue };
}
