import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    syncProviderChangeIssues,
    syncUpstreamDiscoveryIssues,
    testingExports,
    type UpstreamDiscoveryIssueEntry,
} from "./github-issues";
import { syncHfIssues } from "./run-hf-private";

const providerEntry: UpstreamDiscoveryIssueEntry = {
    source: "provider-api",
    ts: "2026-05-28T12:00:00.000Z",
    action: "create",
    platformId: "openai",
    platformName: "OpenAI",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-5.4-preview",
    reason: "Detected from upstream provider /models API",
};
const providerSiblingEntry: UpstreamDiscoveryIssueEntry = {
    ...providerEntry,
    modelId: "gpt-5.4-mini-preview",
};
const providerDeleteEntry: UpstreamDiscoveryIssueEntry = {
    ...providerEntry,
    action: "delete",
    modelId: "gpt-5.3-preview",
};
const hfEntry: UpstreamDiscoveryIssueEntry = {
    source: "huggingface",
    ts: "2026-05-28T12:00:00.000Z",
    action: "create",
    platformId: "huggingface",
    platformName: "Hugging Face",
    providerId: "openai",
    providerName: "openai",
    modelId: "openai/example-hf-model",
    modelUrl: "https://huggingface.co/openai/example-hf-model",
};

const providerKey = testingExports.issueKeyForGroup(providerEntry);
const hfKey = testingExports.issueKeyForGroup(hfEntry);
assert.equal(testingExports.issueKeyForGroup({ source: "provider-api", providerId: providerEntry.providerId, action: providerEntry.action }), providerKey);
assert.notEqual(testingExports.issueKeyForGroup(providerDeleteEntry), providerKey);
assert.notEqual(hfKey, providerKey);
assert.match(testingExports.markerForKey(providerKey), /^ai-stats-upstream-discovery:/);

const grouped = testingExports.groupUpstreamIssueEntries([providerEntry, providerSiblingEntry, providerDeleteEntry, hfEntry]);
assert.equal(grouped.length, 3);
const providerAdditionGroup = grouped.find((group) => group.source === "provider-api" && group.action === "create");
const hfAdditionGroup = grouped.find((group) => group.source === "huggingface" && group.action === "create");
assert.ok(providerAdditionGroup);
assert.ok(hfAdditionGroup);
assert.equal(providerAdditionGroup.entries.length, 2);
assert.equal(testingExports.issueTitleForGroup(providerAdditionGroup), "[upstream-discovery] OpenAI: provider model additions");
assert.equal(testingExports.issueTitleForGroup(hfAdditionGroup), "[upstream-discovery] Hugging Face: model additions for openai");

