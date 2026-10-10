import generatedScopes from "./generated-client-scopes.json";
import { selectMessages } from "./message-scopes";

// Bundled public dictionaries are immutable and reused per locale. Keep each
// selected tree stable too, so repeated boundaries can share its RSC reference.
// Weak keys release old source dictionaries when development reloads them.
const selectedMessages = new WeakMap<Record<string, unknown>, Map<string, ReturnType<typeof selectMessages>>>();

/** Build-generated from client import graphs; imported by server boundaries only. */
export function selectClientMessages(messages: Record<string, unknown>, namespaces: readonly string[]) {
	const signature = JSON.stringify([...namespaces].sort());
	const scopes = (generatedScopes as Record<string, string[]>)[signature];
	if (!scopes) throw new Error(`Missing generated client message scope: ${signature}`);
	const cached = selectedMessages.get(messages)?.get(signature);
	if (cached) return cached;
	// Raw metadata arrays must retain their shape. A numeric translation path
	// selects the array container instead of rebuilding it as an object.
	const paths = scopes.map((scope) => {
		let value: unknown = messages;
		const parts = scope.split(".");
		for (let index = 0; index < parts.length; index++) {
			if (Array.isArray(value)) return parts.slice(0, index).join(".");
			value = value && typeof value === "object" ? (value as Record<string, unknown>)[parts[index]!] : undefined;
		}
		return scope;
	});
	const selected = selectMessages(messages, paths);
	let selections = selectedMessages.get(messages);
	if (!selections) {
		selections = new Map();
		selectedMessages.set(messages, selections);
	}
	selections.set(signature, selected);
	return selected;
}
