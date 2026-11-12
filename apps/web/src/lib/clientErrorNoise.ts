import type { ClientErrorPayload } from "@/lib/clientErrorReporting";

// Window errors and unhandled rejections that are not ours to fix. They are
// dropped before capture so PostHog (and the Linear issues filed from it)
// only show errors we can act on. Keep every entry narrow: an error raised by
// our own code must never match. Errors reported with `reportClientError`
// (source "manual") are always kept.

const EXTENSION_URL = /\b(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;
const WEB_URL = /\bhttps?:\/\//i;

type NoiseRule = {
	id: string;
	matches: (error: { message: string; stack: string; filename: string }) => boolean;
};

export const CLIENT_ERROR_NOISE_RULES: readonly NoiseRule[] = [
	{
		// Wallet extensions and wallet-aware browsers (for example Brave on
		// iOS) inject inline scripts that read or write `window.ethereum`. Our
		// web app has no wallet code, so nothing of ours touches that global.
		// Seen as: "undefined is not an object (evaluating
		// 'window.ethereum.selectedAddress = undefined')" (PHA-533).
		id: "wallet-ethereum-global",
		matches: ({ message }) => /\bethereum\b/i.test(message),
	},
	{
		// Browsers hide the details of errors thrown by cross-origin scripts
		// and report only "Script error." with no stack or file. Errors from
		// our own same-origin bundles always carry a message and source, so
		// a bare one has nothing to act on (PHA-534).
		id: "opaque-cross-origin-script-error",
		matches: ({ message, stack, filename }) =>
			/^script error\.?$/i.test(message.trim()) && !stack && !filename,
	},
	{
		// posthog-js's own transport abort when an analytics request takes
		// longer than its timeout. It says nothing about our app (PHA-545).
		id: "posthog-request-timeout",
		matches: ({ message }) => /^PostHog request timed out after \d+ms$/.test(message.trim()),
	},
	{
		// Errors thrown inside browser extensions. Only dropped when the file
		// is an extension URL, or the stack has extension frames and no web
		// (http/https) frames at all, so an error that passes through our
		// bundles is still reported.
		id: "browser-extension",
		matches: ({ stack, filename }) =>
			EXTENSION_URL.test(filename) ||
			(EXTENSION_URL.test(stack) && !WEB_URL.test(stack)),
	},
];

/** Returns the id of the matching noise rule, or null when the error should be captured. */
export function matchClientErrorNoise(payload: ClientErrorPayload): string | null {
	if (payload.source === "manual") return null;

	const filename = payload.context?.filename;
	const error = {
		message: payload.message ?? "",
		stack: payload.stack ?? "",
		filename: typeof filename === "string" ? filename : "",
	};
	return CLIENT_ERROR_NOISE_RULES.find((rule) => rule.matches(error))?.id ?? null;
}
