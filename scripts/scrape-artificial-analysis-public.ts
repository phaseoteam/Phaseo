import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { extractFullPublicModels, publicDataManifest } from "./artificial-analysis/public-page";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { databaseModelMappings, matchModels, type CatalogModel, type SourceModel } from "./artificial-analysis/core";

async function main() {
	const { values } = parseArgs({ options: { url: { type: "string", default: "https://artificialanalysis.ai/models" }, input: { type: "string" }, data: { type: "string" }, output: { type: "string" }, "match-db": { type: "boolean" }, write: { type: "boolean" } } });
	if (!values.output) throw new Error("Supply --output <snapshot.json>; optionally --input <saved.html>, --data <saved-data.txt>, and --match-db");
	if (values.write && (!values["match-db"] || values.input || values.data || values.url !== "https://artificialanalysis.ai/models")) throw new Error("Publication requires a fresh full /models fetch and --match-db");
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
	const manifest = publicDataManifest(html);
	let bytes: Buffer;
	if (values.data) bytes = readFileSync(values.data);
	else {
		const response = await fetch(new URL(manifest.path, url), { redirect: "error", signal: AbortSignal.timeout(30_000) });
		if (!response.ok) throw new Error(`Public dataset returned HTTP ${response.status}; no snapshot written`);
		bytes = Buffer.from(await response.arrayBuffer());
	}
	if (bytes.length > 20_000_000) throw new Error("Public dataset exceeds 20 MB");
	const extractedAt = new Date().toISOString();
	const full = extractFullPublicModels(html, bytes, url.href, extractedAt);
	let matching;
	if (values["match-db"]) {
		const db = createAdminClient();
		const catalogue: CatalogModel[] = [];
		for (let offset = 0; ; offset += 500) {
			const { data, error } = await db.from("v2_models").select("model_slug,name,lab_slug,metadata").order("model_slug").range(offset, offset + 499);
			if (error) throw new Error(`Catalogue read failed: ${error.code}`);
			for (const row of data ?? []) catalogue.push({ model_id: row.model_slug, name: row.name, organisation_id: row.lab_slug, metadata: row.metadata });
			if ((data ?? []).length < 500) break;
		}
		const sources: SourceModel[] = full.models.map((model) => ({ id: model.id as string, slug: model.slug as string, name: model.name as string, model_creator: model.creator as SourceModel["model_creator"], evaluations: {}, artificial_analysis_intelligence_index_cost: null }));
		const creators = JSON.parse(readFileSync(new URL("./artificial-analysis/creators.json", import.meta.url), "utf8"));
		const matches = matchModels(catalogue, sources, { models: databaseModelMappings(catalogue), creators });
		const owners = new Map<string, string>();
		for (let index = 0; index < matches.length; index++) for (const source of matches[index].sources ?? []) owners.set(source.id, catalogue[index].model_id);
		matching = { catalogueModels: catalogue.length, matchedModels: matches.filter((match) => match.status === "matched").length,
			models: catalogue.map((model, index) => ({ model_id: model.model_id, status: matches[index].status, sourceIds: (matches[index].sources ?? []).map((source) => source.id), candidateIds: matches[index].candidates.map((source) => source.id) })),
			sources: sources.map((source) => ({ id: source.id, name: source.name, model_id: owners.get(source.id) ?? null })) };
	}
	const snapshot = { ...full, fetchedAt: values.input || values.data ? null : extractedAt, extractedAt, matching };
	// Exclusive creation prevents an accidental overwrite of an earlier source snapshot.
	writeFileSync(values.output, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
	if (values.write) {
		if (snapshot.methodologyVersions.length !== 1 || !matching?.matchedModels) throw new Error("Cannot publish without an unambiguous methodology and matched models");
		const contentHash = createHash("sha256").update(JSON.stringify({ models: snapshot.models, owners: matching.sources, versions: snapshot.methodologyVersions, dataUrl: snapshot.dataUrl })).digest("hex");
		const { data, error } = await createAdminClient().rpc("publish_artificial_analysis_public_snapshot", { p_snapshot: { ...snapshot, contentHash } });
		if (error) throw new Error(`Public snapshot publication failed: ${error.code}`);
		console.log(JSON.stringify({ publishedSnapshot: data }));
	}
	console.log(JSON.stringify({ output: values.output, models: snapshot.models.length, methodologyVersions: snapshot.methodologyVersions, coverage: snapshot.coverage, matchedModels: matching?.matchedModels, matchedConfigurations: matching?.sources.filter((source) => source.model_id).length }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Public extraction failed"); process.exitCode = 1; });
