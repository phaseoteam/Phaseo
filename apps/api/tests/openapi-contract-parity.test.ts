import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { inferenceRouter } from "@/routes/v1/data";
import { platformRouter } from "@/routes/v1/control";

const HTTP_METHODS = new Set([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
	"TRACE",
]);

const SPEC_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../docs/openapi/v1/openapi.yaml",
);

function normalizePath(value: string): string {
	return value
		.replace(/:[A-Za-z0-9_]+/g, "{param}")
		.replace(/\{[^/]+\}/g, "{param}");
}

function parseSpecOperations(specText: string): Set<string> {
	const operations = new Set<string>();
	const lines = specText.split(/\r?\n/);

	let inPaths = false;
	let currentPath: string | null = null;

	for (const line of lines) {
		if (!inPaths) {
			if (line.trim() === "paths:") inPaths = true;
			continue;
		}

		if (line.length > 0 && !line.startsWith(" ")) break;

		const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
		if (pathMatch) {
			currentPath = pathMatch[1];
			continue;
		}

		const methodMatch = line.match(
			/^    (get|post|put|patch|delete|head|options|trace):\s*$/i,
		);
		if (methodMatch && currentPath) {
			operations.add(`${methodMatch[1].toUpperCase()} ${normalizePath(currentPath)}`);
		}
	}

	return operations;
}

function collectRouteOperations(): Set<string> {
	const operations = new Set<string>();
	const routes = [
		...((inferenceRouter as any).routes ?? []),
		...((platformRouter as any).routes ?? []),
	] as Array<{ method?: string; path?: string }>;

	for (const route of routes) {
		const method = String(route.method ?? "").toUpperCase();
		const routePath = String(route.path ?? "");
		if (!HTTP_METHODS.has(method) || !routePath) continue;
		operations.add(`${method} ${normalizePath(routePath)}`);
	}

	return operations;
}

function sorted(values: Iterable<string>): string[] {
	return Array.from(values).sort((a, b) => a.localeCompare(b));
}

describe("OpenAPI Contract Parity", () => {
	it("keeps docs OpenAPI path+method pairs aligned with mounted v1 routes", () => {
		const specText = fs.readFileSync(SPEC_PATH, "utf8");
		const specOperations = parseSpecOperations(specText);
		const routeOperations = collectRouteOperations();

		const missingInSpec = sorted(
			Array.from(routeOperations).filter((operation) => !specOperations.has(operation)),
		);
		const missingInRoutes = sorted(
			Array.from(specOperations).filter((operation) => !routeOperations.has(operation)),
		);

		expect(
			{ missingInSpec, missingInRoutes },
			`OpenAPI parity mismatch.\nMissing in spec: ${missingInSpec.join(", ") || "none"}\nMissing in routes: ${missingInRoutes.join(", ") || "none"}`,
		).toEqual({
			missingInSpec: [],
			missingInRoutes: [],
		});
	});
});
