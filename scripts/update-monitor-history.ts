import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = "packages/data/catalog/src/data";
const HISTORY_FILE = path.join(REPO_ROOT, DATA_ROOT, "monitor-history.json");

export type ChangeAction = "added" | "changed" | "removed";

type DiffItem = {
  field: string;
  before: any;
  after: any;
  kind?: "provider-model-listing" | "provider-model-status";
  modelId?: string;
};

type ChangeFile = {
  status: string;
  path: string;
  oldPath?: string;
};

type Meta = {
  provider: string;
  model: string;
  endpoint: string | null;
  entityType: string;
  entityId: string;
  orgId: string | null;
};

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).toString();
}

export function assertSafeGitRef(ref: string, label = "git ref"): string {
  const trimmed = String(ref ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!/^[A-Za-z0-9._/@-]+$/.test(trimmed)) {
    throw new Error(`${label} contains invalid characters`);
  }
  if (
    trimmed.startsWith("-") ||
    trimmed.includes("..") ||
    trimmed.includes("@{") ||
    /[\\^:~?\[*\s]/.test(trimmed)
  ) {
    throw new Error(`${label} contains an unsafe git revision pattern`);
  }
  return trimmed;
}

const DATA_DIRS = new Set([
  "aliases",
  "api_providers",
  "benchmarks",
  "families",
  "models",
  "organisations",
  "pricing",
  "subscription_plans",
]);

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function getDataPathParts(filePath: string): string[] | null {
  const normalizedPath = normalizeRepoPath(filePath);
  if (!normalizedPath.startsWith(`${DATA_ROOT}/`)) return null;

  const relativePath = normalizedPath.slice(DATA_ROOT.length + 1);
  if (!relativePath) return [];

  return relativePath.split("/");
}

function isDataFile(filePath: string): boolean {
  const parts = getDataPathParts(filePath);
  if (!parts) return false;
  if (!filePath.endsWith(".json")) return false;

  const dir = parts[0] ?? null;

  return dir ? DATA_DIRS.has(dir) : false;
}

function getChangedFiles(commit: string): ChangeFile[] {
  const safeCommit = assertSafeGitRef(commit, "commit");
  const output = git(["show", "--name-status", "--pretty=", safeCommit, "--", DATA_ROOT]).trim();
  if (!output) return [];

  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const files: ChangeFile[] = [];

  for (const line of lines) {
    const parts = line.split("\t").map((part) => part.trim());
    const status = parts[0];

    if (!status) continue;

    if (status.startsWith("R")) {
      const oldPath = parts[1];
      const newPath = parts[2];
      if (!newPath) continue;
      if (!isDataFile(newPath) && !isDataFile(oldPath ?? "")) continue;
      files.push({ status: "R", path: newPath, oldPath });
      continue;
    }

    const filePath = parts[1];
    if (!filePath || !isDataFile(filePath)) continue;

    files.push({ status, path: filePath });
  }

  return files;
}

function getBlobContents(refs: string[]): Map<string, string | null> {
  const uniqueRefs = Array.from(new Set(refs));
  const result = new Map<string, string | null>();

  if (uniqueRefs.length === 0) return result;

  const output = execSync("git cat-file --batch", {
    cwd: REPO_ROOT,
    input: uniqueRefs.join("\n") + "\n",
    maxBuffer: 64 * 1024 * 1024,
  });

  let offset = 0;

  for (const ref of uniqueRefs) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) {
      result.set(ref, null);
      break;
    }

    const header = output.slice(offset, headerEnd).toString("utf8");
    offset = headerEnd + 1;

    if (header.endsWith(" missing")) {
      result.set(ref, null);
      continue;
    }

    const sizeMatch = header.match(/^[0-9a-f]+ \w+ (\d+)$/);
    if (!sizeMatch) {
      result.set(ref, null);
      continue;
    }

    const size = Number(sizeMatch[1]);
    const content = output.slice(offset, offset + size).toString("utf8");
    result.set(ref, content);

    offset += size;
    if (output[offset] === 0x0a) offset += 1;
  }

  return result;
}

function getCommitDate(commit: string): string {
  try {
    return git(["log", "-1", "--format=%ci", assertSafeGitRef(commit, "commit")]).trim();
  } catch {
    return new Date().toISOString();
  }
}

function getParentCommit(commit: string): string | null {
  try {
    const out = git(["log", "-1", "--format=%P", assertSafeGitRef(commit, "commit")]).trim();
    if (!out) return null;
    return out.split(" ")[0] ?? null;
  } catch {
    return null;
  }
}

