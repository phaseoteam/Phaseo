import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayBindings } from "@/runtime/env.types";
import { observabilityIncidentInternals } from "./observability-incidents";
import posthogBodyTemplate from "./observability-incidents.posthog-body.json";

// With `concurrentReaders`, every reader waits until that many have read, so all of them miss
// a mapping that none has written yet: the window concurrent webhook deliveries race through.
function createBindings({ concurrentReaders = 1 } = {}) {
	const values = new Map<string, string>();
	let readers = 0;
	let releaseReaders = () => {};
	const allReaders = new Promise<void>((resolve) => { releaseReaders = resolve; });
	const cache = {
		get: vi.fn(async (key: string) => {
			const value = values.get(key);
			readers += 1;
			if (readers === concurrentReaders) releaseReaders();
			if (readers <= concurrentReaders) await allReaders;
			return value ? JSON.parse(value) : null;
		}),
		put: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
	};
	return {
		bindings: {
			GATEWAY_CACHE: cache as unknown as KVNamespace,
			LINEAR_API_KEY: "lin_api_test",
			LINEAR_TEAM_ID: "team-id",
			LINEAR_PROJECT_ID: "project-id",
			LINEAR_TRIAGE_STATUS_ID: "triage-id",
			LINEAR_ASSIGNEE_ID: "assignee-id",
			LINEAR_OBSERVABILITY_LABEL_ID: "observability-label-id",
		} as GatewayBindings,
		cache,
		values,
	};
}

function graphql(body: unknown) {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

// Linear keeps one entity per id, so a second create with the same client-supplied id fails.
function mockLinear() {
	const issues = new Map<string, { id: string; identifier: string; url: string; description: string }>();
	const comments = new Map<string, { issueId: string; body: string }>();
	const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
		const { query, variables } = JSON.parse(String(init?.body));
		if (query.includes("issueCreate")) {
			const { id = crypto.randomUUID(), description } = variables.input;
			if (issues.has(id)) return graphql({ errors: [{ message: "Entity already exists" }] });
			const identifier = `PHA-${900 + issues.size}`;
			issues.set(id, { id, identifier, url: `https://linear.app/phaseo-ai/issue/${identifier}`, description });
			return graphql({ data: { issueCreate: { success: true, issue: issues.get(id) } } });
		}
		if (query.includes("commentCreate")) {
			const { id = crypto.randomUUID(), issueId, body } = variables.input;
			if (comments.has(id)) return graphql({ errors: [{ message: "Entity already exists" }] });
			comments.set(id, { issueId, body });
			return graphql({ data: { commentCreate: { success: true } } });
		}
		if (query.includes("FindObservabilityIssue")) {
			const issue = issues.get(variables.id);
			return graphql(issue ? { data: { issue } } : { errors: [{ message: "Entity not found" }] });
		}
		if (query.includes("FindObservabilityComment")) {
			return graphql(comments.has(variables.id) ? { data: { comment: { id: variables.id } } } : { errors: [{ message: "Entity not found" }] });
		}
		throw new Error(`unexpected Linear request: ${query}`);
	});
	return { issues, comments, fetchMock };
}

