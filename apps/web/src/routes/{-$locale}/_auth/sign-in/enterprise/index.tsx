// Enterprise SSO is a step of the site-wide auth dialog: this URL opens it over the
// home page (plain sign-in when SAML SSO is switched off).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authDialogHref, searchValue } from "@/lib/auth/authDialogRedirect";
import { samlSsoEnabledQuery } from "@/features/sign-in/SignInPage.functions";

export const Route = createFileRoute("/{-$locale}/_auth/sign-in/enterprise/")({
	beforeLoad: async ({ context, params, search }) => {
		const ssoEnabled = await context.queryClient.ensureQueryData(samlSsoEnabledQuery());
		const input = { params, search: search as Record<string, unknown> };
		throw redirect({
			href: authDialogHref(input, {
				auth: ssoEnabled ? "sso" : "sign-in",
				returnUrl: searchValue(input.search, "returnUrl"),
			}),
			statusCode: 307,
		});
	},
});
