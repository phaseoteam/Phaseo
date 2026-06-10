// src/routes/root.ts
// Purpose: Root routes (health, basic info, and top-level wiring).
// Why: Keeps non-versioned routes explicit and minimal.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "./utils";
import { ALL_SUPPORTED_SCOPES } from "@/lib/authz/capabilities";
import { getApiBaseUrl, getIssuer, getLocalJwks } from "@/lib/oauth/service";

export const rootRouter = new Hono<Env>();

rootRouter.get(
    "/",
    withRuntime(async () =>
        json({
            message:
                "Welcome to the AI Stats Gateway API! Documentation is available at https://docs.ai-stats.phaseo.app",
            timestamp: new Date().toISOString(),
        })
    )
);

rootRouter.get(
    "/.well-known/openid-configuration",
    withRuntime(async () =>
        json(
            {
                issuer: getIssuer(),
                authorization_endpoint: `${getApiBaseUrl()}/oauth/authorize`,
                token_endpoint: `${getApiBaseUrl()}/oauth/token`,
                device_authorization_endpoint: `${getApiBaseUrl()}/oauth/device/code`,
                revocation_endpoint: `${getApiBaseUrl()}/oauth/revoke`,
                userinfo_endpoint: `${getApiBaseUrl()}/oauth/userinfo`,
                jwks_uri: `${getApiBaseUrl()}/oauth/.well-known/jwks.json`,
                response_types_supported: ["code"],
                grant_types_supported: [
                    "authorization_code",
                    "refresh_token",
                    "urn:ietf:params:oauth:grant-type:device_code",
                ],
                scopes_supported: [...ALL_SUPPORTED_SCOPES],
                code_challenge_methods_supported: ["S256"],
            },
            200,
            { "Cache-Control": "public, max-age=300" },
        )
    )
);

rootRouter.get(
    "/.well-known/jwks.json",
    withRuntime(async () => json(await getLocalJwks(), 200, { "Cache-Control": "public, max-age=300" }))
);








