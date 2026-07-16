import assert from "node:assert/strict";
import test from "node:test";
import { splitPathTemplate } from "../src/pathTemplate.js";

test("splits path parameters and literals", () => {
	assert.deepEqual(splitPathTemplate("/v1/users/{user_id}/jobs/{job_id}"), [
		"/v1/users/",
		"{user_id}",
		"/jobs/",
		"{job_id}"
	]);
});

test("handles adversarial and unmatched braces in linear scans", () => {
	assert.deepEqual(splitPathTemplate("/{{{{{{{{{{{{{{{{{{{{"), ["/", "{{{{{{{{{{{{{{{{{{{{"]);
	assert.deepEqual(splitPathTemplate("/{{}/{{}/{{}"), ["/", "{{}", "/", "{{}", "/", "{{}"]);
	assert.deepEqual(splitPathTemplate("/literal/{unfinished"), ["/literal/", "{unfinished"]);
});
