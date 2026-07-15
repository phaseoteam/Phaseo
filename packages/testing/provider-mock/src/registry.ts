import type { OpenApiDocument } from "./types.js";

export type ProviderContractOperation = {
  capability: string;
  method: string;
  path: string;
  operationId?: string;
  notes?: string;
};

export type ProviderContractManifest = {
  providerId: string;
  displayName: string;
  source: {
    kind: "official-openapi" | "official-docs" | "official-mintlify" | "community-openapi" | "phaseo-overlay";
    url: string;
    repository?: string;
    license?: string;
  };
  operations: ProviderContractOperation[];
  overlays?: string[];
};

export type ProviderContract = {
  manifest: ProviderContractManifest;
  document: OpenApiDocument;
};

export type ContractCoverageIssue = {
  providerId: string;
  capability: string;
  method: string;
  path: string;
  reason: "missing_path" | "missing_method" | "operation_id_mismatch";
};

export class ProviderContractRegistry {
  private contracts = new Map<string, ProviderContract>();

  register(contract: ProviderContract): this {
    if (this.contracts.has(contract.manifest.providerId)) {
      throw new Error(`provider contract already registered: ${contract.manifest.providerId}`);
    }
    this.contracts.set(contract.manifest.providerId, contract);
    return this;
  }

  get(providerId: string): ProviderContract | undefined {
    return this.contracts.get(providerId);
  }

  providers(): string[] {
    return [...this.contracts.keys()].sort();
  }

  coverage(providerId?: string): ContractCoverageIssue[] {
    const contracts = providerId
      ? [this.contracts.get(providerId)].filter(Boolean) as ProviderContract[]
      : [...this.contracts.values()];
    const issues: ContractCoverageIssue[] = [];
    for (const { manifest, document } of contracts) {
      for (const expected of manifest.operations) {
        const pathItem = document.paths?.[expected.path];
        if (!pathItem) {
          issues.push({ ...expected, providerId: manifest.providerId, reason: "missing_path" });
          continue;
        }
        const operation = pathItem[expected.method.toLowerCase()] as { operationId?: string } | undefined;
        if (!operation) {
          issues.push({ ...expected, providerId: manifest.providerId, reason: "missing_method" });
          continue;
        }
        if (expected.operationId && operation.operationId !== expected.operationId) {
          issues.push({ ...expected, providerId: manifest.providerId, reason: "operation_id_mismatch" });
        }
      }
    }
    return issues;
  }

  assertCoverage(providerId?: string): void {
    const issues = this.coverage(providerId);
    if (issues.length) {
      throw new Error(`provider contract coverage failed:\n${issues.map((issue) =>
        `${issue.providerId} ${issue.method.toUpperCase()} ${issue.path}: ${issue.reason}`).join("\n")}`);
    }
  }
}
