import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { testingExports } from "./hf-discovery";

function main(): void {
    checkParseNextLink();
    checkReadState();
}

function checkParseNextLink(): void {
    const baseUrl = "https://huggingface.co/api/models?author=openai&limit=100";

    assert.equal(
        testingExports.parseNextLink(
            '</api/models?author=openai&limit=100&cursor=abc>; rel="next"',
            baseUrl
        ),
        "https://huggingface.co/api/models?author=openai&limit=100&cursor=abc"
    );

    assert.equal(
        testingExports.parseNextLink(
            '<https://huggingface.co/api/models?author=openai&limit=100&cursor=def>; rel="next"',
            baseUrl
        ),
        "https://huggingface.co/api/models?author=openai&limit=100&cursor=def"
    );

    assert.equal(
        testingExports.parseNextLink(
            '<https://attacker.example/collect>; rel="next"',
            baseUrl
        ),
        null
    );

    assert.equal(
        testingExports.parseNextLink(
            '<https://huggingface.co/api/spaces?author=openai>; rel="next"',
            baseUrl
        ),
        null
    );
}

function checkReadState(): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-discovery-"));
    try {
        const missing = testingExports.readState(path.join(dir, "missing.json"));
        assert.equal(missing.hasHfState, false);
        assert.deepEqual(missing.state.hfOrgs, {});

        // State written by the old combined runner still carries a files map.
        const legacyPath = path.join(dir, "legacy.json");
        const hfOrgs = { openai: { fetchedAt: "2026-10-01T00:00:00.000Z", modelIds: ["openai/gpt-oss-20b"] } };
        fs.writeFileSync(legacyPath, JSON.stringify({ version: 3, generatedAt: "2026-10-01T00:00:00.000Z", files: { "a/model.json": {} }, hfOrgs }));
        const legacy = testingExports.readState(legacyPath);
        assert.equal(legacy.hasHfState, true);
        assert.deepEqual(legacy.state.hfOrgs, hfOrgs);
        assert.equal("files" in legacy.state, false);

        const noHfPath = path.join(dir, "no-hf.json");
        fs.writeFileSync(noHfPath, JSON.stringify({ version: 1, files: {} }));
        assert.equal(testingExports.readState(noHfPath).hasHfState, false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

main();
