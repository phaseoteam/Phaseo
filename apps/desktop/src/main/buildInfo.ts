/** Stamped into the main bundle by vite.main.config.ts; absent under vitest, and without a commit in builds made without Git. */
declare const __PHASEO_BUILD__: { version?: string; commit?: string; dirty?: boolean; builtAt?: string } | undefined;

export const buildStamp: { version?: string; commit?: string; dirty?: boolean; builtAt?: string } = typeof __PHASEO_BUILD__ === "undefined" ? {} : __PHASEO_BUILD__;