function parseJson(content: string | null): any {
  if (content == null) return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffBenchmarks(
  before: any[],
  after: any[],
  field: string
): DiffItem[] {
  const buildVariantKey = (item: any) => {
    const benchmarkId = item?.benchmark_id ?? "unknown";
    const otherInfo = String(item?.other_info ?? "").trim();
    return `${benchmarkId}::${otherInfo}`;
  };

  const groupScores = (items: any[]) => {
    const map = new Map<string, number[]>();

    for (const item of items) {
      const variantKey = buildVariantKey(item);
      const score = item?.score;
      const existing = map.get(variantKey) ?? [];

      if (typeof score === "number" && Number.isFinite(score)) {
        existing.push(score);
      }

      map.set(variantKey, existing);
    }

    for (const [variantKey, scores] of map.entries()) {
      map.set(
        variantKey,
        [...scores].sort((a, b) => a - b)
      );
    }

    return map;
  };

  const beforeMap = groupScores(before);
  const afterMap = groupScores(after);
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const diffs: DiffItem[] = [];

  for (const key of keys) {
    const prevScores = beforeMap.get(key) ?? [];
    const nextScores = afterMap.get(key) ?? [];

    if (JSON.stringify(prevScores) === JSON.stringify(nextScores)) {
      continue;
    }

    const beforeValue =
      prevScores.length === 0
        ? null
        : prevScores.length === 1
        ? prevScores[0]
        : prevScores;
    const afterValue =
      nextScores.length === 0
        ? null
        : nextScores.length === 1
        ? nextScores[0]
        : nextScores;

    diffs.push({
      field: (() => {
        const [benchmarkId, otherInfo = ""] = key.split("::");
        const label = otherInfo ? `${benchmarkId}[${otherInfo}]` : benchmarkId;
        return `${field}.${label}.score`;
      })(),
      before: beforeValue,
      after: afterValue,
    });
  }

  return diffs;
}

function diffPricingRules(before: any[], after: any[]): DiffItem[] {
  const normalizeRuleMatch = (ruleMatch: any) => {
    const path = String(ruleMatch?.path ?? "condition").trim() || "condition";
    const op = String(ruleMatch?.op ?? "eq").trim() || "eq";
    const value = String(ruleMatch?.value ?? "null").trim() || "null";
    const orGroup =
      ruleMatch?.or_group == null ? "g0" : `g${String(ruleMatch.or_group).trim()}`;
    const andIndex =
      ruleMatch?.and_index == null ? "a0" : `a${String(ruleMatch.and_index).trim()}`;

    return `${path}~${op}~${value}~${orGroup}~${andIndex}`;
  };

  const normalizeTimestamp = (value: any): string | null => {
    const text = String(value ?? "").trim();
    return text || null;
  };

  type PricingRuleVersion = {
    effectiveFrom: string | null;
    effectiveTo: string | null;
    logicalKey: string;
    matches: string[];
    meter: string;
    plan: string;
    price: number | null;
    priority: number;
  };

  const toPricingRuleVersion = (rule: any): PricingRuleVersion => {
    const meter = String(rule?.meter ?? "unknown").trim() || "unknown";
    const plan =
      String(rule?.pricing_plan ?? "default").trim() || "default";
    const priority =
      typeof rule?.priority === "number" && Number.isFinite(rule.priority)
        ? rule.priority
        : 100;
    const matches = Array.isArray(rule?.match)
      ? rule.match.map(normalizeRuleMatch).filter(Boolean).sort()
      : [];
    const logicalKey = JSON.stringify({ meter, plan, priority, matches });

    return {
      logicalKey,
      meter,
      plan,
      priority,
      matches,
      price:
        typeof rule?.price_per_unit === "number" && Number.isFinite(rule.price_per_unit)
          ? rule.price_per_unit
          : null,
      effectiveFrom: normalizeTimestamp(rule?.effective_from),
      effectiveTo: normalizeTimestamp(rule?.effective_to),
    };
  };

  const buildField = (
    version: Pick<PricingRuleVersion, "meter" | "plan" | "priority" | "matches">,
    extraQualifiers: string[] = []
  ) => {
    const qualifiers = [
      version.plan,
      ...(version.priority !== 100 ? [`priority~eq~${version.priority}`] : []),
      ...version.matches,
      ...extraQualifiers,
    ];

    return `pricing.${[version.meter, ...qualifiers].join("::")}`;
  };

  const getScheduleQualifiers = (
    version: Pick<PricingRuleVersion, "effectiveFrom" | "effectiveTo">
  ) => [
    ...(version.effectiveFrom ? [`effective_from~eq~${version.effectiveFrom}`] : []),
    ...(version.effectiveTo ? [`effective_to~eq~${version.effectiveTo}`] : []),
  ];

  const getScheduleKey = (version: Pick<PricingRuleVersion, "effectiveFrom" | "effectiveTo">) =>
    JSON.stringify({
      effectiveFrom: version.effectiveFrom ?? null,
      effectiveTo: version.effectiveTo ?? null,
    });

  const compareVersions = (a: PricingRuleVersion, b: PricingRuleVersion) => {
    const fromA = a.effectiveFrom ?? "";
    const fromB = b.effectiveFrom ?? "";
    if (fromA !== fromB) return fromA.localeCompare(fromB);

    const toA = a.effectiveTo ?? "";
    const toB = b.effectiveTo ?? "";
    if (toA !== toB) return toA.localeCompare(toB);

    return (a.price ?? 0) - (b.price ?? 0);
  };

  const groupVersions = (items: any[]) => {
    const map = new Map<string, PricingRuleVersion[]>();

    for (const item of items) {
      const version = toPricingRuleVersion(item);
      const existing = map.get(version.logicalKey) ?? [];
      existing.push(version);
      map.set(version.logicalKey, existing);
    }

    return map;
  };

  const beforeMap = groupVersions(before);
  const afterMap = groupVersions(after);
  const logicalKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const diffs: DiffItem[] = [];

  for (const logicalKey of logicalKeys) {
    const prevVersions = [...(beforeMap.get(logicalKey) ?? [])].sort(compareVersions);
    const nextVersions = [...(afterMap.get(logicalKey) ?? [])].sort(compareVersions);
    if (prevVersions.length === 0 && nextVersions.length === 0) continue;

    const prevBySchedule = new Map<string, PricingRuleVersion>();
    const nextBySchedule = new Map<string, PricingRuleVersion>();

    for (const version of prevVersions) {
      prevBySchedule.set(getScheduleKey(version), version);
    }

    for (const version of nextVersions) {
      nextBySchedule.set(getScheduleKey(version), version);
    }

    const consumedPrev = new Set<string>();
    const consumedNext = new Set<string>();

    for (const [scheduleKey, previous] of prevBySchedule.entries()) {
      const next = nextBySchedule.get(scheduleKey);
      if (!next) continue;

      consumedPrev.add(scheduleKey);
      consumedNext.add(scheduleKey);

      if (previous.price === next.price) continue;

      diffs.push({
        field: buildField(next, getScheduleQualifiers(next)),
        before: previous.price,
        after: next.price,
      });
    }

    const remainingPrev = [...prevBySchedule.entries()]
      .filter(([scheduleKey]) => !consumedPrev.has(scheduleKey))
      .map(([scheduleKey, version]) => ({ scheduleKey, version }));
    const remainingNext = [...nextBySchedule.entries()]
      .filter(([scheduleKey]) => !consumedNext.has(scheduleKey))
      .map(([scheduleKey, version]) => ({ scheduleKey, version }));

    for (let nextIndex = remainingNext.length - 1; nextIndex >= 0; nextIndex -= 1) {
      const nextEntry = remainingNext[nextIndex];
      const previousIndex = remainingPrev.findIndex(
        (previousEntry) =>
          previousEntry.version.price === nextEntry.version.price &&
          (
            previousEntry.version.effectiveFrom === nextEntry.version.effectiveFrom ||
            previousEntry.version.effectiveTo === nextEntry.version.effectiveTo
          )
      );

      if (previousIndex === -1) continue;

      remainingPrev.splice(previousIndex, 1);
      remainingNext.splice(nextIndex, 1);
    }

    for (const nextEntry of remainingNext) {
      if (!nextEntry.version.effectiveFrom) continue;

      const previousIndex = remainingPrev.findIndex(
        (previousEntry) =>
          previousEntry.version.effectiveTo === nextEntry.version.effectiveFrom
      );

      if (previousIndex === -1) continue;

      const previousEntry = remainingPrev[previousIndex];
      remainingPrev.splice(previousIndex, 1);

      if (previousEntry.version.price === nextEntry.version.price) {
        continue;
      }

      diffs.push({
        field: buildField(nextEntry.version, getScheduleQualifiers(nextEntry.version)),
        before: previousEntry.version.price,
        after: nextEntry.version.price,
      });
    }

    for (const previousEntry of remainingPrev) {
      diffs.push({
        field: buildField(previousEntry.version, getScheduleQualifiers(previousEntry.version)),
        before: previousEntry.version.price,
        after: null,
      });
    }

    for (const nextEntry of remainingNext) {
      diffs.push({
        field: buildField(nextEntry.version, getScheduleQualifiers(nextEntry.version)),
        before: null,
        after: nextEntry.version.price,
      });
    }
  }

  return diffs;
}

function diffModelList(before: any[], after: any[], field: string): DiffItem[] {
  const toId = (item: any) => {
    const candidates = [item?.model_id, item?.internal_model_id, item?.api_model_id];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return null;
  };
  const toStatus = (item: any): string | null => {
    if (!item) return null;

    const directStatus =
      typeof item?.status === "string" && item.status.trim().length > 0
        ? item.status.trim()
        : null;
    if (directStatus) return directStatus;

    const capabilityStatuses: string[] = Array.isArray(item?.capabilities)
      ? Array.from<string>(
          new Set(
            item.capabilities
              .map((capability: any) =>
                typeof capability?.status === "string" && capability.status.trim().length > 0
                  ? capability.status.trim()
                  : null
              )
              .filter((status: string | null): status is string => status != null)
          )
        )
      : [];

    if (capabilityStatuses.length === 1) return capabilityStatuses[0] ?? null;

    if (typeof item?.is_active_gateway === "boolean") {
      return item.is_active_gateway ? "active" : "inactive";
    }

    return null;
  };

  const beforeMap = new Map<string, any>();
  const afterMap = new Map<string, any>();
  for (const item of before) {
    const id = toId(item);
    if (id) beforeMap.set(id, item);
  }
  for (const item of after) {
    const id = toId(item);
    if (id) afterMap.set(id, item);
  }

  const diffs: DiffItem[] = [];
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const id of allIds) {
    const previousItem = beforeMap.get(id);
    const nextItem = afterMap.get(id);
    const previousStatus = toStatus(previousItem);
    const nextStatus = toStatus(nextItem);

    if (previousItem && !nextItem) {
      diffs.push({
        field: `${field}.${id}`,
        before: id,
        after: null,
        kind: "provider-model-listing",
        modelId: id,
      });
      if (previousStatus != null) {
        diffs.push({
          field: `${field}.${id}[status]`,
          before: previousStatus,
          after: null,
          kind: "provider-model-status",
          modelId: id,
        });
      }
      continue;
    }

    if (!previousItem && nextItem) {
      diffs.push({
        field: `${field}.${id}`,
        before: null,
        after: id,
        kind: "provider-model-listing",
        modelId: id,
      });
      if (nextStatus != null) {
        diffs.push({
          field: `${field}.${id}[status]`,
          before: null,
          after: nextStatus,
          kind: "provider-model-status",
          modelId: id,
        });
      }
      continue;
    }

    if (previousItem && nextItem && previousStatus !== nextStatus) {
      diffs.push({
        field: `${field}.${id}[status]`,
        before: previousStatus,
        after: nextStatus,
        kind: "provider-model-status",
        modelId: id,
      });
    }
  }

  return diffs;
}

