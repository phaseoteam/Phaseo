import type { ServerProviderModel } from "@t3tools/contracts";
import { PHASEO_GATEWAY_ENDPOINT } from "./phaseoOAuth.ts";

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Phaseo's catalog is paginated and uses canonical capabilities, not OpenAI's data envelope. */
export async function discoverPhaseoModels(key: string, signal: AbortSignal, fetcher = fetch) {
  const url = new URL(`${PHASEO_GATEWAY_ENDPOINT}/models`);
  url.search = new URLSearchParams({
    limit: "250",
    gateway_available_only: "true",
    endpoints: "text.generate",
  }).toString();
  const models = new Map<string, ServerProviderModel>();
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < 40; page++) {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal,
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Sign in to Phaseo again."
          : "Could not load Phaseo models.",
      );
    // Bound upstream data without returning token-bearing response bodies in errors.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Phaseo returned an invalid model catalog.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Phaseo model catalog is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!body) throw new Error("Phaseo returned an invalid model catalog.");
    const native = Array.isArray(body.models);
    const entries = native ? body.models : body.data;
    if (
      !Array.isArray(entries) ||
      entries.length > 10_000 ||
      (native &&
        (body.ok !== true ||
          body.offset !== offset ||
          !Number.isSafeInteger(body.total) ||
          (body.total as number) < offset))
    )
      throw new Error("Phaseo returned invalid model pagination.");
    let added = 0;
    for (const entry of entries) {
      const model = object(entry);
      if (!model || typeof model.id !== "string" || !model.id.trim()) continue;
      if (!seen.has(model.id)) added++;
      seen.add(model.id);
      if (native) {
        const endpoints = object(model.capabilities)?.endpoints;
        if (
          !Array.isArray(endpoints) ||
          !endpoints.some((value) => value === "text.generate" || value === "responses") ||
          !Array.isArray(model.offers) ||
          !model.offers.some((offer) => object(offer)?.routable === true) ||
          object(model.lifecycle)?.status === "retired"
        )
          continue;
      }
      const organization = object(model.organization);
      models.set(model.id, {
        slug: model.id,
        name: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
        ...(typeof organization?.name === "string" && organization.name.trim()
          ? { subProvider: organization.name }
          : {}),
        isCustom: false,
        // Do not advertise Codex/OpenAI defaults as capabilities of a different lab's model.
        capabilities: { optionDescriptors: [] },
      });
    }
    if (
      seen.size > 10_000 ||
      (native &&
        ((!entries.length && offset < (body.total as number)) ||
          (page > 0 && entries.length > 0 && !added)))
    )
      throw new Error("Phaseo model catalog repeated or omitted a page.");
    if (!native || offset + entries.length >= (body.total as number)) return [...models.values()];
    offset += entries.length;
    url.searchParams.set("offset", String(offset));
  }
  throw new Error("Phaseo model catalog exceeded its pagination limit.");
}

/** Per-account discovery survives menu mounts; refresh failures retain the last usable catalog. */
export class PhaseoModelCache {
  private key = "";
  private checkedAt = 0;
  private models: ServerProviderModel[] = [];
  private pending: Promise<ServerProviderModel[]> | undefined;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  constructor(fetcher = fetch, now = Date.now) {
    this.fetcher = fetcher;
    this.now = now;
  }
  clear() {
    this.key = "";
    this.checkedAt = 0;
    this.models = [];
    this.pending = undefined;
  }
  async get(key: string, signal: AbortSignal) {
    if (key !== this.key) {
      this.clear();
      this.key = key;
    }
    if (this.checkedAt && this.now() - this.checkedAt < 600_000) return this.models;
    if (this.pending) return this.pending;
    const pending = discoverPhaseoModels(key, signal, this.fetcher).then((models) => {
      if (this.key === key) {
        this.models = models;
        this.checkedAt = this.now();
      }
      return models;
    });
    this.pending = pending;
    try {
      return await pending;
    } finally {
      if (this.pending === pending) this.pending = undefined;
    }
  }
  stale() {
    return this.models;
  }
}
