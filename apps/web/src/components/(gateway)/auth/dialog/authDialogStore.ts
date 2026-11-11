// State for the site-wide auth dialog (AuthDialog in RootDocument), which hosts the
// whole sign-in flow: sign in, sign up, enterprise SSO, the two-factor code, setting a
// new password after a reset email, and auth errors.
//
// A module store rather than context, so non-React callers (server-action results,
// toasts) can open it with `openAuthDialog`. Server redirects and emails open it with
// `?auth=<step>` on any page; the old auth URLs (/sign-in, /error, /auth/verify-mfa, ...)
// redirect to the home page with that parameter (see authDialogRedirect.ts).
import { useSyncExternalStore } from "react";
import { publicLocales } from "@/i18n/routing";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";

export const AUTH_DIALOG_STEPS = ["sign-in", "sign-up", "sso", "mfa", "reset"] as const;
export type AuthDialogStep = (typeof AUTH_DIALOG_STEPS)[number];

/** Shown at the top of the sign-in view, as on /sign-in?signup=check-email or ?error=auth-failed. */
export type AuthDialogNotice = "check-email" | "auth-failed";

export type AuthDialogState = {
	open: boolean;
	step: AuthDialogStep;
	/** Where to land after signing in; undefined means the home page. */
	returnUrl?: string;
	notice?: AuthDialogNotice;
	/** An auth error to show above the sign-in form (an AuthErrorCode, from /error?code=). */
	errorCode?: string;
	/** The legacy /error?message= form of an error. */
	errorMessage?: string;
};

export type OpenAuthDialogOptions = Omit<Partial<AuthDialogState>, "open">;

/** Query parameters that describe the dialog; removed from the URL when it closes. */
export const AUTH_DIALOG_PARAMS = ["auth", "returnUrl", "notice", "code", "message"] as const;

let state: AuthDialogState = { open: false, step: "sign-in" };
const listeners = new Set<() => void>();

function setState(next: AuthDialogState) {
	state = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export const getAuthDialogState = () => state;
const CLOSED: AuthDialogState = { open: false, step: "sign-in" };
const getServerSnapshot = () => CLOSED;

export function useAuthDialogState(): AuthDialogState {
	return useSyncExternalStore(subscribe, getAuthDialogState, getServerSnapshot);
}

/** The current page without the dialog's own parameters, as a return URL (undefined for the home page). */
export function currentReturnUrl(): string | undefined {
	if (typeof window === "undefined") return undefined;
	const url = new URL(window.location.href);
	if (url.searchParams.has("auth")) for (const key of AUTH_DIALOG_PARAMS) url.searchParams.delete(key);
	return sanitizeOrUndefined(`${url.pathname}${url.search}`);
}

export function openAuthDialog(options: OpenAuthDialogOptions = {}) {
	const returnUrl = options.returnUrl === undefined ? currentReturnUrl() : sanitizeOrUndefined(options.returnUrl);
	setState({
		open: true,
		step: options.step ?? "sign-in",
		returnUrl,
		notice: options.notice,
		errorCode: options.errorCode,
		errorMessage: options.errorMessage,
	});
}

export function closeAuthDialog() {
	if (state.open) setState({ ...state, open: false });
}

function sanitizeOrUndefined(value: string): string | undefined {
	const safe = sanitizeReturnUrl(value, "/");
	return safe === "/" ? undefined : safe;
}

function stripLocale(pathname: string): string {
	const [first = ""] = pathname.slice(1).split("/", 1);
	const isLocale = publicLocales.some((locale) => locale.toLowerCase() === first.toLowerCase());
	return isLocale ? pathname.slice(first.length + 1) || "/" : pathname;
}

function normalisePath(pathname: string): string {
	const stripped = stripLocale(pathname);
	return stripped.length > 1 ? stripped.replace(/\/+$/, "") : stripped;
}

/** Pages where sign-in links keep navigating: the pages that still render auth UI of their own. */
export function isAuthPagePath(pathname: string): boolean {
	const path = normalisePath(pathname);
	return /^\/(?:sign-in|sign-up|auth|error|oauth|activate)(?:\/|$)/.test(path);
}

const LINK_STEPS: Record<string, AuthDialogStep> = {
	"/sign-in": "sign-in",
	"/sign-up": "sign-up",
	"/sign-in/enterprise": "sso",
};

/**
 * The dialog a link should open instead of navigating, or null to let it navigate.
 * Only /sign-in, /sign-up and /sign-in/enterprise (any locale prefix) qualify.
 */
export function authDialogTargetFromHref(href: string, origin: string): OpenAuthDialogOptions | null {
	let url: URL;
	try {
		url = new URL(href, origin);
	} catch {
		return null;
	}
	if (url.origin !== origin) return null;
	const step = LINK_STEPS[normalisePath(url.pathname)];
	if (!step) return null;
	const returnUrl = url.searchParams.get("returnUrl");
	return returnUrl ? { step, returnUrl } : { step };
}

/** The dialog described by a page's `?auth=` parameters, or null when there is none. */
export function authDialogTargetFromSearch(search: string): OpenAuthDialogOptions | null {
	const params = new URLSearchParams(search);
	const auth = params.get("auth");
	if (!auth) return null;
	const options: OpenAuthDialogOptions = {};
	if (auth === "error") {
		options.step = "sign-in";
		options.errorCode = params.get("code") ?? "default";
		const message = params.get("message");
		if (message) options.errorMessage = message;
	} else if ((AUTH_DIALOG_STEPS as readonly string[]).includes(auth)) {
		options.step = auth as AuthDialogStep;
	} else {
		return null;
	}
	const notice = params.get("notice");
	if (notice === "check-email" || notice === "auth-failed") options.notice = notice;
	// Never fall back to the current page here: that is the page carrying ?auth= itself.
	options.returnUrl = params.get("returnUrl") ?? "/";
	return options;
}

/** The current URL without the dialog's parameters (and the error hash), or null when it has none. */
export function urlWithoutAuthParams(href: string): string | null {
	const url = new URL(href);
	if (!url.searchParams.has("auth")) return null;
	for (const key of AUTH_DIALOG_PARAMS) url.searchParams.delete(key);
	url.hash = "";
	return `${url.pathname}${url.search}`;
}