const body = testingExports.buildIssueBody({
    group: providerAdditionGroup,
    recentEvents: [
        { ...providerEntry, runUrl: "https://github.com/AI-Stats/AI-Stats/actions/runs/1" },
        providerSiblingEntry,
    ],
});
assert.match(body, /Tracking key: `ai-stats-upstream-discovery:/);
assert.match(body, /Source: provider API/);
assert.match(body, /provider API model additions/);
assert.match(body, /Models in this signal: 2/);
assert.match(body, /`gpt-5\.4-preview`/);
assert.match(body, /workflow run/);
assert.doesNotMatch(body, /Unknown upstream models are intentionally included/);

const hfBody = testingExports.buildIssueBody({
    group: hfAdditionGroup,
    recentEvents: [hfEntry],
});
assert.match(hfBody, /Source: Hugging Face/);
assert.match(hfBody, /Provider\/org: openai/);
assert.match(hfBody, /https:\/\/huggingface\.co\/openai\/example-hf-model/);

const comment = testingExports.buildIssueComment(providerAdditionGroup, [providerEntry, providerSiblingEntry]);
assert.match(comment, /another provider API additions signal/);
assert.match(comment, /gpt-5\.4-mini-preview/);

async function withEnv<T>(updates: Record<string, string | undefined>, callback: () => Promise<T>): Promise<T> {
    const previous = new Map<string, string | undefined>();
    for (const key of Object.keys(updates)) {
        previous.set(key, process.env[key]);
        const value = updates[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        return await callback();
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

async function main(): Promise<void> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "model-discovery-issues-"));
    const statePath = path.join(tempDir, "state.json");
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    let issueBody = "";
    let issueTitle = "";
    let nextIssueNumber = 123;
    const issueStore = new Map<number, { title: string; body: string; labels: string[] }>();
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
            issueTitle = parsedBody.title;
            const issueNumber = nextIssueNumber;
            nextIssueNumber += 1;
            issueStore.set(issueNumber, {
                title: parsedBody.title,
                body: parsedBody.body,
                labels: Array.isArray(parsedBody.labels) ? parsedBody.labels : [],
            });
            return Response.json({
                number: issueNumber,
                html_url: `https://github.com/AI-Stats/AI-Stats/issues/${issueNumber}`,
                state: "open",
                title: parsedBody.title,
                body: parsedBody.body,
                labels: parsedBody.labels,
            });
        }

        const issueMatch = url.match(/\/repos\/AI-Stats\/AI-Stats\/issues\/(\d+)$/);
        if (issueMatch && method === "GET") {
            const issueNumber = Number(issueMatch[1]);
            const existing = issueStore.get(issueNumber);
            return Response.json({
                number: issueNumber,
                html_url: `https://github.com/AI-Stats/AI-Stats/issues/${issueNumber}`,
                state: "open",
                title: existing?.title,
                body: existing?.body,
                labels: existing?.labels ?? [],
            });
        }

        if (issueMatch && method === "PATCH") {
            const issueNumber = Number(issueMatch[1]);
            issueBody = parsedBody.body;
            issueTitle = parsedBody.title;
            issueStore.set(issueNumber, {
                title: parsedBody.title,
                body: parsedBody.body,
                labels: Array.isArray(parsedBody.labels) ? parsedBody.labels : [],
            });
            return Response.json({
                number: issueNumber,
                html_url: `https://github.com/AI-Stats/AI-Stats/issues/${issueNumber}`,
                state: "open",
                title: parsedBody.title,
                body: parsedBody.body,
                labels: parsedBody.labels,
            });
        }

        if (/\/repos\/AI-Stats\/AI-Stats\/issues\/\d+\/comments$/.test(url) && method === "POST") {
            return Response.json({ id: 456 });
        }

        return new Response("not found", { status: 404 });
    };
    const logger = { log() {}, warn() {} };

    const firstProviderSync = await syncUpstreamDiscoveryIssues([providerEntry, providerSiblingEntry], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath,
        runUrl: "https://github.com/AI-Stats/AI-Stats/actions/runs/1",
        requestImpl,
        logger,
    });
    assert.deepEqual(firstProviderSync, { created: 1, updated: 0, skipped: false });
    assert.equal(issueTitle, "[upstream-discovery] OpenAI: provider model additions");
    assert.match(issueBody, /Latest action: additions/);
    assert.match(issueBody, /Models in this signal: 2/);
    assert.deepEqual((requests.find((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST")?.body as { labels?: string[] })?.labels, ["ai-stats-upstream-discovery"]);

    const secondProviderSync = await syncUpstreamDiscoveryIssues([{ ...providerEntry, ts: "2026-05-28T12:15:00.000Z" }], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath,
        requestImpl,
        logger,
    });
    assert.deepEqual(secondProviderSync, { created: 0, updated: 1, skipped: false });
    assert.ok(requests.some((request) => /\/issues\/123\/comments$/.test(request.url) && request.method === "POST"));
    assert.ok(
        requests.some(
            (request) =>
                request.url.endsWith("/repos/AI-Stats/AI-Stats/issues/123") &&
                request.method === "PATCH" &&
                (request.body as { labels?: string[] })?.labels?.includes("ai-stats-upstream-discovery")
        )
    );

    requests.length = 0;
    await withEnv({ MODEL_DISCOVERY_HF_GITHUB_ISSUES: "true" }, async () => {
        const hfSync = await syncUpstreamDiscoveryIssues([hfEntry], {
            token: "test-token",
            repository: "AI-Stats/AI-Stats",
            statePath,
            requestImpl,
            logger,
        });
        assert.deepEqual(hfSync, { created: 1, updated: 0, skipped: false });
        assert.equal(issueTitle, "[upstream-discovery] Hugging Face: model additions for openai");
        assert.match(issueBody, /Source: Hugging Face/);
        assert.ok(requests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));
    });

    requests.length = 0;
    const unknownProviderSync = await syncProviderChangeIssues([{ ...providerEntry, modelId: "brand-new-unknown-upstream-model" }], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath: path.join(tempDir, "unknown-state.json"),
        requestImpl,
        logger,
        knownModelIdsByProvider: new Map([[providerEntry.providerId, new Set([providerEntry.modelId])]]),
    });
    assert.deepEqual(unknownProviderSync, { created: 0, updated: 0, skipped: false });
    assert.ok(!requests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));


    const legacyRequests: Array<{ url: string; method: string; body?: unknown }> = [];
    const legacyKey = testingExports.legacyProviderIssueKeyForGroup(providerEntry);
    const legacyRequestImpl: typeof fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const bodyText = typeof init?.body === "string" ? init.body : undefined;
        const parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
        legacyRequests.push({ url, method, body: parsedBody });

        if (url.includes("/search/issues") && url.includes(encodeURIComponent(testingExports.legacyMarkerForKey(legacyKey)))) {
            return Response.json({
                items: [
                    {
                        number: 777,
                        html_url: "https://github.com/AI-Stats/AI-Stats/issues/777",
                        state: "open",
                        body: `<!-- ${testingExports.legacyMarkerForKey(legacyKey)} -->`,
                        labels: ["ai-stats-upstream-discovery"],
                    },
                ],
            });
        }
        if (url.includes("/search/issues")) {
            return Response.json({ items: [] });
        }
        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/777") && method === "GET") {
            return Response.json({
                number: 777,
                html_url: "https://github.com/AI-Stats/AI-Stats/issues/777",
                state: "open",
                body: `<!-- ${testingExports.legacyMarkerForKey(legacyKey)} -->`,
                labels: ["ai-stats-upstream-discovery"],
            });
        }
        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/777") && method === "PATCH") {
            return Response.json({
                number: 777,
                html_url: "https://github.com/AI-Stats/AI-Stats/issues/777",
                state: "open",
                title: parsedBody.title,
                body: parsedBody.body,
                labels: parsedBody.labels,
            });
        }
        if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/777/comments") && method === "POST") {
            return Response.json({ id: 778 });
        }
        return new Response("not found", { status: 404 });
    };
    const legacySync = await syncUpstreamDiscoveryIssues([providerEntry], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath: path.join(tempDir, "legacy-state.json"),
        requestImpl: legacyRequestImpl,
        logger,
    });
    assert.deepEqual(legacySync, { created: 0, updated: 1, skipped: false });
    assert.ok(legacyRequests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues/777") && request.method === "PATCH"));
    assert.ok(!legacyRequests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));

    const commentInjectionRequests: Array<{ url: string; method: string; body?: unknown }> = [];
    const commentInjectionMarker = testingExports.markerForKey(providerKey);
    const commentInjectionSync = await syncUpstreamDiscoveryIssues([providerEntry], {
        token: "test-token",
        repository: "AI-Stats/AI-Stats",
        statePath: path.join(tempDir, "comment-injection.json"),
        requestImpl: async (input, init) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            const bodyText = typeof init?.body === "string" ? init.body : undefined;
            const parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
            commentInjectionRequests.push({ url, method, body: parsedBody });

            if (url.includes("/search/issues")) {
                return Response.json({
                    items: [{ number: 900, html_url: "https://github.com/AI-Stats/AI-Stats/issues/900", state: "open" }],
                });
            }
            if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/900") && method === "GET") {
                return Response.json({
                    number: 900,
                    html_url: "https://github.com/AI-Stats/AI-Stats/issues/900",
                    state: "open",
                    body: "attacker comment matched search, but issue body is unrelated",
                    labels: [],
                });
            }
            if (url.endsWith("/repos/AI-Stats/AI-Stats/issues") && method === "POST") {
                return Response.json({
                    number: 901,
                    html_url: "https://github.com/AI-Stats/AI-Stats/issues/901",
                    state: "open",
                    title: parsedBody.title,
                    body: parsedBody.body,
                    labels: parsedBody.labels,
                });
            }
            if (url.endsWith("/repos/AI-Stats/AI-Stats/issues/900") && method === "PATCH") {
                return new Response("unexpected overwrite", { status: 500 });
            }
            return new Response("not found", { status: 404 });
        },
        logger,
    });
    assert.deepEqual(commentInjectionSync, { created: 1, updated: 0, skipped: false });
    assert.ok(
        commentInjectionRequests.some(
            (request) =>
                request.url.includes("/search/issues") &&
                request.url.includes(encodeURIComponent(`in:body label:ai-stats-upstream-discovery "${commentInjectionMarker}"`))
        )
    );
    assert.ok(commentInjectionRequests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues/900") && request.method === "GET"));
    assert.ok(!commentInjectionRequests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues/900") && request.method === "PATCH"));
    assert.ok(commentInjectionRequests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));

    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;
    const capturedErrors: string[] = [];
    console.error = (...args: unknown[]) => {
        capturedErrors.push(args.map(String).join(" "));
    };
    console.log = () => {};
    try {
        await assert.rejects(
            syncHfIssues(
                [
                    {
                        org: "openai",
                        addedModelIds: ["openai/example-hf-model"],
                    },
                ],
                async () => {
                    throw new Error("simulated GitHub outage");
                }
            ),
            /simulated GitHub outage/
        );
    } finally {
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
    }
    assert.ok(
        capturedErrors.some((line) => line.includes("Hugging Face GitHub issue sync failed: simulated GitHub outage"))
    );

    await withEnv({ MODEL_DISCOVERY_GITHUB_ISSUES: "false" }, async () => {
        const sync = await syncUpstreamDiscoveryIssues([providerEntry], {
            token: "test-token",
            repository: "AI-Stats/AI-Stats",
            statePath: path.join(tempDir, "global-disabled.json"),
            requestImpl,
            logger,
        });
        assert.deepEqual(sync, { created: 0, updated: 0, skipped: true });
    });

    await withEnv({ MODEL_DISCOVERY_PROVIDER_GITHUB_ISSUES: "false" }, async () => {
        const providerSync = await syncUpstreamDiscoveryIssues([providerEntry], {
            token: "test-token",
            repository: "AI-Stats/AI-Stats",
            statePath: path.join(tempDir, "provider-disabled.json"),
            requestImpl,
            logger,
        });
        assert.deepEqual(providerSync, { created: 0, updated: 0, skipped: true });

        await withEnv({ MODEL_DISCOVERY_HF_GITHUB_ISSUES: "true" }, async () => {
            const allowedHfSync = await syncUpstreamDiscoveryIssues([hfEntry], {
                token: "test-token",
                repository: "AI-Stats/AI-Stats",
                statePath: path.join(tempDir, "provider-disabled-hf-allowed.json"),
                requestImpl,
                logger,
            });
            assert.deepEqual(allowedHfSync, { created: 1, updated: 0, skipped: false });

            requests.length = 0;
            const mixedSourceSync = await syncUpstreamDiscoveryIssues([providerEntry, hfEntry], {
                token: "test-token",
                repository: "AI-Stats/AI-Stats",
                statePath: path.join(tempDir, "provider-disabled-mixed.json"),
                requestImpl,
                logger,
            });
            assert.deepEqual(mixedSourceSync, { created: 1, updated: 0, skipped: false });
            assert.equal(issueTitle, "[upstream-discovery] Hugging Face: model additions for openai");
            assert.ok(requests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));
        });
    });

    await withEnv({ MODEL_DISCOVERY_HF_GITHUB_ISSUES: "false" }, async () => {
        const hfDisabledSync = await syncUpstreamDiscoveryIssues([hfEntry], {
            token: "test-token",
            repository: "AI-Stats/AI-Stats",
            statePath: path.join(tempDir, "hf-disabled.json"),
            requestImpl,
            logger,
        });
        assert.deepEqual(hfDisabledSync, { created: 0, updated: 0, skipped: true });

        const providerAllowedSync = await syncUpstreamDiscoveryIssues([providerDeleteEntry], {
            token: "test-token",
            repository: "AI-Stats/AI-Stats",
            statePath: path.join(tempDir, "hf-disabled-provider-allowed.json"),
            requestImpl,
            logger,
        });
        assert.deepEqual(providerAllowedSync, { created: 1, updated: 0, skipped: false });

        requests.length = 0;
        const mixedSourceSync = await syncUpstreamDiscoveryIssues([providerDeleteEntry, hfEntry], {
            token: "test-token",
            repository: "AI-Stats/AI-Stats",
            statePath: path.join(tempDir, "hf-disabled-mixed.json"),
            requestImpl,
            logger,
        });
        assert.deepEqual(mixedSourceSync, { created: 1, updated: 0, skipped: false });
        assert.equal(issueTitle, "[upstream-discovery] OpenAI: provider model deletions");
        assert.ok(requests.some((request) => request.url.endsWith("/repos/AI-Stats/AI-Stats/issues") && request.method === "POST"));
    });

    const publicRunnerSource = fs.readFileSync(path.join(process.cwd(), "scripts", "model-discovery", "run-internal-public.ts"), "utf-8");
    assert.doesNotMatch(publicRunnerSource, /github-issues|syncUpstreamDiscoveryIssues|syncProviderChangeIssues/);

    console.log("github-issues helper tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
