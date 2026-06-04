import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(scriptDir, "../../.github/workflows/issue-triage.yml");
const workflow = fs.readFileSync(workflowPath, "utf-8");

assert.doesNotMatch(
    workflow,
    /We're super sorry about this issue you're facing!/i,
    "workflow should not hardcode a generic apology opening"
);
assert.doesNotMatch(
    workflow,
    /\*This is an automated response - a team member will follow up shortly\.\*/i,
    "workflow should not hardcode a human handoff sign-off"
);

assert.match(workflow, /Never start by default with an apology\./);
assert.match(workflow, /Never say "we'll have someone look at this", "a team member will follow up shortly"/);
assert.match(workflow, /\[Bug\], \[Chore\], \[Data Request\],\s+\[Docs\], \[Feature\], and \[Incorrect Info\]/);
assert.match(workflow, /For internal engineering tasks, chores, tests, data updates, model-discovery items/);
assert.match(workflow, /For PR review or implementation follow-up prompts, open with what needs doing\./);
assert.match(workflow, /For feature requests, open with a concise request summary/);
assert.match(workflow, /For docs changes, open with direct docs framing/);
assert.match(workflow, /For user-facing bugs or incidents with clear end-user impact, a brief acknowledgement is fine/);
assert.match(workflow, /For issues about OpenCode or the triage workflow itself, use a factual self-referential tone\./);
