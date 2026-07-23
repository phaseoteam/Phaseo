// src/routes/root.ts
// Purpose: Root routes (basic info, OAuth discovery, and top-level wiring).
// Why: Keeps non-versioned routes explicit and minimal.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "./utils";
import { getLocalJwks } from "@/lib/oauth/service";
import { OAUTH_CORS_HEADERS, oauthAuthorizationServerMetadata } from "./oauth";

export const rootRouter = new Hono<Env>();

rootRouter.use("/.well-known/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
    }
    await next();
    const headers = new Headers(c.res.headers);
    for (const [key, value] of Object.entries(OAUTH_CORS_HEADERS)) headers.set(key, value);
    c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers,
    });
});

rootRouter.get(
    "/",
    withRuntime(async () =>
        json({
            message:
                "Welcome to the Phaseo Gateway API! Documentation is available at https://phaseo.app",
            timestamp: new Date().toISOString(),
        })
    )
);

rootRouter.get(
    "/.well-known/openid-configuration",
    withRuntime(async () =>
        json(
            oauthAuthorizationServerMetadata(),
            200,
            { "Cache-Control": "public, max-age=300" },
        )
    )
);

// Path-aware OpenID discovery alias for the /oauth issuer. Some clients use
// the RFC 8414 insertion form for both OAuth and OpenID metadata discovery.
rootRouter.get(
    "/.well-known/openid-configuration/oauth",
    withRuntime(async () =>
        json(
            oauthAuthorizationServerMetadata(),
            200,
            { "Cache-Control": "public, max-age=300" },
        )
    )
);

// RFC 8414 inserts the well-known path before an issuer path. With the issuer
// https://api.phaseo.app/oauth, standards-compliant clients discover this URL.
rootRouter.get(
    "/.well-known/oauth-authorization-server/oauth",
    withRuntime(async () =>
        json(oauthAuthorizationServerMetadata(), 200, { "Cache-Control": "public, max-age=300" })
    )
);

// Keep a root-level alias for clients that probe the host before resolving the
// issuer-specific RFC 8414 URL.
rootRouter.get(
    "/.well-known/oauth-authorization-server",
    withRuntime(async () =>
        json(oauthAuthorizationServerMetadata(), 200, { "Cache-Control": "public, max-age=300" })
    )
);

rootRouter.get(
    "/.well-known/jwks.json",
    withRuntime(async () => json(await getLocalJwks(), 200, { "Cache-Control": "public, max-age=300" }))
);