function diffLinks(before: any[], after: any[], field: string): DiffItem[] {
  const byPlatform = (items: any[]) => {
    const map = new Map<string, any[]>();
    for (const item of items) {
      const platform = item?.platform ?? "unknown";
      const list = map.get(platform) ?? [];
      list.push(item);
      map.set(platform, list);
    }
    return map;
  };

  const beforeGroups = byPlatform(before);
  const afterGroups = byPlatform(after);
  const platforms = new Set([
    ...Array.from(beforeGroups.keys()),
    ...Array.from(afterGroups.keys()),
  ]);

  const diffs: DiffItem[] = [];

  for (const platform of platforms) {
    const beforeItems = beforeGroups.get(platform) ?? [];
    const afterItems = afterGroups.get(platform) ?? [];

    if (beforeItems.length <= 1 && afterItems.length <= 1) {
      const prev = beforeItems[0];
      const next = afterItems[0];
      const diffField = `${field}.${platform}.url`;

      if (prev && !next) {
        diffs.push({
          field: diffField,
          before: prev?.url ?? null,
          after: null,
        });
        continue;
      }

      if (!prev && next) {
        diffs.push({
          field: diffField,
          before: null,
          after: next?.url ?? null,
        });
        continue;
      }

      const prevUrl = prev?.url ?? null;
      const nextUrl = next?.url ?? null;
      if (prevUrl !== nextUrl) {
        diffs.push({ field: diffField, before: prevUrl, after: nextUrl });
      }
      continue;
    }

    const toKey = (item: any) =>
      `${item?.platform ?? "unknown"}::${item?.url ?? ""}`;
    const beforeMap = new Map<string, any>();
    const afterMap = new Map<string, any>();

    for (const item of beforeItems) beforeMap.set(toKey(item), item);
    for (const item of afterItems) afterMap.set(toKey(item), item);

    const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    for (const key of keys) {
      const prev = beforeMap.get(key);
      const next = afterMap.get(key);
      const label = key.replace(/::/g, "[") + "]";
      const diffField = `${field}.${label}.url`;

      if (prev && !next) {
        diffs.push({
          field: diffField,
          before: prev?.url ?? null,
          after: null,
        });
        continue;
      }

      if (!prev && next) {
        diffs.push({
          field: diffField,
          before: null,
          after: next?.url ?? null,
        });
      }
    }
  }

  return diffs;
}

