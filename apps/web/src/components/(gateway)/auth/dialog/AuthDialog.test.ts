/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authDialogHref } from "@/lib/auth/authDialogRedirect";
import { handleAuthLinkClick } from "./AuthDialog";
import {
	authDialogTargetFromHref,
	authDialogTargetFromSearch,
	closeAuthDialog,
	currentReturnUrl,
	getAuthDialogState,
	isAuthPagePath,
	openAuthDialog,
} from "./authDialogStore";

const ORIGIN = window.location.origin;

describe("authDialogTargetFromHref", () => {
	it("matches sign-in, sign-up and enterprise SSO, with or without a locale prefix", () => {
		expect(authDialogTargetFromHref("/sign-in", ORIGIN)).toEqual({ step: "sign-in" });
		expect(authDialogTargetFromHref("/sign-up/", ORIGIN)).toEqual({ step: "sign-up" });
		expect(authDialogTargetFromHref("/de-DE/sign-up", ORIGIN)).toEqual({ step: "sign-up" });
		expect(authDialogTargetFromHref("/sign-in/enterprise?returnUrl=%2Fx", ORIGIN)).toEqual({ step: "sso", returnUrl: "/x" });
		expect(authDialogTargetFromHref(`${ORIGIN}/sign-in`, ORIGIN)).toEqual({ step: "sign-in" });
	});

	it("keeps the link's returnUrl", () => {
		expect(authDialogTargetFromHref("/sign-up?returnUrl=%2Fchat%3Fid%3D1", ORIGIN)).toEqual({
			step: "sign-up",
			returnUrl: "/chat?id=1",
		});
	});

	it("ignores other pages and other origins", () => {
		expect(authDialogTargetFromHref("/sign-input", ORIGIN)).toBeNull();
		expect(authDialogTargetFromHref("/models", ORIGIN)).toBeNull();
		expect(authDialogTargetFromHref("https://example.com/sign-in", ORIGIN)).toBeNull();
	});
});

describe("authDialogTargetFromSearch", () => {
	it("reads the step, notice and return URL", () => {
		expect(authDialogTargetFromSearch("?auth=mfa&returnUrl=%2Fsettings")).toEqual({ step: "mfa", returnUrl: "/settings" });
		expect(authDialogTargetFromSearch("?auth=sign-in&notice=check-email")).toEqual({
			step: "sign-in",
			notice: "check-email",
			returnUrl: "/",
		});
	});

	it("turns errors into the sign-in step with the error code", () => {
		expect(authDialogTargetFromSearch("?auth=error&code=expired-link")).toEqual({
			step: "sign-in",
			errorCode: "expired-link",
			returnUrl: "/",
		});
		expect(authDialogTargetFromSearch("?auth=error")).toMatchObject({ errorCode: "default" });
		// The legacy message-only form keeps its message, so the matching guidance shows instead of the default.
		const legacy = authDialogTargetFromSearch("?auth=error&message=Sign-in%20was%20cancelled");
		expect(legacy).toMatchObject({ errorMessage: "Sign-in was cancelled" });
		expect(legacy?.errorCode).toBeUndefined();
	});

	it("ignores pages without a known step", () => {
		expect(authDialogTargetFromSearch("")).toBeNull();
		expect(authDialogTargetFromSearch("?tab=pricing")).toBeNull();
		expect(authDialogTargetFromSearch("?auth=admin")).toBeNull();
		expect(authDialogTargetFromSearch("?auth=sign-in&notice=<script>")).toEqual({ step: "sign-in", returnUrl: "/" });
	});
});

describe("authDialogHref", () => {
	it("builds the home page in the route's locale with the dialog parameters", () => {
		expect(authDialogHref({ params: {}, search: {} }, { auth: "sign-in", returnUrl: "/settings/keys" })).toBe(
			"/?auth=sign-in&returnUrl=%2Fsettings%2Fkeys",
		);
		expect(authDialogHref({ params: { locale: "de-DE" }, search: {} }, { auth: "sign-up" })).toBe("/de-DE?auth=sign-up");
		expect(authDialogHref({ params: { locale: "en-GB" }, search: {} }, { auth: "sign-up" })).toBe("/?auth=sign-up");
	});

	it("takes the locale from ?locale= on technical routes and ignores unknown locales", () => {
		expect(authDialogHref({ params: {}, search: { locale: "ja" } }, { auth: "mfa" })).toBe("/ja?auth=mfa");
		expect(authDialogHref({ params: {}, search: { locale: "xx" } }, { auth: "mfa" })).toBe("/?auth=mfa");
	});

	it("forwards a client-side hash (Supabase error details)", () => {
		expect(authDialogHref({ params: {}, search: {}, location: { hash: "error=access_denied" } }, { auth: "error", code: "default" })).toBe(
			"/?auth=error&code=default#error=access_denied",
		);
		expect(authDialogHref({ params: {}, search: {}, location: { hash: "" } }, { auth: "error" })).toBe("/?auth=error");
	});
});

