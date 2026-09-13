import { describe, expect, it } from "vitest";
import { getProviderProfile } from "../providerProfiles";

describe("providerProfiles", () => {
	it("resolves alias entries to the canonical profile", () => {
		const openai = getProviderProfile("openai");
		const azure = getProviderProfile("azure");
		expect(openai?.id).toBe("openai");
		expect(azure?.id).toBe("openai");
		expect(getProviderProfile("wafer-zdr")?.id).toBe("wafer");
	});

	it("contains text-only policy for known providers", () => {
		expect(getProviderProfile("ai21")?.textOnly).toBe(true);
		expect(getProviderProfile("arcee-ai")?.textOnly).toBe(true);
		expect(getProviderProfile("arcee")?.textOnly).toBe(true);
		expect(getProviderProfile("friendli")?.textOnly).not.toBe(true);
		expect(getProviderProfile("deepseek")?.textOnly).toBe(true);
		expect(getProviderProfile("io-net")?.textOnly).not.toBe(true);
		expect(getProviderProfile("poolside")?.text?.paramPolicy?.supportedParams).toEqual(
			expect.arrayContaining(["top_k", "min_p", "parallel_tool_calls", "reasoning.enabled"]),
		);
		expect(getProviderProfile("ambient")?.textOnly).not.toBe(true);
		expect(getProviderProfile("baidu")?.textOnly).not.toBe(true);
		expect(getProviderProfile("xiaomi")?.textOnly).not.toBe(true);
		expect(getProviderProfile("google-vertex")?.textOnly).not.toBe(true);
	});

	it("stores text normalize hints in one place", () => {
		const anthropic = getProviderProfile("anthropic");
		expect(anthropic?.text?.normalize?.maxTemperature).toBe(1);
		expect(anthropic?.text?.normalize?.defaultMaxTokensWhenMissing).toBe(4096);
		const cohere = getProviderProfile("cohere");
		expect(cohere?.text?.normalize?.maxTemperature).toBe(1);
		expect(cohere?.text?.normalize?.reasoningEffortFallback).toEqual(["high"]);
		const deepseek = getProviderProfile("deepseek");
		expect(deepseek?.text?.normalize?.maxTemperature).toBe(2);
		expect(deepseek?.text?.normalize?.reasoningEffortFallback).toEqual(["high", "max"]);
		const friendli = getProviderProfile("friendli");
		expect(friendli?.text?.normalize?.maxTemperature).toBe(2);
		expect(friendli?.adapterBackedOverrides?.["image.generate"]).toBe(true);
		expect(friendli?.adapterBackedOverrides?.["audio.transcription"]).toBe(true);
		const gmicloud = getProviderProfile("gmicloud");
		expect(gmicloud?.text?.normalize?.maxTemperature).toBe(2);
		expect(gmicloud?.adapterBackedOverrides?.["video.generate"]).toBe(false);
		const ioNet = getProviderProfile("io-net");
		expect(ioNet?.text?.normalize?.maxTemperature).toBe(2);
		expect(ioNet?.adapterBackedOverrides?.["image.generate"]).toBe(false);
		expect(ioNet?.adapterBackedOverrides?.["audio.speech"]).toBe(false);
		const inception = getProviderProfile("inception");
		expect(inception?.textOnly).toBe(true);
		expect(inception?.text?.normalize?.maxTemperature).toBe(1);
		expect(inception?.text?.normalize?.reasoningEffortFallback).toEqual(["instant", "low", "medium", "high"]);
		const ionrouter = getProviderProfile("ionrouter");
		expect(ionrouter?.text?.normalize?.maxTemperature).toBe(2);
		expect(ionrouter?.adapterBackedOverrides?.["image.generate"]).toBe(true);
		expect(ionrouter?.adapterBackedOverrides?.["video.generate"]).toBe(false);
		expect(getProviderProfile("minimax")?.adapterBackedOverrides?.["image.edit"]).toBe(true);
		expect(getProviderProfile("minimax-lightning")?.adapterBackedOverrides?.["image.generate"]).toBe(false);
		expect(getProviderProfile("minimax")?.adapterBackedOverrides?.["audio.speech"]).toBe(true);
		expect(getProviderProfile("minimax-lightning")?.adapterBackedOverrides?.["audio.speech"]).toBe(false);
		expect(getProviderProfile("minimax")?.adapterBackedOverrides?.["audio.transcription"]).toBe(false);
		expect(getProviderProfile("minimax")?.adapterBackedOverrides?.["audio.translations"]).toBe(false);
		expect(getProviderProfile("minimax-lightning")?.adapterBackedOverrides?.["audio.transcription"]).toBe(false);
		expect(getProviderProfile("minimax-lightning")?.adapterBackedOverrides?.["audio.translations"]).toBe(false);
		const siliconflow = getProviderProfile("siliconflow");
		expect(siliconflow?.adapterBackedOverrides).toEqual(expect.objectContaining({
			"image.generate": true,
			"image.edit": false,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		}));
		expect(siliconflow?.text?.paramPolicy?.supportedParams).toEqual(expect.arrayContaining([
			"min_p", "n", "reasoning.enabled", "reasoning.max_tokens",
		]));
		const stepfun = getProviderProfile("stepfun");
		expect(stepfun?.adapterBackedOverrides).toEqual(expect.objectContaining({
			"image.generate": true,
			"image.edit": true,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		}));
		expect(stepfun?.text?.paramPolicy?.supportedParams).toEqual(expect.arrayContaining([
			"n", "modalities", "audio", "reasoning_format", "reasoning.effort",
		]));
		const venice = getProviderProfile("venice");
		expect(venice?.adapterBackedOverrides).toEqual(expect.objectContaining({
			"image.generate": true,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		}));
		expect(getProviderProfile("venice-e2ee")?.textOnly).toBe(true);
		const wandb = getProviderProfile("weights-and-biases");
		expect(wandb?.textOnly).toBe(true);
		expect(wandb?.text?.paramPolicy?.supportedParams).toEqual(expect.arrayContaining([
			"tools", "response_format", "reasoning.enabled",
		]));
	});
});