function diffValues(before: any, after: any, field = ""): DiffItem[] {
  if (before === after) return [];

  if (Array.isArray(before) && Array.isArray(after)) {
    if (field === "benchmarks" && before.every(isPlainObject) && after.every(isPlainObject)) {
      const diffs = diffBenchmarks(before, after, field);
      return diffs.length ? diffs : [];
    }
    if (field === "rules" && before.every(isPlainObject) && after.every(isPlainObject)) {
      const diffs = diffPricingRules(before, after);
      return diffs.length ? diffs : [];
    }
    if (
      (field === "models" || field === "") &&
      before.every(isPlainObject) &&
      after.every(isPlainObject) &&
      [...before, ...after].some(
        (item) =>
          item?.model_id != null ||
          item?.api_model_id != null ||
          item?.internal_model_id != null
      )
    ) {
      const diffs = diffModelList(before, after, field || "models");
      return diffs.length ? diffs : [];
    }
    if (field === "links" && before.every(isPlainObject) && after.every(isPlainObject)) {
      const diffs = diffLinks(before, after, field);
      return diffs.length ? diffs : [];
    }
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ field: field || "value", before, after }];
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffs: DiffItem[] = [];

    for (const key of keys) {
      const nextField = field ? `${field}.${key}` : key;
      diffs.push(...diffValues(before[key], after[key], nextField));
    }

    return diffs;
  }

  return [{ field: field || "value", before, after }];
}

