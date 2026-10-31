import { createHash } from "node:crypto";
import type { AbstractIntlMessages } from "@/i18n/react";
import { selectClientMessages } from "./client-message-selection";
import generatedScopes from "./generated-client-scopes.json";
import { selectMessages, SHELL_MESSAGE_NAMESPACES } from "./message-scopes";

/** The shared shell dictionary, or the namespaces a route boundary declares. */
export type ClientMessagesScope = "shell" | readonly string[];

const digest = (text: string, length: number) => createHash("sha256").update(text).digest("hex").slice(0, length);

export function clientMessagesScopeId(scope: ClientMessagesScope): string {
	return scope === "shell" ? "shell" : digest(JSON.stringify([...scope].sort()), 12);
}

export function selectScopeMessages(messages: Record<string, unknown>, scope: ClientMessagesScope): AbstractIntlMessages {
	return scope === "shell" ? selectMessages(messages, SHELL_MESSAGE_NAMESPACES) : selectClientMessages(messages, scope);
}

/**
 * Names a dictionary by its content. The build publishes each file once under
 * this name, so browsers can cache it forever and a deployment that leaves the
 * copy unchanged keeps serving the same file to tabs opened before it.
 */
export function clientMessagesFile(locale: string, messages: AbstractIntlMessages): { key: string; json: string } {
	const json = JSON.stringify(messages);
	return { key: `${locale}/${digest(json, 16)}`, json };
}

/** Every dictionary a client provider can ask for: the shell plus each generated route scope. */
export function allClientMessageScopes(): ClientMessagesScope[] {
	return ["shell", ...Object.keys(generatedScopes).map((signature) => JSON.parse(signature) as string[])];
}
