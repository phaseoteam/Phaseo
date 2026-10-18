// Purpose: Refresh the cached provider API specs used by the provider simulator.
// Why: This is the only part of the simulator that touches the network; everything else runs offline.
// How: Fetches each public spec in specs/sources.json (OpenAPI 3.x, Swagger 2 or a Google discovery
//      document), keeps only the text operations and the schemas they reference, and writes
//      specs/<id>.json with the source URL, fetch time and a SHA-256 of the original document.
//
// Usage: pnpm --filter @phaseo/gateway-api exec tsx tools/provider-simulator/scripts/refresh-specs.ts [id...]
// No API keys are used and no inference endpoint is called: only GETs of public spec documents.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

type OperationSource = { path?: string; method?: string; discoveryMethod?: string };
type Source = {
	id: string;
	url: string;
	format: "openapi" | "google-discovery";
	operations: Record<string, OperationSource>;
	docs?: string;
	notes?: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const specsDir = path.resolve(here, "../specs");

function collectRefs(node: unknown, out: Set<string>) {
	if (Array.isArray(node)) {
		node.forEach((item) => collectRefs(item, out));
		return;
	}
	if (!node || typeof node !== "object") return;
	for (const [key, value] of Object.entries(node)) {
		if (key === "$ref" && typeof value === "string") out.add(value);
		else collectRefs(value, out);
	}
}

function resolvePointer(root: any, ref: string): any {
	if (!ref.startsWith("#/")) return undefined;
	return ref.slice(2).split("/").reduce((node, part) => node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], root);
}

/** Copies every schema transitively referenced from `seeds` into components.schemas, rewriting refs. */
function closure(root: any, seeds: unknown[]): Record<string, any> {
	const schemas: Record<string, any> = {};
	const queue = new Set<string>();
	seeds.forEach((seed) => collectRefs(seed, queue));
	const seen = new Set<string>();
	while (queue.size) {
		const [ref] = queue;
		queue.delete(ref);
		if (seen.has(ref)) continue;
		seen.add(ref);
		const target = resolvePointer(root, ref);
		if (target === undefined) continue;
		const name = ref.split("/").pop()!;
		schemas[name] = target;
		const nested = new Set<string>();
		collectRefs(target, nested);
		nested.forEach((next) => { if (!seen.has(next)) queue.add(next); });
	}
	return schemas;
}

function rewriteRefs(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(rewriteRefs);
	if (!node || typeof node !== "object") return node;
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		out[key] = key === "$ref" && typeof value === "string" ? `#/components/schemas/${value.split("/").pop()}` : rewriteRefs(value);
	}
	return out;
}

function findOpenApiOperation(doc: any, wanted: OperationSource): any {
	const method = (wanted.method ?? "post").toLowerCase();
	const paths = doc.paths ?? {};
	const exact = paths[wanted.path!];
	if (exact?.[method]) return exact[method];
	const key = Object.keys(paths).find((candidate) => candidate.endsWith(wanted.path!));
	return key ? paths[key][method] : undefined;
}

function jsonSchemaOf(content: any): any {
	if (!content) return undefined;
	return content["application/json"]?.schema ?? content["text/event-stream"]?.schema ?? (Object.values(content)[0] as { schema?: unknown } | undefined)?.schema;
}

function fromOpenApi(doc: any, source: Source) {
	const operations: Record<string, any> = {};
	const seeds: unknown[] = [];
	for (const [key, wanted] of Object.entries(source.operations)) {
		const op = findOpenApiOperation(doc, wanted);
		if (!op) {
			console.warn(`[refresh-specs] ${source.id}: operation ${key} (${wanted.path}) not found`);
			continue;
		}
		const request = op.requestBody ? jsonSchemaOf(op.requestBody.content) : op.parameters?.find((p: any) => p.in === "body")?.schema;
		const ok = op.responses?.["200"] ?? op.responses?.["201"] ?? op.responses?.default;
		const response = ok ? jsonSchemaOf(ok.content) ?? ok.schema : undefined;
		operations[key] = { request, response };
		seeds.push(request, response);
	}
	const schemas = closure(doc, seeds);
	return {
		operations: rewriteRefs(operations) as Record<string, any>,
		components: { schemas: rewriteRefs(schemas) as Record<string, any> },
	};
}