function resolveEntityType(filePath: string): string {
  const parts = getDataPathParts(filePath) ?? [];
  const rawType = parts[0] ?? "unknown";

  switch (rawType) {
    case "models":
      return "model";
    case "benchmarks":
      return "benchmark";
    case "organisations":
      return "organisation";
    case "api_providers":
      return "api-provider";
    case "subscription_plans":
      return "subscription-plan";
    case "aliases":
      return "alias";
    case "families":
      return "family";
    default:
      return rawType ?? "unknown";
  }
}

function fallbackMetaFromPath(filePath: string) {
  const parts = getDataPathParts(filePath) ?? [];
  const rawType = parts[0] ?? "unknown";

  let model: string | null = null;
  let entityId: string | null = null;
  let orgId: string | null = null;
  let endpoint: string | null = null;

  if (rawType === "models") {
    const org = parts[1];
    const slug = parts[2];
    if (org && slug) {
      model = `${org}/${slug}`;
      entityId = model;
      orgId = org;
    }
  } else if (rawType === "benchmarks") {
    entityId = parts[1] ?? null;
    model = entityId;
  } else if (rawType === "organisations") {
    entityId = parts[1] ?? null;
    model = entityId;
    orgId = entityId;
  } else if (rawType === "api_providers") {
    entityId = parts[1] ?? null;
    model = entityId;
    orgId = entityId;
  } else if (rawType === "families") {
    entityId = parts[1] ?? null;
    model = entityId;
    orgId = entityId?.split("/")[0] ?? null;
  } else if (rawType === "aliases") {
    entityId = parts[1] ?? null;
    model = entityId;
  } else if (rawType === "subscription_plans") {
    entityId = parts[1] ?? null;
    model = entityId;
  } else if (rawType === "pricing") {
    const apiProviderId = parts[1];
    const apiModelId = parts[2];
    const capabilityId = parts[3];
    if (apiModelId) {
      model = apiModelId;
      entityId = apiModelId;
      orgId = apiModelId.split("/")[0] ?? null;
    } else if (apiProviderId) {
      model = apiProviderId;
      entityId = apiProviderId;
      orgId = apiProviderId;
    }
    endpoint = capabilityId ?? null;
  }

  if (!entityId) {
    const filename = parts[parts.length - 1];
    if (filename) {
      const base = filename.replace(/\.json$/, "");
      entityId = base;
      model = model ?? base;
    }
  }

  return { model, entityId, orgId, endpoint };
}

function extractMeta(filePath: string, data: any, oldPath?: string): Meta {
  const pathForType = filePath || oldPath || "";
  const entityType = resolveEntityType(pathForType);
  const fallback = fallbackMetaFromPath(pathForType);

  const modelId = data?.model_id ?? null;
  const apiModelId = data?.api_model_id ?? null;
  const familyId = data?.family_id ?? null;
  const familyName = data?.family_name ?? null;
  const planId = data?.plan_id ?? null;
  const planName = data?.name ?? null;
  const benchmarkId = data?.benchmark_id ?? null;
  const aliasSlug = data?.alias_slug ?? null;
  const organisationId = data?.organisation_id ?? null;
  const organisationName = data?.name ?? null;
  const apiProviderId = data?.api_provider_id ?? data?.provider_slug ?? null;
  const endpoint = data?.endpoint ?? data?.capability_id ?? fallback.endpoint ?? null;
  const pricingKey = data?.key ?? null;

  const entityId =
    pricingKey ??
    modelId ??
    apiModelId ??
    familyId ??
    planId ??
    benchmarkId ??
    aliasSlug ??
    organisationId ??
    apiProviderId ??
    data?.id ??
    fallback.entityId ??
    "unknown";

  const model =
    modelId ??
    apiModelId ??
    familyName ??
    familyId ??
    planName ??
    planId ??
    benchmarkId ??
    aliasSlug ??
    organisationName ??
    organisationId ??
    apiProviderId ??
    fallback.model ??
    entityId;

  const orgCandidates = [
    organisationId,
    apiModelId ? apiModelId.split("/")[0] ?? null : null,
    apiProviderId,
    fallback.orgId,
    planId ? organisationId ?? fallback.orgId ?? null : null,
    aliasSlug ? aliasSlug.split("/")[0] ?? null : null,
    familyId ? familyId.split("/")[0] ?? null : null,
    modelId ? modelId.split("/")[0] ?? null : null,
  ];
  const orgId =
    orgCandidates.find((value): value is string => typeof value === "string" && value.length > 0) ??
    null;

  const provider =
    entityType === "pricing"
      ? modelId || apiModelId
        ? "model"
        : apiProviderId
        ? "api-provider"
        : "model"
      : entityType;

  return {
    provider,
    model,
    endpoint,
    entityType,
    entityId,
    orgId,
  };
}

