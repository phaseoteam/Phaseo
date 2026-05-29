import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncProviderChangeIssues, testingExports, type ProviderIssueChangeEntry } from "./github-issues";

const baseEntry: ProviderIssueChangeEntry = {
    ts: "2026-05-28T12:00:00.000Z",
    action: "create",
    platformId: "openai",
    platformName: "OpenAI",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-5.4-preview",
};
const siblingEntry: ProviderIssueChangeEntry = {
    ...baseEntry,
    modelId: "gpt-5.4-mini-preview",
};
const deleteEntry: ProviderIssueChangeEntry = {
    ...baseEntry,
    action: "delete",
    modelId: "gpt-5.3-preview",
};

const key = testingExports.issueKeyForGroup(baseEntry);
assert.equal(testingExports.issueKeyForGroup({ providerId: baseEntry.providerId, action: baseEntry.action }), key);
assert.notEqual(testingExports.issueKeyForGroup(deleteEntry), key);
assert.match(testingExports.markerForKey(key), /^ai-stats-model-discovery:/);

const knownModelIdsByProvider = new Map([[baseEntry.providerId, new Set(["gpt-5.4-preview", "gpt-5.4-mini-preview"])]]);
const knownEntries = testingExports.filterEntriesByKnownProviderModels([baseEntry, siblingEntry, deleteEntry], knownModelIdsByProvider);
assert.deepEqual(knownEntries.map((entry) => entry.modelId), ["gpt-5.4-preview", "gpt-5.4-mini-preview"]);

const grouped = testingExports.groupProviderIssueEntries([baseEntry, siblingEntry, deleteEntry]);
assert.equal(grouped.length, 2);
const additionGroup = grouped.find((group) => group.action === "create");
assert.ok(additionGroup);
assert.equal(additionGroup.entries.length, 2);
assert.equal(testingExports.issueTitleForGroup(additionGroup), "[model-discovery] OpenAI: provider model additions");

const body = testingExports.buildIssueBody({
    group: additionGroup,
    recentEvents: [
        { ...baseEntry, runUrl: "https://github.com/AI-Stats/AI-Stats/actions/runs/1" },
        siblingEntry,
    ],
});
assert.match(body, /Tracking key: `ai-stats-model-discovery:/);
assert.match(body, /provider model additions/);
assert.match(body, /Models in this signal: 2/);
assert.match(body, /`gpt-5\.4-preview`/);
assert.match(body, /workflow run/);

const comment = testingExports.buildIssueComment(additionGroup, [baseEntry, siblingEntry]);
assert.match(comment, /another additions signal/);
assert.match(comment, /gpt-5\.4-mini-preview/);

async function main(): Promise<void> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "model-discovery-issues-"));
    const statePath = path.join(tempDir, "state.json");
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    let issueBody = "";
    const requestImpl: typeof fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const bodyText = typeof init?.body === "string" ? init.body : undefined;
        const parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
        requests.push({ url, method, body: parsedBody });

        if (url.includes("/search/issues")) {
            return Response.json({ items: [] });
        }

        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues") && method === "POST") {
            issueBody = parsedBody.body;
            return Response.json({ number: 123, html_url: "https://github.com/AI-Stats/AI-Stats/issues/123", state: "open" });
        }

        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/123") && method === "GET") {
            return Response.json({ number: 123, html_url: "https://github.com/AI-Stats/AI-Stats/issues/123", state: "open" });
        }

        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/123") && method === "PATCH") {
            issueBody = parsedBody.body;
            return Response.json({ number: 123, html_url: "https://github.com/AI-Stats/AI-Stats/issues/123", state: "open" });
        }

        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/123/comments") && method === "POST") {
            return Response.json({ id: 456 });
        }

        return new Response("not found", { status: 404 });
    };

    const additionKnownModelIdsByProvider = new Map([[baseEntry.providerId, new Set(["gpt-5.4-preview", "gpt-5.4-mini-preview"])]]);
    const ghostDeleteSync = await syncProviderChangeIssues([deleteEntry], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath,
        knownModelIdsByProvider: additionKnownModelIdsByProvider,
        requestImpl,
        logger: console,
    });
    assert.deepEqual(ghostDeleteSync, { created: 0, updated: 0, skipped: false });
    assert.equal(requests.length, 0);

    const deleteKnownModelIdsByProvider = new Map([
        [baseEntry.providerId, new Set(["gpt-5.4-preview", "gpt-5.4-mini-preview", "gpt-5.3-preview"])],
    ]);
    const deleteSync = await syncProviderChangeIssues([deleteEntry], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath,
        knownModelIdsByProvider: deleteKnownModelIdsByProvider,
        requestImpl,
        logger: console,
    });
    assert.deepEqual(deleteSync, { created: 1, updated: 0, skipped: false });
    assert.match(issueBody, /provider model deletions/);
    assert.match(issueBody, /Latest action: deletions/);
    assert.ok(requests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));
    requests.length = 0;
    issueBody = "";

    const firstSync = await syncProviderChangeIssues([baseEntry, siblingEntry], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath,
        runUrl: "https://github.com/AI-Stats/AI-Stats/actions/runs/1",
        knownModelIdsByProvider: additionKnownModelIdsByProvider,
        requestImpl,
        logger: console,
    });
    assert.deepEqual(firstSync, { created: 1, updated: 0, skipped: false });
    assert.match(issueBody, /Latest action: additions/);
    assert.match(issueBody, /Models in this signal: 2/);

    const secondSync = await syncProviderChangeIssues([{ ...baseEntry, ts: "2026-05-28T12:15:00.000Z" }], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath,
        knownModelIdsByProvider: additionKnownModelIdsByProvider,
        requestImpl,
        logger: console,
    });
    assert.deepEqual(secondSync, { created: 0, updated: 1, skipped: false });
    assert.match(issueBody, /Latest action: additions/);
    assert.ok(requests.some((request) => request.url.endsWith("/issues/123/comments") && request.method === "POST"));

    console.log("github-issues helper tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
