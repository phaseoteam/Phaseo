// src/components/gateway/config.ts
export const BASE_URL = "https://api.phaseo.app/v1";
export const DOCS_VERSION = "v1";

// Toggle via env at build time to keep the page static:
export const SHOW_COMING_SOON =
    process.env.NEXT_PUBLIC_GATEWAY_COMING_SOON === "1";