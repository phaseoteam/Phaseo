import assert from "node:assert/strict";
import test from "node:test";
import { validateCiSecretBoundaries } from "./validate-ci-secret-boundaries.mjs";

const trustedPullRequestCondition = `
                github.event_name == 'pull_request' &&
                github.event.pull_request.head.repo.full_name == github.repository &&
                contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)
`;

function workflowWithPreviewCondition(condition) {
	return `
on:
    merge_group:
        types: [checks_requested]

jobs:
    deploy-preview-web:
        if: >
${condition}
        permissions:
            contents: read
        steps:
            - name: Deploy
              env:
                  VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
    next-job:
        runs-on: ubuntu-latest
`;
}

test("accepts trusted pull requests without merge-group secret access", () => {
	assert.doesNotThrow(() => validateCiSecretBoundaries(
		workflowWithPreviewCondition(trustedPullRequestCondition),
	));
});

test("rejects merge-group access to the Vercel credential boundary", () => {
	const vulnerableCondition = `            github.event_name == 'merge_group' ||${trustedPullRequestCondition}`;
	assert.throws(
		() => validateCiSecretBoundaries(workflowWithPreviewCondition(vulnerableCondition)),
		/never run for merge_group events/,
	);
});
