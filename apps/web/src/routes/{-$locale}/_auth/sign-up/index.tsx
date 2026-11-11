// Sign-up is a step of the site-wide auth dialog: this URL opens it over the home page.
import { createFileRoute } from "@tanstack/react-router";
import { redirectToAuthDialog, searchValue } from "@/lib/auth/authDialogRedirect";

export const Route = createFileRoute("/{-$locale}/_auth/sign-up/")({
	beforeLoad: redirectToAuthDialog((search) => ({
		auth: "sign-up",
		returnUrl: searchValue(search, "returnUrl"),
	})),
});
