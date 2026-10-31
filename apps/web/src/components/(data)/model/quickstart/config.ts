// src/components/gateway/config.ts
export const BASE_URL = "https://api.phaseo.app/v1";
// Anthropic SDKs append /v1/messages themselves, so they take the bare host.
export const ANTHROPIC_SDK_BASE_URL = "https://api.phaseo.app";
export const DOCS_VERSION = "v1";

// Toggle via env at build time to keep the page static:
export const SHOW_COMING_SOON =
    process.env.PUBLIC_GATEWAY_COMING_SOON === "1";
