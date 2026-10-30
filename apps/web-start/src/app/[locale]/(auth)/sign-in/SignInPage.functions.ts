import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/** SAML SSO availability is a flag (@/lib/flags), read on the server. */
export const getSamlSsoEnabled = createServerFn({ method: "GET" }).handler(async () => {
	const { samlSsoFlag } = await import("@/lib/flags");
	return samlSsoFlag();
});

export const samlSsoEnabledQuery = () =>
	queryOptions({
		queryKey: ["flags", "saml-sso"],
		queryFn: () => getSamlSsoEnabled(),
	});
