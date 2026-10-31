
import type { AbstractIntlMessages } from "@/i18n/react";
import { preload } from "react-dom";
import {
	allClientMessageScopes,
	clientMessagesFile,
	clientMessagesScopeId,
	selectScopeMessages,
	type ClientMessagesScope,
} from "./client-message-files";
import { clientMessagesUrl, type ClientMessagesSource } from "./client-message-source";
import { getPublicMessages } from "./messages";
import { isPublicLocale, type PublicLocale } from "./routing";

// Client providers read their dictionary from here while rendering on the
// server, so the dictionary never travels in the page payload. Browsers fetch
// the same content from the published file instead.
const prepared = (globalThis.__phaseoClientMessages ??= new Map<string, AbstractIntlMessages>());
const sources = new Map<string, Promise<ClientMessagesSource>>();
const loading = new Map<string, Promise<AbstractIntlMessages>>();

export function resolveClientMessages(locale: PublicLocale, scope: ClientMessagesScope): Promise<ClientMessagesSource> {
	const id = clientMessagesScopeId(scope);
	const cacheKey = `${locale}:${id}`;
	const existing = sources.get(cacheKey);
	if (existing) return existing;
	const pending = getPublicMessages(locale).then((messages) => {
		const selected = selectScopeMessages(messages as Record<string, unknown>, scope);
		const { key } = clientMessagesFile(locale, selected);
		prepared.set(key, selected);
		return { key, scope: id };
	});
	sources.set(cacheKey, pending);
	pending.catch(() => sources.delete(cacheKey));
	return pending;
}

/** Use in a server boundary: returns the reference its client provider loads, and preloads the file. */
export async function prepareClientMessages(locale: PublicLocale, scope: ClientMessagesScope): Promise<ClientMessagesSource> {
	const source = await resolveClientMessages(locale, scope);
	preload(clientMessagesUrl(source), { as: "fetch", crossOrigin: "anonymous" });
	return source;
}

/** Server-side lookup for a provider whose boundary did not run in this process. */
function loadClientMessages(source: ClientMessagesSource): Promise<AbstractIntlMessages> {
	const ready = prepared.get(source.key);
	if (ready) return Promise.resolve(ready);
	const existing = loading.get(source.key);
	if (existing) return existing;
	const pending = (async () => {
		const locale = source.key.slice(0, source.key.indexOf("/"));
		const scope = allClientMessageScopes().find((candidate) => clientMessagesScopeId(candidate) === source.scope);
		if (!isPublicLocale(locale) || !scope) throw new Error(`Unknown client messages ${source.key}`);
		await resolveClientMessages(locale, scope);
		const messages = prepared.get(source.key);
		if (!messages) throw new Error(`Client messages ${source.key} do not match this deployment`);
		return messages;
	})();
	loading.set(source.key, pending);
	pending.catch(() => loading.delete(source.key));
	return pending;
}

globalThis.__phaseoLoadClientMessages ??= loadClientMessages;
