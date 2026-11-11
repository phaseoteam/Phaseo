// Auth errors (OAuth and SSO callbacks, failed workspace setup) show in the site-wide
// auth dialog: this URL opens it over the home page. A Supabase error hash survives
// the redirect and is read by AuthErrorMessage.
import { createFileRoute } from "@tanstack/react-router";
import { redirectToAuthDialog, searchValue } from "@/lib/auth/authDialogRedirect";

export const Route = createFileRoute("/{-$locale}/_auth/error/")({
	beforeLoad: redirectToAuthDialog((search) => ({
		auth: "error",
		code: searchValue(search, "code"),
		message: searchValue(search, "message"),
	})),
});