function calcPercentChange(before: any, after: any): number | undefined {
  if (typeof before !== "number" || typeof after !== "number") return undefined;
  if (!Number.isFinite(before) || !Number.isFinite(after)) return undefined;
  if (before === 0) return undefined;
  return ((after - before) / before) * 100;
}

export type HistoryEntry = {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  endpoint: string | null;
  field: string;
  oldValue: any;
  newValue: any;
  percentChange?: number;
  action: ChangeAction;
  entityType: string;
  entityId: string;
  orgId: string | null;
  commit: string;
  file: string;
};

export type HistoryMeta = {
  base: string;
  head: string;
  generatedAt: string;
  commitCount: number;
  lastSha: string;
};

export type HistoryBuildResult = {
  commits: string[];
  entries: HistoryEntry[];
  meta: HistoryMeta;
};

function buildEntry(
  commit: string,
  file: string,
  timestamp: string,
  meta: Meta,
  action: ChangeAction,
  field: string,
  before: any,
  after: any
): HistoryEntry {
  return {
    id: `${commit}:${file}:${meta.entityType}:${meta.entityId}:${meta.model}:${field || "entity"}`,
    timestamp,
    provider: meta.provider,
    model: meta.model,
    endpoint: meta.endpoint,
    field,
    oldValue: before,
    newValue: after,
    percentChange: calcPercentChange(before, after),
    action,
    entityType: meta.entityType,
    entityId: meta.entityId,
    orgId: meta.orgId,
    commit,
    file,
  };
}

function shouldTrackEntityAction(meta: Meta): boolean {
  return meta.entityType === "model";
}

function shouldTrackDiff(meta: Meta, diff: DiffItem): boolean {
  if (diff.field === "description") return meta.entityType === "model";
  if (diff.field === "status") return meta.entityType === "model";
  if (diff.field === "deprecation_date") return meta.entityType === "model";
  if (diff.field === "retirement_date") return meta.entityType === "model";
  if (diff.field.startsWith("benchmarks.")) return meta.entityType === "model";
  if (diff.field.startsWith("links.")) return meta.entityType === "model";
  if (diff.field.startsWith("pricing.")) return meta.entityType === "pricing";
  return false;
}

function isProviderModelListingDiff(meta: Meta, filePath: string, diff: DiffItem): boolean {
  if (meta.entityType !== "api-provider") return false;
  if (!normalizeRepoPath(filePath).endsWith("/models.json")) return false;
  if (diff.kind !== "provider-model-listing") return false;

  const added = diff.before == null && diff.after != null;
  const removed = diff.before != null && diff.after == null;
  return added || removed;
}

function isProviderModelStatusDiff(meta: Meta, filePath: string, diff: DiffItem): boolean {
  if (meta.entityType !== "api-provider") return false;
  if (!normalizeRepoPath(filePath).endsWith("/models.json")) return false;
  return diff.kind === "provider-model-status";
}

function toProviderModelListingEntry(
  commit: string,
  file: string,
  timestamp: string,
  meta: Meta,
  diff: DiffItem
): HistoryEntry | null {
  if (!isProviderModelListingDiff(meta, file, diff)) return null;

  const modelId = String(diff.modelId ?? diff.after ?? diff.before ?? "").trim();
  const providerId = String(meta.entityId ?? meta.orgId ?? "").trim();
  if (!modelId || !providerId) return null;

  const listingMeta: Meta = {
    provider: "api-provider",
    model: modelId,
    endpoint: null,
    entityType: "api-provider",
    entityId: providerId,
    orgId: providerId,
  };

  const action: ChangeAction = diff.after == null ? "removed" : "added";

  return buildEntry(
    commit,
    file,
    timestamp,
    listingMeta,
    action,
    "",
    action === "added" ? null : "Listed",
    action === "added" ? "Listed" : null
  );
}

function toProviderModelStatusEntry(
  commit: string,
  file: string,
  timestamp: string,
  meta: Meta,
  diff: DiffItem
): HistoryEntry | null {
  if (!isProviderModelStatusDiff(meta, file, diff)) return null;

  const modelId = String(diff.modelId ?? "").trim();
  const providerId = String(meta.entityId ?? meta.orgId ?? "").trim();
  if (!modelId || !providerId) return null;

  const statusMeta: Meta = {
    provider: "api-provider",
    model: modelId,
    endpoint: null,
    entityType: "api-provider",
    entityId: providerId,
    orgId: providerId,
  };

  return buildEntry(
    commit,
    file,
    timestamp,
    statusMeta,
    "changed",
    "status",
    diff.before ?? null,
    diff.after ?? null
  );
}

function getEntityActionValues(
  meta: Meta,
  action: "added" | "removed",
  beforeData: any,
  afterData: any
) {
  if (meta.entityType === "model") {
    const beforeStatus = beforeData?.status ?? null;
    const afterStatus = afterData?.status ?? null;

    return action === "added"
      ? { before: null, after: afterStatus }
      : { before: beforeStatus, after: null };
  }

  return action === "added"
    ? { before: null, after: meta.entityId }
    : { before: meta.entityId, after: null };
}

