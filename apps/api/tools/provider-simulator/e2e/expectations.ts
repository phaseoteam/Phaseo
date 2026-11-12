// Purpose: Load the declarative end-to-end expectations and the price rules billing checks need.
// Why: Expectations are reviewed as JSON data under expectations/e2e/; every check must carry a cited source.
// How: Reads expectations/e2e/*.json, validates sources, and indexes entries by case group.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Source } from "../src/expect/types";
import { cataloguePriceCard } from "./context";
import type { CardRule } from "./expected-cost";
import type { CardLookup, CaseDef, CaseGroup, ExpectationEntry, ExpectationFile } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
export const E2E_EXPECTATIONS_DIR = path.resolve(here, "../expectations/e2e");

function validSource(source: Source | undefined): boolean {
	if (!source || typeof source !== "object") return false;
	switch (source.kind) {
		case "spec": return Boolean(source.spec && source.path);
		case "docs": return /^https?:\/\//.test(source.url);
		case "gateway-docs": return Boolean(source.page);
		case "assumed": return typeof source.reason === "string" && source.reason.trim().length >= 20;
		case "ref": return Boolean(source.ref);
		default: return false;
	}
}

export function loadExpectations(dir = E2E_EXPECTATIONS_DIR) {
	const byGroup = new Map<CaseGroup, ExpectationEntry[]>();
	const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
	for (const name of files) {
		const file = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as ExpectationFile;
		for (const entry of file.entries) {
			for (const check of entry.checks) {
				if (!validSource(check.source)) throw new Error(`expectations/e2e/${name}: entry ${entry.id} has a check on ${check.path} without a valid source`);
			}
		}
		byGroup.set(file.group, [...(byGroup.get(file.group) ?? []), ...file.entries]);
	}
	return {
		files,
		entriesFor(group: CaseGroup): ExpectationEntry[] {
			return byGroup.get(group) ?? [];
		},
	};
}

export function cardLookupFor(def: CaseDef): CardLookup {
	return (provider) => {
		if (!provider) return null;
		for (const routes of Object.values(def.routesByModel)) {
			const route = routes.find((entry) => entry.providerId === provider);
			if (!route) continue;
			const card = cataloguePriceCard(route.providerId, route.apiModelId, def.capability);
			if (card) return card.rules as unknown as CardRule[];
		}
		return null;
	};
}
