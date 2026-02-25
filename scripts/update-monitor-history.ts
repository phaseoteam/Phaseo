import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HISTORY_FILE = "apps/web/src/data/monitor-history.json";

type ChangeAction = "added" | "changed" | "removed";

type DiffItem = {
  field: string;
  before: any;
  after: any;
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

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" }).toString();
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

function isDataFile(filePath: string): boolean {
  if (!filePath.startsWith("apps/web/src/data/")) return false;
  if (!filePath.endsWith(".json")) return false;

  const parts = filePath.split("/");
  const dataIndex = parts.indexOf("data");
  const dir = dataIndex === -1 ? null : parts[dataIndex + 1];

  return dir ? DATA_DIRS.has(dir) : false;
}

function getChangedFiles(commit: string): ChangeFile[] {
  const output = sh(`git show --name-status --pretty="" ${commit}`).trim();
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

function getFileContent(commit: string, filePath: string): string | null {
  try {
    return sh(`git show ${commit}:${filePath}`);
  } catch {
    return null;
  }
}

function getCommitDate(commit: string): string {
  try {
    return sh(`git log -1 --format=%ci ${commit}`).trim();
  } catch {
    return new Date().toISOString();
  }
}

function getParentCommit(commit: string): string | null {
  try {
    const out = sh(`git log -1 --format=%P ${commit}`).trim();
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
  const toKey = (item: any) =>
    `${item?.benchmark_id ?? "unknown"}::${item?.other_info ?? ""}`;

  const beforeMap = new Map<string, any>();
  const afterMap = new Map<string, any>();

  for (const item of before) beforeMap.set(toKey(item), item);
  for (const item of after) afterMap.set(toKey(item), item);

  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const diffs: DiffItem[] = [];

  for (const key of keys) {
    const prev = beforeMap.get(key);
    const next = afterMap.get(key);
    const name = key.split("::")[0] || "unknown";
    const note = key.split("::")[1];
    const label = note ? `${name}[${note}]` : name;
    const diffField = `${field}.${label}.score`;

    if (prev && !next) {
      diffs.push({ field: diffField, before: prev?.score ?? null, after: null });
      continue;
    }

    if (!prev && next) {
      diffs.push({ field: diffField, before: null, after: next?.score ?? null });
      continue;
    }

    const prevScore = prev?.score ?? null;
    const nextScore = next?.score ?? null;
    if (prevScore !== nextScore) {
      diffs.push({ field: diffField, before: prevScore, after: nextScore });
    }
  }

  return diffs;
}

function diffModelList(before: any[], after: any[], field: string): DiffItem[] {
  const toId = (item: any) => item?.model_id ?? null;
  const beforeIds = new Set(before.map(toId).filter(Boolean));
  const afterIds = new Set(after.map(toId).filter(Boolean));

  const diffs: DiffItem[] = [];
  const allIds = new Set([...beforeIds, ...afterIds]);

  for (const id of allIds) {
    if (beforeIds.has(id) && !afterIds.has(id)) {
      diffs.push({ field: `${field}.${id}`, before: id, after: null });
      continue;
    }
    if (!beforeIds.has(id) && afterIds.has(id)) {
      diffs.push({ field: `${field}.${id}`, before: null, after: id });
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
    if (field === "models" && before.every(isPlainObject) && after.every(isPlainObject)) {
      const diffs = diffModelList(before, after, field);
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
  const parts = filePath.split("/");
  const dataIndex = parts.indexOf("data");
  const rawType = dataIndex === -1 ? "unknown" : parts[dataIndex + 1];

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
  const parts = filePath.split("/");
  const dataIndex = parts.indexOf("data");
  const rawType = dataIndex === -1 ? "unknown" : parts[dataIndex + 1];

  let model: string | null = null;
  let entityId: string | null = null;
  let orgId: string | null = null;
  let endpoint: string | null = null;

  if (rawType === "models") {
    const org = parts[dataIndex + 2];
    const slug = parts[dataIndex + 3];
    if (org && slug) {
      model = `${org}/${slug}`;
      entityId = model;
      orgId = org;
    }
  } else if (rawType === "benchmarks") {
    entityId = parts[dataIndex + 2] ?? null;
    model = entityId;
  } else if (rawType === "organisations") {
    entityId = parts[dataIndex + 2] ?? null;
    model = entityId;
    orgId = entityId;
  } else if (rawType === "api_providers") {
    entityId = parts[dataIndex + 2] ?? null;
    model = entityId;
    orgId = entityId;
  } else if (rawType === "families") {
    entityId = parts[dataIndex + 2] ?? null;
    model = entityId;
    orgId = entityId?.split("/")[0] ?? null;
  } else if (rawType === "pricing") {
    const org = parts[dataIndex + 2];
    const endpointPart = parts[dataIndex + 3];
    const slug = parts[dataIndex + 4];
    if (org && slug) {
      model = `${org}/${slug}`;
      entityId = model;
      orgId = org;
    }
    endpoint = endpointPart ?? null;
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
  const familyId = data?.family_id ?? null;
  const familyName = data?.family_name ?? null;
  const planId = data?.plan_id ?? null;
  const planName = data?.name ?? null;
  const benchmarkId = data?.benchmark_id ?? null;
  const aliasSlug = data?.alias_slug ?? null;
  const organisationId = data?.organisation_id ?? null;
  const organisationName = data?.name ?? null;
  const apiProviderId = data?.api_provider_id ?? data?.provider_slug ?? null;
  const endpoint = data?.endpoint ?? fallback.endpoint ?? null;
  const pricingKey = data?.key ?? null;

  const entityId =
    pricingKey ??
    modelId ??
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

  const orgId =
    organisationId ??
    apiProviderId ??
    fallback.orgId ??
    (planId ? organisationId ?? fallback.orgId ?? null : null) ??
    (aliasSlug ? aliasSlug.split("/")[0] ?? null : null) ??
    (familyId ? familyId.split("/")[0] ?? null : null) ??
    (modelId ? modelId.split("/")[0] ?? null : null);

  const provider =
    entityType === "pricing"
      ? modelId
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

type HistoryEntry = {
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

type HistoryMeta = {
  base: string;
  head: string;
  generatedAt: string;
  commitCount: number;
  lastSha: string;
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
    id: `${commit}:${file}:${field || "entity"}`,
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

function processCommit(commit: string): HistoryEntry[] {
  const changedFiles = getChangedFiles(commit);
  if (changedFiles.length === 0) return [];

  const parent = getParentCommit(commit);
  const timestamp = getCommitDate(commit);
  const entries: HistoryEntry[] = [];

  for (const change of changedFiles) {
    const beforePath = change.oldPath ?? change.path;
    const beforeContent = parent && change.status !== "A" ? getFileContent(parent, beforePath) : null;
    const afterContent = change.status !== "D" ? getFileContent(commit, change.path) : null;

    const beforeData = parseJson(beforeContent);
    const afterData = parseJson(afterContent);

    if (change.status === "R") {
      const metaBefore = extractMeta(beforePath, beforeData, change.oldPath);
      const metaAfter = extractMeta(change.path, afterData, change.oldPath);

      entries.push(
        buildEntry(
          commit,
          beforePath,
          timestamp,
          metaBefore,
          "removed",
          "",
          metaBefore.entityId,
          null
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
          null,
          metaAfter.entityId
        )
      );
      continue;
    }

    const meta = extractMeta(change.path, afterData ?? beforeData, change.oldPath);

    if (change.status === "A") {
      entries.push(
        buildEntry(commit, change.path, timestamp, meta, "added", "", null, meta.entityId)
      );
      continue;
    }

    if (change.status === "D") {
      entries.push(
        buildEntry(commit, change.path, timestamp, meta, "removed", "", meta.entityId, null)
      );
      continue;
    }

    const diffs = diffValues(beforeData, afterData);
    const filteredDiffs = diffs.filter((diff) => {
      if (meta.entityType === "benchmark" && diff.field === "total_models")
        return false;
      if (meta.entityType === "model" && diff.field === "model_id") return false;
      if (
        meta.entityType === "pricing" &&
        (diff.field === "model_id" || diff.field === "key")
      )
        return false;
      if (meta.entityType === "model" && diff.field.startsWith("links"))
        return false;
      if (
        (meta.entityType === "organisation" || meta.entityType === "api-provider") &&
        diff.field.startsWith("models")
      )
        return false;
      return true;
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

function listCommitsInRange(base: string, head: string): string[] {
  const out = sh(`git rev-list --reverse ${base}..${head}`).trim();
  if (!out) return [];
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
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
  const orgA = (a.orgId ?? "").toLowerCase();
  const orgB = (b.orgId ?? "").toLowerCase();
  if (orgA !== orgB) return orgA.localeCompare(orgB);

  const nameA = (a.model ?? "").toLowerCase();
  const nameB = (b.model ?? "").toLowerCase();
  if (nameA !== nameB) return nameA.localeCompare(nameB);

  const timeA = new Date(a.timestamp).getTime();
  const timeB = new Date(b.timestamp).getTime();
  if (timeA !== timeB) return timeB - timeA;

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
  const a = process.argv[2];
  const b = process.argv[3];

  if (!a) {
    console.error("Usage: tsx scripts/update-monitor-history.ts <commit> OR <base> <head>");
    process.exit(1);
  }

  const commits = b ? listCommitsInRange(a, b) : [a];

  if (commits.length === 0) {
    console.log("No relevant commits found.");
    return;
  }

  const entries: HistoryEntry[] = [];
  for (const commit of commits) entries.push(...processCommit(commit));

  if (entries.length === 0) {
    console.log("No relevant changes found.");
    return;
  }

  const head = b ?? a;
  const base = b ? a : getParentCommit(a) ?? a;
  const existingHistory = readExistingHistory();
  const existingEntries = existingHistory.entries;
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  const newEntries = entries.filter((entry) => !existingIds.has(entry.id));

  if (newEntries.length === 0) {
    console.log("No new history entries to add.");
    return;
  }

  newEntries.sort(compareEntries);
  const meta = {
    base,
    head,
    generatedAt: new Date().toISOString(),
    commitCount: commits.length,
    lastSha: head,
  };

  writeHistory(newEntries, existingEntries, meta);

  console.log(
    `Updated monitor history for ${commits.length} commit(s). Wrote ${newEntries.length} entries.`
  );
}

main();