function processCommit(commit: string): HistoryEntry[] {
  const changedFiles = getChangedFiles(commit);
  if (changedFiles.length === 0) return [];

  const parent = getParentCommit(commit);
  const timestamp = getCommitDate(commit);
  const entries: HistoryEntry[] = [];
  const refs: string[] = [];

  for (const change of changedFiles) {
    const beforePath = change.oldPath ?? change.path;
    if (parent && change.status !== "A") refs.push(`${parent}:${beforePath}`);
    if (change.status !== "D") refs.push(`${commit}:${change.path}`);
  }

  const contentByRef = getBlobContents(refs);

  for (const change of changedFiles) {
    const beforePath = change.oldPath ?? change.path;
    const beforeRef = parent ? `${parent}:${beforePath}` : null;
    const afterRef = `${commit}:${change.path}`;
    const beforeContent =
      beforeRef && change.status !== "A" ? contentByRef.get(beforeRef) ?? null : null;
    const afterContent =
      change.status !== "D" ? contentByRef.get(afterRef) ?? null : null;

    const beforeData = parseJson(beforeContent);
    const afterData = parseJson(afterContent);

    if (change.status === "R") {
      const metaBefore = extractMeta(beforePath, beforeData, change.oldPath);
      const metaAfter = extractMeta(change.path, afterData, change.oldPath);

      if (!shouldTrackEntityAction(metaBefore) && !shouldTrackEntityAction(metaAfter)) {
        continue;
      }

      const removedValues = getEntityActionValues(
        metaBefore,
        "removed",
        beforeData,
        null
      );
      const addedValues = getEntityActionValues(
        metaAfter,
        "added",
        null,
        afterData
      );

      entries.push(
        buildEntry(
          commit,
          beforePath,
          timestamp,
          metaBefore,
          "removed",
          "",
          removedValues.before,
          removedValues.after
        )
      );
      entries.push(
        buildEntry(
          commit,
          change.path,
          timestamp,
          metaAfter,
          "added",
          "",
          addedValues.before,
          addedValues.after
        )
      );
      continue;
    }

    const meta = extractMeta(change.path, afterData ?? beforeData, change.oldPath);

    if (change.status === "A") {
      if (!shouldTrackEntityAction(meta)) continue;
      const actionValues = getEntityActionValues(meta, "added", null, afterData);
      entries.push(
        buildEntry(
          commit,
          change.path,
          timestamp,
          meta,
          "added",
          "",
          actionValues.before,
          actionValues.after
        )
      );
      continue;
    }

    if (change.status === "D") {
      if (!shouldTrackEntityAction(meta)) continue;
      const actionValues = getEntityActionValues(meta, "removed", beforeData, null);
      entries.push(
        buildEntry(
          commit,
          change.path,
          timestamp,
          meta,
          "removed",
          "",
          actionValues.before,
          actionValues.after
        )
      );
      continue;
    }

    const diffs = diffValues(beforeData, afterData);
    const providerListingEntries =
      meta.entityType === "api-provider"
        ? diffs
            .map((diff) => toProviderModelListingEntry(commit, change.path, timestamp, meta, diff))
            .filter((entry): entry is HistoryEntry => entry != null)
        : [];
    const providerStatusEntries =
      meta.entityType === "api-provider"
        ? diffs
            .map((diff) => toProviderModelStatusEntry(commit, change.path, timestamp, meta, diff))
            .filter((entry): entry is HistoryEntry => entry != null)
        : [];

    if (providerListingEntries.length > 0) {
      entries.push(...providerListingEntries);
    }
    if (providerStatusEntries.length > 0) {
      entries.push(...providerStatusEntries);
    }

    const filteredDiffs = diffs.filter((diff) => {
      if (isProviderModelListingDiff(meta, change.path, diff)) return false;
      if (isProviderModelStatusDiff(meta, change.path, diff)) return false;
      if (meta.entityType === "benchmark" && diff.field === "total_models")
        return false;
      if (meta.entityType === "model" && diff.field === "model_id") return false;
      if (
        meta.entityType === "pricing" &&
        (diff.field === "model_id" || diff.field === "key")
      )
        return false;
      if (
        (meta.entityType === "organisation" || meta.entityType === "api-provider") &&
        diff.field.startsWith("models")
      )
        return false;
      return shouldTrackDiff(meta, diff);
    });

    if (filteredDiffs.length === 0) {
      continue;
    }

    for (const diff of filteredDiffs) {
      entries.push(
        buildEntry(
          commit,
          change.path,
          timestamp,
          meta,
          "changed",
          diff.field,
          diff.before,
          diff.after
        )
      );
    }
  }

  return entries;
}