const incident = {
	source: "posthog" as const,
	action: "open" as const,
	fingerprint: "error-group-123",
	title: "Checkout page crashed",
	description: "A production browser exception was grouped by PostHog.",
	severity: "high" as const,
	environment: "production",
	source_url: "https://eu.posthog.com/project/1/error_tracking/1",
	replay_url: "https://eu.posthog.com/project/1/replay/abc",
	release: "release-sha",
	route: "/checkout",
	request_ids: ["request-123"],
	occurrences: 12,
	affected_users: 3,
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("observability incident Linear sync", () => {
	it("requires a long exact bearer token", () => {
		const secret = "a".repeat(32);
		expect(observabilityIncidentInternals.isAuthorized(`Bearer ${secret}`, secret)).toBe(true);
		expect(observabilityIncidentInternals.isAuthorized(`Bearer ${"b".repeat(32)}`, secret)).toBe(false);
		expect(observabilityIncidentInternals.isAuthorized("Bearer short", "short")).toBe(false);
	});

	it("creates one linked issue and deduplicates immediate repeats", async () => {
		const { bindings, cache } = createBindings();
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
			data: { issueCreate: { success: true, issue: { id: "issue-id", identifier: "PHA-42", url: "https://linear.app/phaseo-ai/issue/PHA-42" } } },
		}), { status: 200, headers: { "content-type": "application/json" } }));

		const first = await observabilityIncidentInternals.handleIncident(bindings, incident);
		const second = await observabilityIncidentInternals.handleIncident(bindings, { ...incident, action: "repeated" });

		expect(first).toMatchObject({ created: true, identifier: "PHA-42" });
		expect(second).toMatchObject({ created: false, commented: false, identifier: "PHA-42" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(cache.put).toHaveBeenCalledTimes(1);
		const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(request.variables.input).toMatchObject({
			teamId: "team-id",
			projectId: "project-id",
			stateId: "triage-id",
			assigneeId: "assignee-id",
			priority: 2,
		});
		expect(request.variables.input.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(request.variables.input.description).toContain("request-123");
		expect(request.variables.input.description).toContain("Open session replay");
	});

	it("comments when a mapped signal resolves", async () => {
		const { bindings } = createBindings();
		const { comments } = mockLinear();

		await observabilityIncidentInternals.handleIncident(bindings, incident);
		const result = await observabilityIncidentInternals.handleIncident(bindings, { ...incident, action: "resolved" });

		expect(result).toMatchObject({ created: false, commented: true });
		expect([...comments.values()].map((comment) => comment.body)).toEqual([expect.stringContaining("signal resolved")]);
	});

	it("creates one issue when the first deliveries arrive concurrently", async () => {
		const { bindings } = createBindings({ concurrentReaders: 5 });
		const { issues } = mockLinear();

		const results = await Promise.all(Array.from({ length: 5 }, () => observabilityIncidentInternals.handleIncident(bindings, incident)));

		expect(issues.size).toBe(1);
		expect(new Set(results.map((result) => result.identifier))).toEqual(new Set(["PHA-900"]));
		expect(results.filter((result) => result.created)).toHaveLength(1);
	});

	it("reuses the Linear issue when the KV mapping was lost after creating it", async () => {
		const { bindings, values } = createBindings();
		const { issues } = mockLinear();

		await observabilityIncidentInternals.handleIncident(bindings, incident);
		values.clear();
		const retried = await observabilityIncidentInternals.handleIncident(bindings, { ...incident, action: "repeated" });

		expect(issues.size).toBe(1);
		expect(retried).toMatchObject({ created: false, identifier: "PHA-900" });
		expect(values.size).toBe(1);
	});

	it("throttles sequential repeats to one comment per 15 minutes, with the release and replay", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
		const { bindings } = createBindings();
		const { issues, comments } = mockLinear();
		const repeat = { ...incident, action: "repeated" as const, release: "release-2", replay_url: "https://eu.posthog.com/project/1/replay/def" };

		await observabilityIncidentInternals.handleIncident(bindings, incident);
		vi.setSystemTime(new Date("2026-11-02T10:05:00Z"));
		expect(await observabilityIncidentInternals.handleIncident(bindings, repeat)).toMatchObject({ commented: false });
		expect(comments.size).toBe(0);

		vi.setSystemTime(new Date("2026-11-02T10:20:00Z"));
		expect(await observabilityIncidentInternals.handleIncident(bindings, repeat)).toMatchObject({ commented: true });
		vi.setSystemTime(new Date("2026-11-02T10:30:00Z"));
		expect(await observabilityIncidentInternals.handleIncident(bindings, repeat)).toMatchObject({ commented: false });
		expect(comments.size).toBe(1);
		const [comment] = comments.values();
		expect(comment.body).toContain("signal recurred");
		expect(comment.body).toContain("Release: `release-2`");
		expect(comment.body).toContain("replay/def");

		vi.setSystemTime(new Date(Date.parse("2026-11-02T10:20:00Z") + FIFTEEN_MINUTES));
		await observabilityIncidentInternals.handleIncident(bindings, repeat);
		expect(comments.size).toBe(2);
		expect(issues.size).toBe(1);
	});

	async function seedLegacyMapping(values: Map<string, string>, parsed: ReturnType<typeof observabilityIncidentInternals.IncidentSchema.parse>) {
		values.set(await observabilityIncidentInternals.mappingKey(parsed), JSON.stringify({
			issueId: "legacy-issue-id",
			identifier: "PHA-549",
			url: "https://linear.app/phaseo-ai/issue/PHA-549",
			lastNotifiedAt: "2026-10-22T07:07:02.852Z",
		}));
	}

	it("posts one comment when repeats arrive concurrently", async () => {
		const { bindings, values } = createBindings({ concurrentReaders: 4 });
		const { comments } = mockLinear();
		const parsed = observabilityIncidentInternals.IncidentSchema.parse({ ...incident, action: "repeated" });
		await seedLegacyMapping(values, parsed);

		const results = await Promise.all(Array.from({ length: 4 }, () => observabilityIncidentInternals.handleIncident(bindings, parsed)));

		expect(comments.size).toBe(1);
		expect(results.filter((result) => result.commented)).toHaveLength(1);
	});

	it("keeps comments on an issue mapped before deterministic ids", async () => {
		const { bindings, values } = createBindings();
		const { issues, comments } = mockLinear();
		const parsed = observabilityIncidentInternals.IncidentSchema.parse({ ...incident, action: "repeated" });
		await seedLegacyMapping(values, parsed);

		const result = await observabilityIncidentInternals.handleIncident(bindings, parsed);

		expect(result).toMatchObject({ created: false, commented: true, identifier: "PHA-549" });
		expect(issues.size).toBe(0);
		expect([...comments.values()][0]?.issueId).toBe("legacy-issue-id");
	});
});

