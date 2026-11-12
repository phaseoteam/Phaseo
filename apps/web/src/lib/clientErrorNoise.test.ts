import { describe, it, expect } from "vitest";
import type { ClientErrorPayload } from "@/lib/clientErrorReporting";
import { matchClientErrorNoise } from "./clientErrorNoise";

const OWN_FRAME = "https://phaseo.app/assets/router-Dpty0Bl7.js:1:120";

function windowError(overrides: Partial<ClientErrorPayload> & { filename?: string | null } = {}): ClientErrorPayload {
	const { filename = null, ...rest } = overrides;
	return {
		source: "window.error",
		message: "Unhandled client error",
		stack: null,
		fatal: true,
		handled: false,
		context: { filename, lineno: null, colno: null },
		...rest,
	};
}

function rejection(message: string, stack: string | null = null): ClientErrorPayload {
	return { source: "window.unhandledrejection", message, stack, fatal: false, handled: false };
}

describe("matchClientErrorNoise", () => {
	describe("drops third-party noise", () => {
		it("wallet writes to window.ethereum (PHA-533)", () => {
			expect(matchClientErrorNoise(windowError({
				message: "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
				stack: "global code@https://phaseo.app/en-US/models/google/translategemma-27b:1:1",
				filename: "https://phaseo.app/en-US/models/google/translategemma-27b",
			}))).toBe("wallet-ethereum-global");
			expect(matchClientErrorNoise(windowError({
				message: "Cannot redefine property: ethereum",
			}))).toBe("wallet-ethereum-global");
		});

		it("a bare cross-origin \"Script error.\" (PHA-534)", () => {
			expect(matchClientErrorNoise(windowError({ message: "Script error." }))).toBe("opaque-cross-origin-script-error");
			expect(matchClientErrorNoise(windowError({ message: "Script error", filename: "" }))).toBe("opaque-cross-origin-script-error");
		});

		it("posthog-js request timeouts (PHA-545)", () => {
			expect(matchClientErrorNoise(rejection(
				"PostHog request timed out after 3000ms",
				`AbortError: PostHog request timed out after 3000ms\n    at ${OWN_FRAME}`,
			))).toBe("posthog-request-timeout");
		});

		it.each([
			"chrome-extension://abcdefghijklmnop/content.js",
			"moz-extension://1234-5678/inject.js",
			"safari-extension://com.example.ext/script.js",
			"safari-web-extension://ABCD/content.js",
		])("errors thrown from an extension file (%s)", (filename) => {
			expect(matchClientErrorNoise(windowError({
				message: "Cannot read properties of null (reading 'shadowRoot')",
				filename,
			}))).toBe("browser-extension");
		});

		it("rejections whose stack only has extension frames", () => {
			expect(matchClientErrorNoise(rejection(
				"Extension context invalidated.",
				"Error: Extension context invalidated.\n    at chrome-extension://abc/background.js:4:11\n    at chrome-extension://abc/content.js:9:2",
			))).toBe("browser-extension");
			expect(matchClientErrorNoise(rejection(
				"Could not establish connection",
				"sendMessage@moz-extension://1234/inject.js:2:5",
			))).toBe("browser-extension");
		});
	});

	describe("keeps errors from our own code", () => {
		it("ordinary window errors from our bundles", () => {
			expect(matchClientErrorNoise(windowError({
				message: "AbortSignal.any is not a function. (In 'AbortSignal.any([t.signal,r])', 'AbortSignal.any' is undefined)",
				stack: `a@${OWN_FRAME}`,
				filename: "https://phaseo.app/assets/router-Dpty0Bl7.js",
			}))).toBeNull();
		});

		it("a stack that passes through an extension and our bundles", () => {
			expect(matchClientErrorNoise(rejection(
				"Failed to fetch",
				`TypeError: Failed to fetch\n    at chrome-extension://abc/hook.js:1:10\n    at ${OWN_FRAME}`,
			))).toBeNull();
		});

		it("\"Script error.\" that still has a source or stack", () => {
			expect(matchClientErrorNoise(windowError({
				message: "Script error.",
				filename: "https://phaseo.app/assets/index-Caq45TiO.js",
			}))).toBeNull();
			expect(matchClientErrorNoise(windowError({ message: "Script error.", stack: `x@${OWN_FRAME}` }))).toBeNull();
		});

		it("our own request timeouts and other timeouts", () => {
			expect(matchClientErrorNoise(rejection("The operation was aborted due to timeout"))).toBeNull();
			expect(matchClientErrorNoise(rejection("Request timed out after 3000ms"))).toBeNull();
		});

		it("errors reported manually, whatever they say", () => {
			expect(matchClientErrorNoise({
				source: "manual",
				message: "Script error.",
				context: { filename: "chrome-extension://abc/content.js" },
			})).toBeNull();
		});
	});
});