describe("isAuthPagePath", () => {
	it("recognises pages that render auth UI of their own", () => {
		for (const path of ["/sign-in", "/ja/sign-up", "/auth/reset-password", "/error", "/oauth/consent", "/activate"]) {
			expect(isAuthPagePath(path)).toBe(true);
		}
		for (const path of ["/", "/models", "/de-DE/chat", "/errors-and-limits"]) {
			expect(isAuthPagePath(path)).toBe(false);
		}
	});
});

describe("return URLs", () => {
	afterEach(() => closeAuthDialog());

	it("drops return URLs that point at auth pages or off-site", () => {
		openAuthDialog({ step: "sign-in", returnUrl: "//evil.example" });
		expect(getAuthDialogState().returnUrl).toBeUndefined();
		openAuthDialog({ step: "sign-in", returnUrl: "/sign-up" });
		expect(getAuthDialogState().returnUrl).toBeUndefined();
		openAuthDialog({ step: "sign-in", returnUrl: "/settings/keys", notice: "auth-failed" });
		expect(getAuthDialogState()).toMatchObject({ returnUrl: "/settings/keys", notice: "auth-failed" });
	});

	it("leaves the dialog's own parameters out of the current page", () => {
		window.history.replaceState(null, "", "/models?tab=pricing&auth=sign-in&returnUrl=%2Fx");
		expect(currentReturnUrl()).toBe("/models?tab=pricing");
		window.history.replaceState(null, "", "/models?returnUrl=%2Fx");
		expect(currentReturnUrl()).toBe("/models?returnUrl=%2Fx");
	});

});

describe("handleAuthLinkClick", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		window.history.replaceState(null, "", "/models/acme/rocket-2?tab=pricing");
		window.addEventListener("click", handleAuthLinkClick, true);
	});

	afterEach(() => {
		window.removeEventListener("click", handleAuthLinkClick, true);
		container.remove();
		closeAuthDialog();
	});

	function link(html: string): HTMLElement {
		container.innerHTML = html;
		return container.querySelector("[data-test]") as HTMLElement;
	}

	function click(element: HTMLElement, init: MouseEventInit = {}) {
		const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
		// Record whether the handler took the click, then cancel it so jsdom does not try to navigate.
		let defaultPrevented = false;
		const settle = (e: Event) => {
			defaultPrevented = e.defaultPrevented;
			e.preventDefault();
		};
		window.addEventListener("click", settle);
		element.dispatchEvent(event);
		window.removeEventListener("click", settle);
		return { defaultPrevented };
	}

	it("opens the dialog on a plain click and returns to the current page", () => {
		const event = click(link(`<a href="/sign-up"><span data-test>Sign up</span></a>`));
		expect(event.defaultPrevented).toBe(true);
		expect(getAuthDialogState()).toMatchObject({
			open: true,
			step: "sign-up",
			returnUrl: "/models/acme/rocket-2?tab=pricing",
		});
	});

	it("leaves modified clicks, new-tab links and opted-out links alone", () => {
		expect(click(link(`<a data-test href="/sign-in">x</a>`), { metaKey: true }).defaultPrevented).toBe(false);
		expect(click(link(`<a data-test href="/sign-in" target="_blank">x</a>`)).defaultPrevented).toBe(false);
		expect(click(link(`<div data-auth-page><a data-test href="/sign-in">x</a></div>`)).defaultPrevented).toBe(false);
		expect(getAuthDialogState().open).toBe(false);
	});

	it("navigates normally on pages with auth UI of their own", () => {
		window.history.replaceState(null, "", "/oauth/consent");
		expect(click(link(`<a data-test href="/sign-up">x</a>`)).defaultPrevented).toBe(false);
	});
});
