import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledProviderContract } from "./load.js";
import { ProviderContractRegistry } from "./registry.js";

const providers = ["amazon-bedrock", "amazon-bedrock-mantle", "anthropic-aws", "anthropic-aws-us", "azure", "baidu", "black-forest-labs", "canopy-wave", "digitalocean", "google-vertex", "google-vertex-eu", "runway", "suno", "voyage"];

describe("native and specialized provider contracts", () => {
  for (const providerId of providers) it(`${providerId} has honest provenance and covered operations`, async () => {
    const contract = await loadBundledProviderContract(providerId);
    new ProviderContractRegistry().register(contract).assertCoverage(providerId);
    const dir = path.resolve(import.meta.dirname, "..", "contracts", providerId);
    const provenance = JSON.parse(await readFile(path.join(dir, "provenance.json"), "utf8"));
    const bundle = await readFile(path.join(dir, "openapi.json"));
    expect(createHash("sha256").update(bundle).digest("hex")).toBe(provenance.bundleSha256);
    if (contract.manifest.operations.length === 0) expect(provenance.unsupportedReason).toBeTruthy();
  });
});
