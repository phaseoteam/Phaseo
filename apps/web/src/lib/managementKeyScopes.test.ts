import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROL_SCOPES } from "./managementKeyScopes";

// The gateway owns the capability list; billing:write is opt-in and never part of a template.
function gatewayTemplateScopes(): string[] {
	const source = readFileSync(
		path.join(import.meta.dirname, "../../../api/src/lib/authz/capabilities.ts"),
		"utf8",
	);
	const start = source.indexOf("export const CAPABILITIES = {");
	const block = source.slice(start, source.indexOf("} as const;", start));
	return [...block.matchAll(/:\s*"([a-z_]+:[a-z_]+)"/g)]
		.map((match) => match[1])
		.filter((scope) => scope !== "billing:write");
}

describe("management key scopes", () => {
	it("match the gateway's management key templates", () => {
		expect([...CONTROL_SCOPES].sort()).toEqual(gatewayTemplateScopes().sort());
	});
});
