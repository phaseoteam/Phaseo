import { describe, expect, it } from "vitest";
import { modelReleasePushMessage } from "./model-release-push";

describe("model release push content", () => {
	it("targets the exact encoded model page", () => {
		const message = modelReleasePushMessage({ model_slug: "openai/gpt-5.4", model_name: "GPT-5.4", lab_name: "OpenAI" });
		expect(message.data).toEqual({ type: "model_release", modelId: "openai/gpt-5.4", href: "/model/openai%2Fgpt-5.4" });
		expect(message.title).toBe("OpenAI released GPT-5.4");
	});
});
