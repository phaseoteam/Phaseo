// Sign-in is a step of the site-wide auth dialog: this URL opens it over the home page.
import { createFileRoute } from "@tanstack/react-router";
import { redirectToAuthDialog, searchValue } from "@/lib/auth/authDialogRedirect";

export const Route = createFileRoute("/{-$locale}/_auth/sign-in/")({
	beforeLoad: redirectToAuthDialog((search) => {
		const signup = searchValue(search, "signup");
		const error = searchValue(search, "error");
		return {
			auth: "sign-in",
			returnUrl: searchValue(search, "returnUrl"),
			notice:
				signup === "exists" || signup === "check-email"
					? "check-email"
					: error === "auth-failed"
						? "auth-failed"
						: undefined,
		};
	}),
});
