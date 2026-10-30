// IDs/hosts are shared by both server and client code. They stay undefined when
// not configured so we can safely skip init in local/dev.
export const GA_MEASUREMENT_ID =
	process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-BG2L1NPYGL";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Do NOT fall back to POSTHOG_HOST here.
export const POSTHOG_API_HOST =
	process.env.NEXT_PUBLIC_POSTHOG_API_HOST ?? "/ingest";

export const POSTHOG_UI_HOST =
	process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://eu.posthog.com";
