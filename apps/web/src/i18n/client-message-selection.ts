import generatedScopes from "./generated-client-scopes.json";
import { selectMessages } from "./message-scopes";

/** Build-generated from client import graphs; imported by server boundaries only. */
export function selectClientMessages(messages: Record<string, unknown>, namespaces: readonly string[]) {
	const signature = JSON.stringify([...namespaces].sort());
	const scopes = (generatedScopes as Record<string, string[]>)[signature];
	if (!scopes) throw new Error(`Missing generated client message scope: ${signature}`);
	return selectMessages(messages, scopes);
}
