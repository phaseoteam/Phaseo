import generatedScopes from "./generated-client-scopes.json";
import { selectMessages } from "./message-scopes";

/** Build-generated from client import graphs; imported by server boundaries only. */
export function selectClientMessages(messages: Record<string, unknown>, namespaces: readonly string[]) {
	const signature = JSON.stringify([...namespaces].sort());
	const scopes = (generatedScopes as Record<string, string[]>)[signature];
	if (!scopes) throw new Error(`Missing generated client message scope: ${signature}`);
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
	return selectMessages(messages, paths);
}