/** Google discovery documents use bare `$ref: "Name"` and a `schemas` map; convert to OpenAPI-style refs. */
function discoveryToComponents(doc: any): Record<string, any> {
	const convert = (node: any): any => {
		if (Array.isArray(node)) return node.map(convert);
		if (!node || typeof node !== "object") return node;
		const out: Record<string, any> = {};
		for (const [key, value] of Object.entries(node)) {
			if (key === "$ref" && typeof value === "string") out.$ref = `#/components/schemas/${value}`;
			else if (key === "format" && (value === "int32" || value === "int64") && node.type === "string") out.type = "integer";
			else out[key] = convert(value);
		}
		if (out.type === "string" && (node.format === "int64" || node.format === "int32")) out.type = "integer";
		return out;
	};
	const schemas: Record<string, any> = {};
	for (const [name, schema] of Object.entries(doc.schemas ?? {})) schemas[name] = convert(schema);
	return schemas;
}

function findDiscoveryMethod(resources: any, id: string): any {
	for (const resource of Object.values(resources ?? {}) as any[]) {
		for (const method of Object.values(resource.methods ?? {}) as any[]) if (method.id === id) return method;
		const nested = findDiscoveryMethod(resource.resources, id);
		if (nested) return nested;
	}
	return undefined;
}

function fromDiscovery(doc: any, source: Source) {
	const all = discoveryToComponents(doc);
	const operations: Record<string, any> = {};
	const seeds: unknown[] = [];
	for (const [key, wanted] of Object.entries(source.operations)) {
		const method = findDiscoveryMethod(doc.resources, wanted.discoveryMethod!);
		if (!method) {
			console.warn(`[refresh-specs] ${source.id}: discovery method ${wanted.discoveryMethod} not found`);
			continue;
		}
		const request = method.request?.$ref ? { $ref: `#/components/schemas/${method.request.$ref}` } : undefined;
		const response = method.response?.$ref ? { $ref: `#/components/schemas/${method.response.$ref}` } : undefined;
		operations[key] = { request, response };
		seeds.push(request, response);
	}
	const schemas = closure({ components: { schemas: all } }, seeds);
	return { operations, components: { schemas } };
}

async function refresh(source: Source) {
	const response = await fetch(source.url, { headers: { accept: "application/json, application/yaml, text/yaml, */*" } });
	if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status} for ${source.url}`);
	const text = await response.text();
	const sha256 = crypto.createHash("sha256").update(text).digest("hex");
	const doc: any = text.trimStart().startsWith("{") ? JSON.parse(text) : yaml.load(text);
	const trimmed = source.format === "google-discovery" ? fromDiscovery(doc, source) : fromOpenApi(doc, source);
	const out = {
		id: source.id,
		source: { url: source.url, docs: source.docs ?? null, fetchedAt: new Date().toISOString(), sha256, handWritten: false, notes: source.notes ?? "" },
		...trimmed,
		// Base URL and authentication, for the upstream URL and header expectations.
		servers: source.format === "google-discovery"
			? [{ url: `${doc.rootUrl ?? ""}${doc.servicePath ?? ""}` }]
			: (Array.isArray(doc.servers) ? doc.servers : doc.host ? [{ url: `https://${doc.host}${doc.basePath ?? ""}` }] : []),
		securitySchemes: doc.components?.securitySchemes ?? doc.securityDefinitions ?? (doc.auth ? { oauth2: doc.auth } : {}),
		operationPaths: Object.fromEntries(Object.entries(source.operations).map(([key, op]) => [key, op.path ?? op.discoveryMethod ?? null])),
	};
	fs.writeFileSync(path.join(specsDir, `${source.id}.json`), `${JSON.stringify(out, null, "\t")}\n`);
	console.log(`[refresh-specs] ${source.id}: ${Object.keys(trimmed.operations).join(", ")}; ${Object.keys(trimmed.components.schemas ?? {}).length} schemas`);
}

async function main() {
	const { sources } = JSON.parse(fs.readFileSync(path.join(specsDir, "sources.json"), "utf8")) as { sources: Source[] };
	const only = new Set(process.argv.slice(2));
	let failures = 0;
	for (const source of sources) {
		if (only.size && !only.has(source.id)) continue;
		try {
			await refresh(source);
		} catch (error) {
			failures += 1;
			console.error(`[refresh-specs] ${source.id} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	process.exitCode = failures ? 1 : 0;
}

void main();
