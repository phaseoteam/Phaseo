import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { extractPublicModels } from "./artificial-analysis/public-page";

async function main() {
	const { values } = parseArgs({ options: { url: { type: "string", default: "https://artificialanalysis.ai/models" }, input: { type: "string" }, output: { type: "string" } } });
	if (!values.output) throw new Error("Supply --output <snapshot.json>; optionally --input <saved.html> and --url <public model page>");
	const url = new URL(values.url);
	if (url.origin !== "https://artificialanalysis.ai" || !/^\/models(?:\/[a-zA-Z0-9._-]+)?\/?$/.test(url.pathname) || url.username || url.password) throw new Error("Use an Artificial Analysis public model page URL");
	let html: string;
	if (values.input) html = readFileSync(values.input, "utf8");
	else {
		const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { Accept: "text/html" } });
		if (!response.ok) throw new Error(`Public page returned HTTP ${response.status}; no snapshot written`);
		if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("Expected public HTML");
		html = await response.text();
	}
	if (Buffer.byteLength(html) > 20_000_000) throw new Error("Public page exceeds the 20 MB extraction limit");
	const extractedAt = new Date().toISOString();
	const snapshot = { ...extractPublicModels(html, url.href, values.input ? null : extractedAt), extractedAt };
	// Exclusive creation prevents an accidental overwrite of an earlier source snapshot.
	writeFileSync(values.output, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
	console.log(JSON.stringify({ output: values.output, models: snapshot.models.length, methodologyVersions: snapshot.methodologyVersions, coverage: snapshot.coverage }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Public extraction failed"); process.exitCode = 1; });
