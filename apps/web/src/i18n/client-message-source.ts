import type { AbstractIntlMessages } from "@/i18n/react";

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

const RETRY_DELAYS_MS = [250, 1000];
const OFFLINE_WAIT_MS = 30_000;

// An offline tab keeps its server-rendered page and retries once the connection
// returns, or after 30 s in case the browser never reports it; other failures
// get a short backoff.
function waitBeforeRetry(delayMs: number): Promise<void> {
	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		return new Promise((resolve) => {
			const done = () => {
				window.removeEventListener("online", done);
				clearTimeout(timer);
				resolve();
			};
			const timer = setTimeout(done, OFFLINE_WAIT_MS);
			window.addEventListener("online", done);
		});
	}
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Loads a dictionary in the browser: the published file, else the current
 * deployment's copy of the same scope. Gives up after three attempts, or at once
 * when the deployment no longer knows the scope.
 */
export async function fetchClientMessages(
	source: ClientMessagesSource,
	wait: (delayMs: number) => Promise<void> = waitBeforeRetry,
): Promise<AbstractIntlMessages> {
	for (let attempt = 0; ; attempt++) {
		const published = await fetch(clientMessagesUrl(source)).catch(() => null);
		if (published?.ok) return published.json();
		// The published file is missing only when this tab predates a deployment
		// that changed the copy; the current deployment still serves the scope.
		const current = await fetch(clientMessagesFallbackUrl(source)).catch(() => null);
		if (current?.ok) return current.json();
		if (current?.status === 404 || attempt >= RETRY_DELAYS_MS.length) {
			throw new Error(`Translations ${source.key} could not be loaded`);
		}
		await wait(RETRY_DELAYS_MS[attempt]);
	}
}
