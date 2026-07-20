import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderContract, ProviderContractManifest } from "./registry.js";
import type { OpenApiDocument } from "./types.js";

export async function loadBundledProviderContract(providerId: string): Promise<ProviderContract> {
  if (!/^[a-z0-9-]+$/.test(providerId)) throw new Error(`invalid provider contract id: ${providerId}`);
  const contractDir = path.resolve(import.meta.dirname, "..", "contracts", providerId);
  const [manifest, document] = await Promise.all([
    readFile(path.join(contractDir, "manifest.json"), "utf8").then((value) => JSON.parse(value) as ProviderContractManifest),
    readFile(path.join(contractDir, "openapi.json"), "utf8").then((value) => JSON.parse(value) as OpenApiDocument),
  ]);
  if (manifest.providerId !== providerId) throw new Error(`provider contract id mismatch: expected ${providerId}, got ${manifest.providerId}`);
  return { manifest, document };
}
