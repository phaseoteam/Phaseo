import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledProviderContract } from "./load.js";
import { getCanonicalBundleHash } from "./contract-hash.js";
import { ProviderContractRegistry } from "./registry.js";

const aliases = ["aionlabs", "alibaba", "anthropic-us", "arcee", "atlas-cloud", "bytedance-seed", "liquid", "minimax-lightning", "moonshotai", "moonshot-ai-turbo", "moonshotai-turbo", "nebius-token-factory-fast", "nebius-token-factory-eu-north-1", "nebius-token-factory-us-central-1", "novitaai", "openai-eu", "qwen", "runwayml", "spacex-ai", "venice-e2ee", "voyageai", "xai", "zai"];

describe("enabled provider aliases", () => {
  for (const providerId of aliases) {
    it(`${providerId} inherits a covered contract with explicit provenance`, async () => {
      const contract = await loadBundledProviderContract(providerId);
      new ProviderContractRegistry().register(contract).assertCoverage(providerId);
      const dir = path.resolve(import.meta.dirname, "..", "contracts", providerId);
      const provenance = JSON.parse(await readFile(path.join(dir, "provenance.json"), "utf8"));
      const bundle = await readFile(path.join(dir, "openapi.json"));
      expect(contract.manifest.source.kind).toBe("phaseo-overlay");
      expect(getCanonicalBundleHash(bundle)).toBe(provenance.bundleSha256);
    });
  }
});
