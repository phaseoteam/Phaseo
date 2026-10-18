import type { AbstractIntlMessages } from "next-intl";

/**
 * What a server boundary hands its client provider instead of a dictionary:
 * `key` names the published file (`<locale>/<content hash>`) and `scope` names
 * the boundary, so a tab that outlives a deployment can still load its copy.
 */
export type ClientMessagesSource = { key: string; scope: string };

declare global {
	// Dictionaries prepared by server boundaries for client providers rendering
	// in the same process. Keys are content-addressed, so entries never change.
	var __phaseoClientMessages: Map<string, AbstractIntlMessages> | undefined;
	// Prepares a dictionary that a client provider needs before its boundary ran.
	var __phaseoLoadClientMessages: ((source: ClientMessagesSource) => Promise<AbstractIntlMessages>) | undefined;
}

/** Published by scripts/generate-client-message-files.mts into public/_i18n. */
export function clientMessagesUrl(source: ClientMessagesSource): string {
	return `/_i18n/${source.key}.json`;
}

/** Serves the current deployment's copy when the published file is gone. */
export function clientMessagesFallbackUrl(source: ClientMessagesSource): string {
	const locale = source.key.slice(0, source.key.indexOf("/"));
	return `/api/i18n/scope/${encodeURIComponent(locale)}/${encodeURIComponent(source.scope)}`;
}
