import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledProviderContract } from "./load.js";
import { ProviderContractRegistry } from "./registry.js";

const providerIds = ["baseten", "deepinfra", "fireworks", "friendli", "mistral", "siliconflow", "together", "venice", "z-ai"];

describe("Mintlify-published official OpenAPI contracts", () => {
  for (const providerId of providerIds) {
    it(`${providerId} has a reproducible, gateway-path-aware contract`, async () => {
      const contract = await loadBundledProviderContract(providerId);
      new ProviderContractRegistry().register(contract).assertCoverage(providerId);
      const dir = path.resolve(import.meta.dirname, "..", "contracts", providerId);
      const provenance = JSON.parse(await readFile(path.join(dir, "provenance.json"), "utf8"));
      const bundle = await readFile(path.join(dir, "openapi.json"));
      expect(contract.manifest.source.kind).toBe("official-openapi");
      expect(createHash("sha256").update(bundle).digest("hex")).toBe(provenance.bundleSha256);
    });
  }
});
