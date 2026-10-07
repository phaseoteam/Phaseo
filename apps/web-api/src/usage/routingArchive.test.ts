import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { readRoutingArchive } from "./routingArchive";

async function fixture(body = { version: 1, workspace_id: "w", request_id: "r", routing_decisions: [{ score: 0.5 }] }) {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const requestDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("r"));
    const requestHash = Array.from(new Uint8Array(requestDigest), b => b.toString(16).padStart(2, "0")).join("");
    const pointer = { version: 1, key: `workspaces/w/routing/v1/${requestHash}/${sha256}.json`, sha256, bytes: bytes.byteLength };
    const get = vi.fn().mockResolvedValue({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer });
    const env = { GATEWAY_IO_LOGS_BUCKET: { get } } as unknown as Env;
    return { pointer, env, get };
}

describe("authorized routing archive reads", () => {
    it("restores the complete explanation", async () => {
        const { pointer, env } = await fixture();
        expect(await readRoutingArchive(env, "w", "r", pointer)).toMatchObject({ routing_decisions: [{ score: 0.5 }] });
    });
    it("rejects another workspace or request before reading R2", async () => {
        const { pointer, env, get } = await fixture();
        expect(await readRoutingArchive(env, "other", "r", pointer)).toBeNull();
        expect(await readRoutingArchive(env, "w", "other", pointer)).toBeNull();
        expect(get).not.toHaveBeenCalled();
    });
    it("rejects tampered objects and mismatched embedded ownership", async () => {
        const { pointer, env, get } = await fixture();
        get.mockResolvedValue({ size: pointer.bytes, arrayBuffer: async () => new Uint8Array(pointer.bytes).buffer });
        expect(await readRoutingArchive(env, "w", "r", pointer)).toBeNull();
        const mismatch = await fixture({ version: 1, workspace_id: "other", request_id: "r", routing_decisions: [] });
        expect(await readRoutingArchive(mismatch.env, "w", "r", mismatch.pointer)).toBeNull();
    });
    it("handles unavailable objects without failing the accounting detail read", async () => {
        const { pointer, env, get } = await fixture();
        get.mockResolvedValue(null);
        expect(await readRoutingArchive(env, "w", "r", pointer)).toBeNull();
        get.mockRejectedValue(new Error("offline"));
        expect(await readRoutingArchive(env, "w", "r", pointer)).toBeNull();
    });
});