export function listCommitsInRange(base: string, head: string): string[] {
  const safeBase = assertSafeGitRef(base, "base ref");
  const safeHead = assertSafeGitRef(head, "head ref");
  const out = git(["rev-list", "--reverse", `${safeBase}..${safeHead}`]).trim();
  if (!out) return [];
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function getParentCommitSha(commit: string): string | null {
  return getParentCommit(commit);
}

export function buildHistoryForCommits(
  commits: string[],
  base: string,
  head: string
): HistoryBuildResult {
  const entries: HistoryEntry[] = [];
  for (const commit of commits) entries.push(...processCommit(commit));
  entries.sort(compareEntries);

  return {
    commits,
    entries,
    meta: {
      base,
      head,
      generatedAt: new Date().toISOString(),
      commitCount: commits.length,
      lastSha: head,
    },
  };
}

export function buildHistoryForRange(base: string, head: string): HistoryBuildResult {
  const commits = listCommitsInRange(base, head);
  return buildHistoryForCommits(commits, base, head);
}

export function buildHistoryForSingleCommit(commit: string): HistoryBuildResult {
  const base = getParentCommit(commit) ?? commit;
  return buildHistoryForCommits([commit], base, commit);
}

function writeHistory(
  entries: HistoryEntry[],
  existingEntries: HistoryEntry[],
  meta: HistoryMeta
) {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  const seen = new Set<string>();
  const merged: HistoryEntry[] = [];

  // Keep new entries first, then preserve older unique entries.
  for (const entry of [...entries, ...existingEntries]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }

  const payload = { meta, entries: merged };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function compareEntries(a: HistoryEntry, b: HistoryEntry): number {
  const timeA = new Date(a.timestamp).getTime();
  const timeB = new Date(b.timestamp).getTime();
  if (timeA !== timeB) return timeB - timeA;

  const orgA = (a.orgId ?? "").toLowerCase();
  const orgB = (b.orgId ?? "").toLowerCase();
  if (orgA !== orgB) return orgA.localeCompare(orgB);

  const nameA = (a.model ?? "").toLowerCase();
  const nameB = (b.model ?? "").toLowerCase();
  if (nameA !== nameB) return nameA.localeCompare(nameB);

  const actionWeight: Record<ChangeAction, number> = {
    added: 0,
    changed: 1,
    removed: 2,
  };
  const actionDiff = actionWeight[a.action] - actionWeight[b.action];
  if (actionDiff !== 0) return actionDiff;

  const typeWeight = (entry: HistoryEntry) => {
    if (entry.entityType === "organisation") return 0;
    if (entry.entityType === "model") return 1;
    if (entry.entityType === "family") return 2;
    if (entry.entityType === "api-provider") return 3;
    if (entry.entityType === "benchmark") return 4;
    if (entry.entityType === "alias") return 5;
    if (entry.entityType === "subscription-plan") return 6;
    if (entry.entityType === "pricing") return 7;
    return 8;
  };
  const typeDiff = typeWeight(a) - typeWeight(b);
  if (typeDiff !== 0) return typeDiff;

  const endpointA = a.endpoint ? 1 : 0;
  const endpointB = b.endpoint ? 1 : 0;
  if (endpointA !== endpointB) return endpointA - endpointB;

  return a.id.localeCompare(b.id);
}

function readExistingHistory(): { entries: HistoryEntry[]; meta?: HistoryMeta } {
  if (!fs.existsSync(HISTORY_FILE)) return { entries: [] };
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries)
      ? (parsed.entries as HistoryEntry[])
      : [];
    return { entries, meta: parsed?.meta as HistoryMeta | undefined };
  } catch {
    return { entries: [] };
  }
}

function main() {
  const args = process.argv.slice(2);
  const shouldSyncDb = args.includes("--sync-db");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const a = positional[0];
  const b = positional[1];

  if (!a) {
    console.error(
      "Usage: tsx scripts/update-monitor-history.ts <commit> OR <base> <head> [--sync-db]"
    );
    process.exit(1);
  }

  const result = b ? buildHistoryForRange(a, b) : buildHistoryForSingleCommit(a);
  const commits = result.commits;

  if (commits.length === 0) {
    console.log("No relevant commits found.");
    return;
  }

  const entries = result.entries;

  if (entries.length === 0) {
    console.log("No relevant changes found.");
    return;
  }

  const existingHistory = readExistingHistory();
  const regeneratedCommits = new Set(commits);
  const existingEntries = existingHistory.entries.filter(
    (entry) => !regeneratedCommits.has(entry.commit)
  );
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  const newEntries = entries.filter((entry) => !existingIds.has(entry.id));

  if (newEntries.length === 0) {
    console.log("No new history entries to add.");
    return;
  }

  writeHistory(newEntries, existingEntries, result.meta);

  if (shouldSyncDb) {
    execSync(
      "pnpm --filter @ai-stats/web exec tsx scripts/sync-monitor-history-to-supabase.ts",
      {
        stdio: "inherit",
      }
    );
  }

  console.log(
    `Updated monitor history for ${commits.length} commit(s). Wrote ${newEntries.length} entries.`
  );
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

export const testingExports = {
  assertSafeGitRef,
  diffBenchmarks,
  diffModelList,
  shouldTrackDiff,
  isProviderModelListingDiff,
  toProviderModelListingEntry,
  isProviderModelStatusDiff,
  toProviderModelStatusEntry,
};

if (isMainModule()) {
  main();
}
