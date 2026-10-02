import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const files = {
	index: "apps/web/src/app/[locale]/(dashboard)/trust/page.tsx",
	security: "apps/web/src/app/[locale]/(dashboard)/trust/security/page.tsx",
	subprocessors: "apps/web/src/app/[locale]/(dashboard)/trust/subprocessors/page.tsx",
	dpa: "apps/web/src/app/[locale]/(dashboard)/trust/dpa/page.tsx",
	claims: "apps/web/src/lib/trust-centre.ts",
	privacy: "apps/web/src/app/[locale]/(legal)/privacy/page.tsx",
	terms: "apps/web/src/app/[locale]/(legal)/terms/page.tsx",
};

const content = Object.fromEntries(
	await Promise.all(
		Object.entries(files).map(async ([name, path]) => [
			name,
			await readFile(resolve(root, path), "utf8"),
		]),
	),
);

function requireText(name, pattern, message) {
	if (!pattern.test(content[name])) {
		throw new Error(`${files[name]}: ${message}`);
	}
}

for (const href of ["/trust/security", "/trust/subprocessors", "/trust/dpa"]) {
	requireText("claims", new RegExp(href.replaceAll("/", "\\/")), `missing document link ${href}`);
}

requireText("claims", /Upstash/, "gateway-content claim must disclose the response cache");
requireText("claims", /five minutes/, "gateway-content claim must disclose the default cache period");
requireText("claims", /90, 180, or 365 days/, "gateway-content claim must disclose private I/O-log periods");
requireText("security", /not SOC 2 or ISO 27001 certified/, "security paper must state its independent-assurance limitation");
requireText("security", /30 seconds to 24 hours/, "security paper must state the complete response-cache range");
requireText("subprocessors", /Customer-selected AI providers/, "schedule must separate customer-selected AI providers");
requireText("subprocessors", /factual confirmation/, "schedule must expose unverified processing locations");
requireText("dpa", /It does not bind either party/, "DPA must be presented as a non-binding review draft");
requireText("dpa", /at least 30 days' notice/, "DPA must retain the advance subprocessor-notice commitment");
requireText("dpa", /no later than 30 days/, "DPA must state the active-system deletion deadline");
requireText("dpa", /Completion records retain no user or workspace identifier/, "DPA must describe deletion-job identifier scrubbing");
requireText("dpa", /seven days of daily database restore points/, "DPA must state the verified production backup window");
requireText("dpa", /preliminary classification of the active Phaseo-managed AI Providers/, "DPA must disclose the managed-provider review status");
requireText("subprocessors", /Thirty-eight provider families/, "subprocessor schedule must state the managed-provider review scope");
requireText("subprocessors", /Processor contract pending/, "subprocessor schedule must disclose provisional managed providers");
requireText("subprocessors", /Restricted review/, "subprocessor schedule must disclose restricted managed providers");
requireText("privacy", /Last updated: 30 August 2026/, "privacy review date is stale");
requireText("privacy", /five minutes by/, "privacy policy must disclose the default response cache");
requireText("privacy", /intended to act as our subprocessor for/, "privacy policy must distinguish managed provider processing");
requireText("terms", /Last updated: 30 August 2026/, "terms review date is stale");
requireText("dpa", /legal approval required/, "DPA must retain its legal-review warning");
requireText("subprocessors", /Processor terms located/, "subprocessor schedule must retain the processor-terms category");
requireText("subprocessors", /Processor contract pending/, "subprocessor schedule must retain the contract-review category");
requireText("subprocessors", /Restricted review/, "subprocessor schedule must retain the restricted category");

for (const [name, value] of Object.entries(content)) {
	if (/Phaseo (?:is|is currently) (?:SOC 2|ISO 27001) certified/i.test(value)) {
		throw new Error(`${files[name]}: unsupported independent certification claim`);
	}
}

console.log(`Validated ${Object.keys(files).length} trust-material sources.`);
