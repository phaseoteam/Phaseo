// The whole sign-in flow in a dialog over the current page: sign in, sign up,
// enterprise SSO, the two-factor code, a new password after a reset email, and errors.
//
// - Every link to /sign-in, /sign-up or /sign-in/enterprise (any locale prefix) opens
//   the dialog on a plain click, so no link site needs a change. Modified clicks
//   (new tab), target=_blank, downloads and links inside `data-auth-page` navigate.
// - `?auth=<step>` on any page opens it too. Server redirects, emails, OAuth and SSO
//   callbacks reach it that way: the old auth URLs redirect to the home page with that
//   parameter (lib/auth/authDialogRedirect.ts). Closing the dialog removes it.
// - After signing in the browser loads the return URL: the page the dialog was opened
//   on, unless the link or redirect named one.
// - Only the Google / GitHub / GitLab / SAML provider pages and the emails themselves
//   are outside the dialog.
// - The dialog UI loads on first open, so pages that never show it do not pay for it.
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import {
	authDialogTargetFromHref,
	authDialogTargetFromSearch,
	closeAuthDialog,
	isAuthPagePath,
	openAuthDialog,
	urlWithoutAuthParams,
	useAuthDialogState,
} from "./authDialogStore";

const loadContent = () => import("./AuthDialogContent");
const AuthDialogContent = lazy(loadContent);

/** Opens the dialog for plain clicks on sign-in / sign-up links. Exported for tests. */
export function handleAuthLinkClick(event: MouseEvent) {
	if (event.defaultPrevented) return;
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
	if (!anchor) return;
	if (anchor.target && anchor.target !== "_self") return;
	if (anchor.hasAttribute("download")) return;
	if (anchor.closest("[data-auth-page]")) return;
	if (isAuthPagePath(window.location.pathname)) return;
	const target = authDialogTargetFromHref(anchor.getAttribute("href") ?? "", window.location.origin);
	if (!target) return;
	// The app's Link skips client navigation when the click is already handled.
	event.preventDefault();
	openAuthDialog(target);
}

export function AuthDialog() {
	const state = useAuthDialogState();
	const router = useRouter();
	const { pathname, searchStr } = useLocation();
	const [contentRequested, setContentRequested] = useState(false);

	// Capture phase so this runs before the Link's own click handler.
	useEffect(() => {
		window.addEventListener("click", handleAuthLinkClick, true);
		return () => window.removeEventListener("click", handleAuthLinkClick, true);
	}, []);

	// Any navigation (a link in the dialog's copy, a redirect) closes it ...
	useEffect(() => {
		closeAuthDialog();
	}, [pathname]);

	// ... unless the new URL asks for it.
	useEffect(() => {
		const target = authDialogTargetFromSearch(searchStr);
		if (target) openAuthDialog(target);
	}, [pathname, searchStr]);

	const onOpenChange = (open: boolean) => {
		if (open) return;
		closeAuthDialog();
		const cleaned = urlWithoutAuthParams(window.location.href);
		if (cleaned) void router.navigate({ href: cleaned, replace: true, resetScroll: false });
	};

	if (state.open && !contentRequested) setContentRequested(true);
	if (!contentRequested) return null;

	return (
		<Suspense fallback={null}>
			<AuthDialogContent state={state} onOpenChange={onOpenChange} />
		</Suspense>
	);
}

export default AuthDialog;
