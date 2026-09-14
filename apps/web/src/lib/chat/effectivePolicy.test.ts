import { applyChatEffectivePolicy, type ChatEffectivePolicy } from "./effectivePolicy";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

const route = (providerId: string): GatewaySupportedModel => ({
	modelId: "qwen/qwen3.8-max", internalModelId: "qwen/qwen3.8-max", selectorModelId: "qwen/qwen3.8-max", providerId,
	capabilities: ["text.generate"], effectiveFrom: null, effectiveTo: null, providerName: providerId,
	providerFamilyId: null, providerOfferLabel: null, providerOfferScope: null, providerPromptTrainingPolicy: null,
	modelName: "Qwen 3.8 Max", modelStatus: "active", organisationId: "qwen", organisationName: "Qwen",
	previousModelId: null, releaseDate: null, announcementDate: null, isAvailable: true,
});
const none = { provider: { mode: "none" as const, ids: [] }, model: { mode: "none" as const, ids: [] } };

describe("applyChatEffectivePolicy", () => {
	it("keeps public catalogue availability separate while annotating workspace and guardrail blocks", () => {
		const policy: ChatEffectivePolicy = {
			workspaceId: "workspace-1",
			workspace: { ...none, provider: { mode: "blocklist", ids: ["novita"] } },
			account: { ...none, model: { mode: "blocklist", ids: ["qwen/qwen3.8-max"] } },
			guardrails: [{ id: "g-1", name: "Team Safety", ...none, provider: { mode: "blocklist", ids: ["novita"] } }],
		};
		const [annotated] = applyChatEffectivePolicy([route("novita")], policy);
		expect(annotated.isAvailable).toBe(true);
		expect(annotated.chatBlockedReasons?.map((reason) => reason.source)).toEqual(["workspace", "account", "guardrail"]);
	});

	it("does not annotate an allowed route", () => {
		const policy: ChatEffectivePolicy = { workspaceId: "workspace-1", workspace: none, account: none, guardrails: [] };
		expect(applyChatEffectivePolicy([route("novita")], policy)[0].chatBlockedReasons).toEqual([]);
	});
});
