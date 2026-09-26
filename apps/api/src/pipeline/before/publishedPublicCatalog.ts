import { readStreamTextWithLimit } from "@/core/bounded-stream";
import { createPublicRoutingSnapshot, isPublicCatalogFresh, PUBLIC_CATALOG_MAX_BYTES,
    type PublicCatalogSnapshot } from "./publicCatalogSnapshot";

type Store = Pick<KVNamespace, "get" | "put">;

/** Shared public projection written by the control plane, never by inference.
 * KV retention is not authority: readers enforce the original source deadline.
 * No workspace identifiers, credentials, timers or database client live here. */
export class PublishedPublicCatalog {
    private active = 0;
    constructor(private readonly store: () => Store) {}

    private async key(model: string, endpoints: string[]) {
        if (!model || model.startsWith("@") || model.length > 512 || endpoints.length < 1 || endpoints.length > 2
            || endpoints.some(endpoint => !["text.generate", "responses", "chat.completions", "messages"].includes(endpoint))) {
            throw new Error("invalid_public_catalog_target");
        }
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([model, endpoints])));
        return `gateway:published-catalog:v1:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
    }

    async read(model: string, endpoints: string[]): Promise<PublicCatalogSnapshot | null> {
        if (this.active >= 32) return null;
        this.active++;
        try {
            const key = await this.key(model, endpoints);
            const stream = await this.store().get(key, "stream");
            if (!stream) return null;
            const raw = await readStreamTextWithLimit(stream, PUBLIC_CATALOG_MAX_BYTES + 4096);
            const envelope = JSON.parse(raw);
            if (envelope?.version !== 2 || typeof envelope.revision !== "string") return null;
            const snapshot = await createPublicRoutingSnapshot(envelope.catalog);
            if (snapshot.revision !== envelope.revision || !isPublicCatalogFresh(snapshot.catalog, model, endpoints)
                || snapshot.catalog.variants.every(variant => variant.providers.length === 0)) return null;
            return structuredClone(snapshot.catalog);
        } catch { return null; }
        finally { this.active--; }
    }

    async publish(input: unknown, expected: { model: string; endpoints: string[] }): Promise<boolean> {
        if (this.active >= 32) return false;
        this.active++;
        try {
            const key = await this.key(expected.model, expected.endpoints);
            const snapshot = await createPublicRoutingSnapshot(input);
            if (!isPublicCatalogFresh(snapshot.catalog, expected.model, expected.endpoints)
                || snapshot.catalog.variants.every(variant => variant.providers.length === 0)) return false;
            await this.store().put(key, JSON.stringify(snapshot), {
                // Minimum physical KV retention; logical expiry can be sooner.
                expirationTtl: Math.max(60, Math.ceil((snapshot.catalog.expiresAt - Date.now()) / 1000)),
            });
            return true;
        } catch { return false; }
        finally { this.active--; }
    }
}
