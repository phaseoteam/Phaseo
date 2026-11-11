import { phoneLimits, type PhoneScript, type PhoneServer, type PhoneTerminal } from "@phaseo/phone-protocol";
import type { ProjectScript } from "../../shared/projectSettings";
import type { ThreadServer } from "../../shared/threadServers";
import type { TerminalSession } from "../../shared/workspace";

export const phoneTerminal = (session: TerminalSession): PhoneTerminal => ({
	id: session.id, title: session.title, ...session.taskId ? { chatId: session.taskId } : {}, ...session.projectId ? { projectId: session.projectId } : {},
	...session.scriptId ? { scriptId: session.scriptId } : {}, status: session.status, ...session.exitCode !== undefined ? { exitCode: session.exitCode } : {}, createdAt: session.createdAt,
});

/** A chat's terminals as the phone lists them: running ones first, then finished transcripts, oldest first in each. */
export const chatTerminals = (sessions: readonly TerminalSession[], chatId: string) => sessions
	.filter(session => !session.ephemeral && session.taskId === chatId)
	.sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || a.createdAt.localeCompare(b.createdAt))
	.map(phoneTerminal);

export const phoneScripts = (scripts: readonly ProjectScript[]): PhoneScript[] => scripts.map(script => ({ id: script.id, name: script.name, command: script.command.slice(0, 500) }));
export const phoneServers = (servers: readonly ThreadServer[]): PhoneServer[] => servers.map(server => ({ port: server.port, url: server.url, ...server.process ? { process: server.process } : {}, startedBy: server.startedBy }));

/** What a string costs in a frame: control characters such as Esc grow to six bytes each once JSON-encoded. */
const encodedBytes = (text: string) => Buffer.byteLength(JSON.stringify(text)) - 2;
/** Never start between the halves of an emoji. */
const fromWhole = (text: string, start: number) => (start > 0 && start < text.length && /[\uDC00-\uDFFF]/.test(text[start]!) ? start + 1 : start);

/** The latest output that fits `budget` bytes as JSON, and whether anything older was left out. */
export function latestOutput(text: string, budget: number) {
	if (encodedBytes(text) <= budget) return { data: text, cut: false };
	// The shortest tail that's too big is found by halving; the answer starts just after it.
	let fits = text.length, tooBig = 0;
	while (fits - tooBig > 1) { const middle = (fits + tooBig) >> 1; if (encodedBytes(text.slice(middle)) <= budget) fits = middle; else tooBig = middle; }
	return { data: text.slice(fromWhole(text, fits)), cut: true };
}

/**
 * The output attach_terminal sends: the latest phoneLimits.terminalReplayBytes, from the start of a line when one begins
 * near the cut, so the phone doesn't open on half an escape sequence.
 */
export function terminalReplay(output: string) {
	const { data, cut } = latestOutput(output, phoneLimits.terminalReplayBytes);
	if (!cut) return { output: data, truncated: false };
	const line = data.indexOf("\n");
	return { output: line >= 0 && line < 4096 ? data.slice(line + 1) : data, truncated: true };
}
