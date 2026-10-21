// Publishes every client dictionary as a static file, so pages can reference
// their copy instead of embedding it: public/_i18n/<locale>/<content hash>.json.
// Run with `node --import tsx` after validate-message-scopes.mjs has refreshed
// src/i18n/generated-client-scopes.json; the server derives the same file names.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allClientMessageScopes, clientMessagesFile, selectScopeMessages } from "../src/i18n/client-message-files";
import { getPublicMessages } from "../src/i18n/message-catalogs";
import { publicLocales } from "../src/i18n/locales";

const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "_i18n");
rmSync(outputDirectory, { recursive: true, force: true });

let files = 0;
let bytes = 0;
const scopes = allClientMessageScopes();
for (const locale of publicLocales) {
	const messages = await getPublicMessages(locale) as Record<string, unknown>;
	const written = new Set<string>();
	for (const scope of scopes) {
		const { key, json } = clientMessagesFile(locale, selectScopeMessages(messages, scope));
		if (written.has(key)) continue;
		written.add(key);
		const file = path.join(outputDirectory, `${key}.json`);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, json);
		files += 1;
		bytes += Buffer.byteLength(json);
	}
}
console.log(`Published ${files} client dictionaries (${scopes.length} scopes × ${publicLocales.length} locales, ${(bytes / 1024 / 1024).toFixed(1)} MB) to public/_i18n.`);
