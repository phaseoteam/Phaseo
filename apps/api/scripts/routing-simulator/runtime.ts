// This module replaces the Worker environment through an exact Vite alias.
// It never imports production bindings, reads credentials, or opens a socket.
const store = new Map<string, { value: string; expires: number }>();
let coordinator: ((event: import("../../src/pipeline/execute/health-evidence").HealthObservation) => Promise<import("../../src/pipeline/execute/health-evidence").HealthReceipt | null>) | undefined;
let snapshot: (() => import("../../src/pipeline/execute/health-evidence").HealthSnapshot) | undefined;
export function setHealthCoordinator(value: typeof coordinator) { coordinator = value; }
export function setHealthSnapshot(value: typeof snapshot) { snapshot = value; }
const background: Promise<unknown>[] = [];
let epoch = 0;
let outages: Array<{ fromMs: number; untilMs: number; reads: boolean; writes: boolean }> = [];
let enforceKvLimits = false;
const lastWrite = new Map<string, number>();
export const cacheOperations = { reads: 0, writes: 0, failedReads: 0, failedWrites: 0 };
export function configureCacheFaults(start: number, windows: typeof outages, limits = false) { epoch = start; outages = windows; enforceKvLimits = limits; }
function fault(kind: "reads" | "writes") {
  cacheOperations[kind]++;
  if (outages.some(w => Date.now() - epoch >= w.fromMs && Date.now() - epoch < w.untilMs && w[kind])) {
    if (kind === "reads") cacheOperations.failedReads++; else cacheOperations.failedWrites++;
    throw new Error(`Scripted cache ${kind} outage`);
  }
}
export const transitions: Array<Record<string, unknown>> = [];
export function inspectStoredHealth(key: string): Record<string, string> {
  const row = store.get(key);
  return row && row.expires > Date.now() ? JSON.parse(row.value) : {};
}
export function resetRuntime() {
  coordinator = undefined; snapshot = undefined;
  store.clear(); background.length = 0; transitions.length = 0; outages = []; lastWrite.clear(); enforceKvLimits = false;
  cacheOperations.reads = cacheOperations.writes = cacheOperations.failedReads = cacheOperations.failedWrites = 0;
}
export function dispatchBackground(task: Promise<unknown>) { background.push(task); }
export function getBindings() {
  return coordinator ? { ROUTING_HEALTH: { idFromName: (name: string) => name, get: () => ({ observe: coordinator!,
    getSnapshot: async () => structuredClone(snapshot?.() ?? { version: 0, publishedAt: 0, providers: {} }) }) } } : {};
}
export async function flushBackground() {
  while (background.length) await Promise.all(background.splice(0));
}
export function getCache() {
  return {
    async get(key: string) {
      fault("reads");
      const row = store.get(key);
      if (!row || row.expires <= Date.now()) { store.delete(key); return null; }
      return row.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      fault("writes");
      if (enforceKvLimits && ((options?.expirationTtl !== undefined && options.expirationTtl < 60) || Date.now()-(lastWrite.get(key) ?? -Infinity) < 1000)) {
        cacheOperations.failedWrites++; throw new Error("Scripted KV platform write limit");
      }
      lastWrite.set(key,Date.now());
      store.set(key, { value, expires: Date.now() + (options?.expirationTtl ?? Infinity) * 1000 });
    },
    async delete(key: string) { fault("writes"); store.delete(key); },
  };
}
export function getSupabaseAdmin() {
  return { from(table: string) {
    if (table !== "gateway_provider_health_states") throw new Error(`Unsupported simulator table: ${table}`);
    return { async upsert(row: Record<string, unknown>) {
      transitions.push(structuredClone(row));
      return { error: null };
    } };
  } };
}
