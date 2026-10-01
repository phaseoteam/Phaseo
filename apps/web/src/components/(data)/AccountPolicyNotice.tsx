import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldBan } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchSettingsPrivacyInitialData } from "@/lib/fetchers/internal/fetchSettingsPrivacyInitialData";

function isBlocked(mode: string | null | undefined, selected: string[], id: string) {
	return mode === "blocklist"
		? selected.includes(id)
		: mode === "allowlist" && !selected.includes(id);
}

export default async function AccountPolicyNotice({ kind, id }: { kind: "model" | "provider"; id: string }) {
	const t = await getTranslations("SettingsUI");
	const workspaceData = await fetchSettingsPrivacyInitialData().catch(() => null);
	const workspaceRestriction = kind === "model"
		? { mode: workspaceData?.initialGlobal?.model_restriction_mode, selected: workspaceData?.initialGlobal?.model_restriction_model_ids ?? [] }
		: { mode: workspaceData?.initialGlobal?.provider_restriction_mode, selected: workspaceData?.initialGlobal?.provider_restriction_provider_ids ?? [] };
	const workspaceBlocked = isBlocked(workspaceRestriction.mode, workspaceRestriction.selected, id);
	if (!workspaceBlocked) return null;
	return <Alert className="mb-6 border-destructive/40 bg-destructive/5">
		<ShieldBan className="size-4 text-destructive" />
		<AlertTitle>{t("policyNoticeCopy.blockedByWorkspacePrivacy")}</AlertTitle>
		<AlertDescription>
			{kind === "model"
				? t("policyNoticeCopy.modelBlocked")
				: t("policyNoticeCopy.providerBlocked")} {" "}
			<Link href="/settings/privacy" className="font-medium text-foreground underline underline-offset-4">
				{t("policyNoticeCopy.reviewPrivacy")}
			</Link>
		</AlertDescription>
	</Alert>;
}