describe("PostHog producer contract", () => {
	it("only sends fields the bridge reads", () => {
		const accepted = Object.keys(observabilityIncidentInternals.IncidentSchema.shape);
		expect(Object.keys(posthogBodyTemplate).filter((key) => !accepted.includes(key))).toEqual([]);
		expect(posthogBodyTemplate).toMatchObject({
			source: "posthog",
			fingerprint: "{event.properties.$exception_fingerprint}",
			source_url: expect.stringContaining("/error_tracking/{event.properties.$exception_issue_id}"),
			replay_url: expect.stringContaining("/replay/{event.properties.$session_id}"),
			release: "{event.properties.release}",
		});
	});

	it("accepts missing template values and keeps sensitive values out of the issue", () => {
		const parsed = observabilityIncidentInternals.IncidentSchema.parse({
			source: "posthog",
			fingerprint: "a".repeat(128),
			title: "TypeError on /settings/keys?token=abc: Failed for jane@example.com at https://api.phaseo.app/v1/keys?key=sk-live-1234567890abcdefghijklmnop",
			severity: "medium",
			environment: null,
			source_url: "https://eu.posthog.com/project/81404/error_tracking/01a1581e-53d3-7ce2-98ce-aa0b0a096f8f",
			replay_url: null,
			release: "debbbf851bb068da14027e9b5f1dc9f28908bf22",
			route: "/settings/keys?token=abc#secret",
			exception_type: "TypeError",
			exception_message: "Failed for jane@example.com at https://api.phaseo.app/v1/keys?key=sk-live-1234567890abcdefghijklmnop with `sk-live-1234567890abcdefghijklmnop`",
		});

		expect(parsed.route).toBe("/settings/keys");
		expect(parsed.replay_url).toBeUndefined();
		expect(parsed.title).toBe("TypeError on /settings/keys: Failed for [email] at https://api.phaseo.app/v1/keys");
		const description = observabilityIncidentInternals.incidentDescription(parsed);
		expect(description).toContain("- Exception: `TypeError`: Failed for [email] at https://api.phaseo.app/v1/keys with '[redacted]'");
		expect(description).toContain("- Release: `debbbf851bb068da14027e9b5f1dc9f28908bf22`");
		expect(description).toContain("[Open in PostHog](https://eu.posthog.com/project/81404/error_tracking/01a1581e-53d3-7ce2-98ce-aa0b0a096f8f)");
		expect(description).not.toMatch(/jane@|sk-live|token=|Open session replay/);
	});

	it("keeps short identifiers and long names readable", () => {
		expect(observabilityIncidentInternals.redact("Minified React error #467; visit https://react.dev/errors/467 for useSyncExternalStoreWithSelector"))
			.toBe("Minified React error #467; visit https://react.dev/errors/467 for useSyncExternalStoreWithSelector");
	});
});
