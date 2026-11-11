/** @vitest-environment jsdom */
// While a provider's page loads: the clicked button spins, the rest lock, a status line
// says what is happening, and it unlocks on "Try again" or when Back restores the page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const handleOAuthRedirect = vi.fn();
vi.mock("@/features/sign-in/actions", () => ({ handleOAuthRedirect: (...args: unknown[]) => handleOAuthRedirect(...args) }));
vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string, values?: { provider?: string }) => (values?.provider ? `${key}:${values.provider}` : key),
}));
vi.mock("@/components/Logo", () => ({ Logo: () => <span data-logo /> }));
vi.mock("@/components/image", () => ({ default: () => <span data-image /> }));

import OAuthButtons, { OAUTH_SLOW_AFTER_MS } from "./OAuthButtons";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const onRedirectingChange = vi.fn();
const onStart = vi.fn();

const button = (provider: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="providerContinue:${provider}"]`)!;
const status = () => container.querySelector('[role="status"]:not([data-slot])')!.textContent;

beforeEach(async () => {
	vi.useFakeTimers();
	handleOAuthRedirect.mockReset().mockReturnValue(new Promise(() => {})); // the page is unloading
	onRedirectingChange.mockReset();
	onStart.mockReset();
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => {
		root.render(<OAuthButtons flow="signup" onStart={onStart} onRedirectingChange={onRedirectingChange} />);
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

describe("OAuthButtons redirect state", () => {
	it("locks the others and says which provider is opening", async () => {
		await act(async () => button("Google").click());

		expect(handleOAuthRedirect).toHaveBeenCalledTimes(1);
		const { data } = handleOAuthRedirect.mock.calls[0][0] as { data: FormData };
		expect(data.get("provider")).toBe("google");
		expect(data.get("authFlow")).toBe("signup");
		expect(onStart).toHaveBeenCalledWith("google");
		expect(onRedirectingChange).toHaveBeenLastCalledWith(true);
		expect(button("Google").disabled).toBe(false); // keeps focus
		expect(button("Google").getAttribute("aria-disabled")).toBe("true");
		expect(button("GitHub").disabled).toBe(true);
		expect(button("GitLab").disabled).toBe(true);
		expect(status()).toBe("providerOpening:Google…");

		// A second click doesn't start another attempt.
		await act(async () => button("Google").click());
		expect(handleOAuthRedirect).toHaveBeenCalledTimes(1);
	});

	it("says it is still waiting after a while, and Try again unlocks everything", async () => {
		await act(async () => button("GitHub").click());
		await act(async () => vi.advanceTimersByTime(OAUTH_SLOW_AFTER_MS - 1));
		expect(status()).toBe("providerOpening:GitHub…");
		await act(async () => vi.advanceTimersByTime(1));
		expect(status()).toBe("providerSlow:GitHubproviderRetry");

		const stop = vi.spyOn(window, "stop").mockImplementation(() => {});
		const signal = (handleOAuthRedirect.mock.calls[0][0] as { signal: AbortSignal }).signal;
		const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "providerRetry")!;
		await act(async () => retry.click());

		expect(stop).toHaveBeenCalled();
		expect(signal.aborted).toBe(true);
		expect(onRedirectingChange).toHaveBeenLastCalledWith(false);
		expect(button("GitHub").disabled).toBe(false);
		expect(button("Google").disabled).toBe(false);
		expect(status()).toBe("");

		await act(async () => button("Google").click());
		expect(handleOAuthRedirect).toHaveBeenCalledTimes(2);
	});

	it("offers Try again straight away when the request fails", async () => {
		handleOAuthRedirect.mockReturnValue(Promise.reject(new Error("offline")));
		await act(async () => button("GitLab").click());
		expect(status()).toBe("providerSlow:GitLabproviderRetry");
	});

	it("unlocks when Back restores the page from the back/forward cache", async () => {
		await act(async () => button("Google").click());
		const event = new Event("pageshow") as PageTransitionEvent;
		Object.defineProperty(event, "persisted", { value: true });
		await act(async () => window.dispatchEvent(event));

		expect(onRedirectingChange).toHaveBeenLastCalledWith(false);
		expect(button("GitHub").disabled).toBe(false);
		expect(status()).toBe("");
	});
});
