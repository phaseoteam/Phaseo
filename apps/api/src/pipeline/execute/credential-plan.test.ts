import { describe, expect, it } from "vitest";
import { buildCredentialAttemptPlan } from "./index";

function key(id: string, routingMode: "priority" | "fallback", sortOrder: number) {
	return {
		id,
		providerId: "provider-a",
		fingerprintSha256: id,
		keyVersion: "1",
		alwaysUse: routingMode === "priority",
		routingMode,
		sortOrder,
		key: `secret-${id}`,
	};
}

describe("credential attempt plan", () => {
	it("tries ordered priority keys, ranked managed providers, then ordered fallback keys", () => {
		const providerA = {
			candidate: {
				providerId: "provider-a",
				byokMeta: [key("a-fallback", "fallback", 0), key("a-priority-2", "priority", 2), key("a-priority-1", "priority", 1)],
			},
		};
		const providerB = {
			candidate: {
				providerId: "provider-b",
				byokMeta: [key("b-fallback", "fallback", 0)],
			},
		};

		const plan = buildCredentialAttemptPlan([providerA, providerB]);
		expect(plan.map((attempt) => attempt.phase)).toEqual([
			"priority_byok",
			"priority_byok",
			"gateway",
			"gateway",
			"fallback_byok",
			"fallback_byok",
		]);
		expect(plan.map((attempt) =>
			attempt.credential.kind === "gateway"
				? `${attempt.routed.candidate.providerId}:gateway`
				: `${attempt.routed.candidate.providerId}:${attempt.credential.key.id}`,
		)).toEqual([
			"provider-a:a-priority-1",
			"provider-a:a-priority-2",
			"provider-a:gateway",
			"provider-b:gateway",
			"provider-a:a-fallback",
			"provider-b:b-fallback",
		]);
	});

	it("omits fallback BYOK keys when the workspace setting is disabled", () => {
		const provider = {
			candidate: {
				providerId: "provider-a",
				byokMeta: [key("priority", "priority", 0), key("fallback", "fallback", 0)],
			},
		};

		const plan = buildCredentialAttemptPlan([provider], { includeFallbackByok: false });
		expect(plan.map((attempt) => attempt.phase)).toEqual(["priority_byok", "gateway"]);
	});
});
