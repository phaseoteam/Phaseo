import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function extractJob(workflow, name) {
	const marker = `    ${name}:`;
	const start = workflow.indexOf(marker);
	if (start < 0) throw new Error(`Missing CI job: ${name}`);
	const remainder = workflow.slice(start + marker.length);
	const nextJob = remainder.search(/\n    [a-zA-Z0-9_-]+:\r?\n/);
	return nextJob < 0 ? remainder : remainder.slice(0, nextJob);
}

export function validateCiSecretBoundaries(workflow) {
	const previewJob = extractJob(workflow, "deploy-preview-web");
	const previewCondition = previewJob.match(/\n        if: >\r?\n([\s\S]*?)\n        permissions:/)?.[1];

	if (!previewCondition) {
		throw new Error("deploy-preview-web must have an explicit job-level authorization condition");
	}

	if (!workflow.match(/\n    merge_group:\r?\n/)) {
		throw new Error("merge_group validation must remain enabled for merge queue checks");
	}

	if (!previewJob.includes("VERCEL_TOKEN")) {
		throw new Error("Expected deploy-preview-web to remain the Vercel credential boundary");
	}

	if (previewCondition.includes("merge_group")) {
		throw new Error("deploy-preview-web must never run for merge_group events");
	}

	if (!previewCondition.includes("github.event.pull_request.head.repo.full_name == github.repository")) {
		throw new Error("deploy-preview-web must require same-repository pull requests");
	}

	if (!previewCondition.includes('OWNER","MEMBER","COLLABORATOR')) {
		throw new Error("deploy-preview-web must require a trusted pull-request author association");
	}
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
	const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
	validateCiSecretBoundaries(workflow);
	console.log("CI secret-bearing preview deployment boundaries are valid.");
}
