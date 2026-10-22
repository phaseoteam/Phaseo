import { draftFromPolicy, draftToPayload, emptyPolicyDraft, targetName, targetOptions } from "./rateLimitForm";

const policy = {
	id: "p1", name: "Standard", description: null, requestsPerMinute: 60, tokensPerMinute: null,
	concurrentRequests: null, failClosed: false, updatedAt: "2026-10-22T09:00:00Z",
};
const targets = {
	keys: [{ id: "k1", name: "Production", prefix: "abc123", status: "active" }, { id: "k2", name: "", prefix: "def456", status: "active" }],
	members: [{ id: "u1", name: "Ada", role: "admin" }, { id: "u2", name: null, role: "member" }],
	departments: [{ id: "d1", name: "Engineering" }],
	guardrails: [{ id: "g1", name: "Contractors" }],
};

describe("rate limit policy form", () => {
	it("round-trips a policy and trims the name and description", () => {
		const draft = { ...draftFromPolicy(policy), name: "  Standard  ", description: "  For most keys " };
		expect(draftToPayload(draft)).toEqual({
			ok: true,
			payload: { name: "Standard", description: "For most keys", requests_per_minute: 60, tokens_per_minute: null },
		});
	});

	it("accepts thousands separators and treats blanks as no limit", () => {
		expect(draftToPayload({ ...emptyPolicyDraft(), name: "Batch", tokensPerMinute: "200,000" })).toEqual({
			ok: true,
			payload: { name: "Batch", description: null, requests_per_minute: null, tokens_per_minute: 200_000 },
		});
	});

	it("points at the field the gateway would reject", () => {
		const base = { ...emptyPolicyDraft(), name: "Batch", requestsPerMinute: "10" };
		expect(draftToPayload({ ...base, name: " " })).toEqual({ ok: false, problem: "name" });
		expect(draftToPayload({ ...base, name: "x".repeat(101) })).toEqual({ ok: false, problem: "name" });
		expect(draftToPayload({ ...base, description: "x".repeat(501) })).toEqual({ ok: false, problem: "description" });
		expect(draftToPayload({ ...base, requestsPerMinute: "0" })).toEqual({ ok: false, problem: "requestsPerMinute" });
		expect(draftToPayload({ ...base, requestsPerMinute: "1.5" })).toEqual({ ok: false, problem: "requestsPerMinute" });
		expect(draftToPayload({ ...base, requestsPerMinute: "2147483648" })).toEqual({ ok: false, problem: "requestsPerMinute" });
		expect(draftToPayload({ ...base, tokensPerMinute: "-5" })).toEqual({ ok: false, problem: "tokensPerMinute" });
		expect(draftToPayload({ ...base, requestsPerMinute: "" })).toEqual({ ok: false, problem: "limits" });
	});

	it("lets a policy keep only an API-set concurrency limit", () => {
		const draft = { ...emptyPolicyDraft(), name: "Concurrency only" };
		expect(draftToPayload(draft, { concurrentRequests: 4 })).toMatchObject({ ok: true });
	});

	it("offers only targets without a policy, labelling unnamed keys and members", () => {
		const data = { targets, assignments: [{ id: "a1", policyId: "p1", targetType: "key" as const, targetId: "k1" }] };
		expect(targetOptions("key", data, "Member")).toEqual([{ value: "k2", label: "def456", description: "def456" }]);
		expect(targetOptions("member", data, "Member").map((option) => option.label)).toEqual(["Ada", "Member"]);
		expect(targetOptions("department", data, "Member")).toEqual([{ value: "d1", label: "Engineering" }]);
	});

	it("names targets and reports ones that no longer exist", () => {
		expect(targetName("guardrail", "g1", targets, "Member")).toBe("Contractors");
		expect(targetName("member", "u2", targets, "Member")).toBe("Member");
		expect(targetName("key", "gone", targets, "Member")).toBeNull();
		expect(targetName("end_user_default", null, targets, "Member")).toBeNull();
	});
});
