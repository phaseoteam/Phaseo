"use client";

import { useTranslations } from "next-intl";
import type { OAuthScopeOption } from "@/lib/oauth/scopes";
import { scopePermissionFor } from "./scopePermission";

export function useLocalizedOAuthScopes() {
	const t = useTranslations("Common.authFlows.oauthConsent");
	const resources = t.raw("resources" as never) as Record<string, string>;

	function getScopeCopy(scope: string) {
		const permission = scopePermissionFor(scope);
		if (permission.action === "identity") {
			return {
				label: t("identityPermissionLabel"),
				description: t("identityPermissionDescription"),
			};
		}
		if (permission.action === "gateway") {
			return {
				label: t("gatewayPermissionLabel"),
				description: t("gatewayPermissionDescription"),
			};
		}
		if (permission.action === "unknown" || !permission.resourceKey) {
			return {
				label: t("unknownPermissionLabel", { scope }),
				description: t("unknownPermissionDescription", { scope }),
			};
		}

		const resource = resources[permission.resourceKey] ?? permission.scope;
		if (permission.action === "read") {
			return {
				label: t("readPermissionLabel", { resource }),
				description: t("readPermissionDescription", { resource }),
			};
		}
		if (permission.action === "manage") {
			return {
				label: t("managePermissionLabel", { resource }),
				description: t("managePermissionDescription", { resource }),
			};
		}
		return {
			label: t("deletePermissionLabel", { resource }),
			description: t("deletePermissionDescription", { resource }),
		};
	}

	function getGroupLabel(group: OAuthScopeOption["group"]) {
		if (group === "Identity") return t("toneIdentity");
		if (group === "Access") return t("groups.gateway.title");
		if (group === "Read") return t("toneRead");
		if (group === "Write") return t("toneWrite");
		return t("toneDelete");
	}

	return { getGroupLabel, getScopeCopy };
}
