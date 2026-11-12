// The two-factor code is a step of the site-wide auth dialog: this URL opens it over the
// home page. The session middleware still sends every gated page here until the code is
// entered (lib/start/session.ts); the home page is not gated, so this cannot loop.
import { createFileRoute } from "@tanstack/react-router";
import { redirectToAuthDialog, searchValue } from "@/lib/auth/authDialogRedirect";

export const Route = createFileRoute("/{-$locale}/_auth/auth/verify-mfa/")({
	beforeLoad: redirectToAuthDialog((search) => ({
		auth: "mfa",
		returnUrl: searchValue(search, "returnUrl"),
	})),
});
