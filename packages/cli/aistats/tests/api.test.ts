import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApiRoot, oauthUrl, v1Url } from "../src/api.ts";

test("normalizes API roots for oauth and v1 endpoints", () => {
	assert.equal(normalizeApiRoot("https://api.example.com/v1/"), "https://api.example.com");
	assert.equal(oauthUrl("https://api.example.com", "/token"), "https://api.example.com/oauth/token");
	assert.equal(v1Url("https://api.example.com", "/me"), "https://api.example.com/v1/me");
});
