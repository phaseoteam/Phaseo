/** Stamped into the main bundle by vite.main.config.ts; absent under vitest and in builds made without Git. */
declare const __PHASEO_BUILD__: { commit?: string; dirty?: boolean; builtAt?: string } | undefined;

export const buildStamp: { commit?: string; dirty?: boolean; builtAt?: string } = typeof __PHASEO_BUILD__ === "undefined" ? {} : __PHASEO_BUILD__;
