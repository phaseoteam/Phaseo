import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledProviderContract } from "./load.js";
import { ProviderContractRegistry } from "./registry.js";

const providers = ["ai21", "aion-labs", "akashml", "alibaba-cloud", "arcee-ai", "atlascloud", "avian", "byteplus", "cerebras", "chutes", "clarifai", "cloudflare", "cohere", "crofai", "crusoe", "darkbloom", "deepseek", "featherless", "gmicloud", "groq", "hyperbolic", "inception", "inference-net", "infermatic", "inflection", "ionrouter", "liquid-ai", "longcat", "mancer", "mara", "meta", "minimax", "moonshot-ai", "morph", "morpheus", "nebius-token-factory", "nvidia", "ovhcloud", "parasail", "perplexity", "phala", "poolside", "reka", "relace", "sakana", "sambanova", "scaleway", "sourceful", "stepfun", "tensorix", "thinking-machines", "upstage", "weights-and-biases", "xiaomi"];

describe("enabled provider reference overlays", () => {
  for (const providerId of providers) {
    it(`${providerId} is provenance-labelled and covers its gateway paths`, async () => {
      const contract = await loadBundledProviderContract(providerId);
      new ProviderContractRegistry().register(contract).assertCoverage(providerId);
      const dir = path.resolve(import.meta.dirname, "..", "contracts", providerId);
      const provenance = JSON.parse(await readFile(path.join(dir, "provenance.json"), "utf8"));
      const bundle = await readFile(path.join(dir, "openapi.json"));
      expect(contract.manifest.source.kind).toBe("official-docs");
      expect(createHash("sha256").update(bundle).digest("hex")).toBe(provenance.bundleSha256);
    });
  }
});
