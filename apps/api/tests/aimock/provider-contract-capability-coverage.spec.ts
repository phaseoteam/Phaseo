import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXECUTORS_BY_PROVIDER } from "@executors/index";

const contractsRoot = path.resolve(import.meta.dirname, "../../../../packages/testing/provider-mock/contracts");

const inheritedContractByProvider: Record<string, string> = {
    // Runtime offers use the same Anthropic wire contract; the regional executor
    // tests also assert each exact Runtime endpoint and inference profile ID.
    "amazon-bedrock-global": "anthropic",
    "amazon-bedrock-us": "anthropic",
    "amazon-bedrock-eu": "anthropic",
    "amazon-bedrock-jp": "anthropic",
    "amazon-bedrock-au": "anthropic",
    ambient: "openai",
    baidu: "openai",
    doubleword: "openai",
    modelscope: "openai",
    "mistral-eu": "mistral",
    "io-net": "openai",
    streamlake: "openai",
    switchpoint: "openai",
	"tencent-cloud": "openai",
	"ionrouter-kimi": "ionrouter",
	"ionrouter-minimax": "ionrouter",
	openrouter: "openai",
	tensorx: "tensorix",
    wafer: "openai",
    "wafer-zdr": "openai",
};

const providersWithDedicatedNativeContractTests = new Set([
    "elevenlabs",
    "fal",
    "private-model",
    "typesafe",
]);

function operationCoversCapability(capability: string, serializedOperations: string): boolean {
    if (capability === "text.generate") return /(chat|response|message|text|gemini|anthropic)/i.test(serializedOperations);
    if (capability === "video.generate") return /video/i.test(serializedOperations);
    if (capability === "image.generate" || capability === "image.edit") return /image/i.test(serializedOperations);
    if (capability === "music.generate") return /music/i.test(serializedOperations);
    if (capability === "audio.speech") return /(audio|speech)/i.test(serializedOperations);
    if (capability === "embeddings") return /embed/i.test(serializedOperations);
    if (capability === "rerank") return /rerank/i.test(serializedOperations);
    if (capability === "moderations") return /moderat/i.test(serializedOperations);
    return false;
}

describe("provider contract capability coverage", () => {
    it("covers every explicitly registered provider and text executor", async () => {
        const contractIds = new Set(await readdir(contractsRoot));
        const missingProviders: string[] = [];
        const missingCapabilities: string[] = [];

        for (const [providerId, capabilities] of Object.entries(EXECUTORS_BY_PROVIDER)) {
            if (providersWithDedicatedNativeContractTests.has(providerId)) continue;
            const contractId = inheritedContractByProvider[providerId] ?? providerId;
            if (!contractIds.has(contractId)) {
                missingProviders.push(providerId);
                continue;
            }
            const manifest = JSON.parse(await readFile(path.join(contractsRoot, contractId, "manifest.json"), "utf8"));
            const serializedOperations = JSON.stringify(manifest.operations ?? []);
            if (
                Object.hasOwn(capabilities, "text.generate") &&
                !operationCoversCapability("text.generate", serializedOperations)
            ) {
                missingCapabilities.push(`${providerId}:text.generate`);
            }
        }

        expect(missingProviders).toEqual([]);
        expect(missingCapabilities).toEqual([]);
    });
});
