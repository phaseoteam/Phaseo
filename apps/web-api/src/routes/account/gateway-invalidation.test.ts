import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceGatewayContext } from "./gateway-invalidation";
import type { AccountWorkspaceContext } from "./context";
import type { Env } from "@/env";

const env = { PHASEO_CONTROL_KEY: "key", PHASEO_CONTROL_SECRET: "secret", GATEWAY_API_ORIGIN: "https://gateway.test/" } as Env;
const context = { workspaceId: "workspace-a", client: { from: () => { throw new Error("Must not enumerate API keys"); } } } as unknown as AccountWorkspaceContext;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("constant-size workspace publication", () => {
    it("uses one bounded, non-redirectable request and cancels the response body", async () => {
        const cancel = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        expect(await invalidateWorkspaceGatewayContext(context, env)).toBe(true);
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://gateway.test/v1/workspaces/workspace-a/invalidate", expect.objectContaining({
            method: "POST", redirect: "error", signal: expect.any(AbortSignal),
            headers: { authorization: "Bearer key", "x-control-secret": "secret" },
        }));
        expect(cancel).toHaveBeenCalledOnce();
    });
    it.each([401, 403, 404, 429, 503])("reports failed publication for HTTP %s", async status => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
        expect(await invalidateWorkspaceGatewayContext(context, env)).toBe(false);
    });
    it("reports network failure without throwing after a committed mutation", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
        expect(await invalidateWorkspaceGatewayContext(context, env)).toBe(false);
    });
    it("does not publish with missing credentials", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(await invalidateWorkspaceGatewayContext(context, {} as Env)).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it("encodes the workspace as one path segment", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
        vi.stubGlobal("fetch", fetchMock);
        await invalidateWorkspaceGatewayContext({ ...context, workspaceId: "a/b?c" }, env);
        expect(fetchMock.mock.calls[0][0]).toBe("https://gateway.test/v1/workspaces/a%2Fb%3Fc/invalidate");
    });
});
