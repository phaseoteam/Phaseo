import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n/react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountPrivacySettingsClient from "@/components/(gateway)/settings/account/AccountPrivacySettingsClient";
import { DataContributionSettingsCard } from "@/components/(gateway)/settings/privacy/DataContributionSettingsCard";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsPrivacyInitialData } from "@/lib/fetchers/internal/settingsTypes";


export default function PrivacySettingsPage() {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("headers.privacy")}
				description={t("strings.phraseSetTheMinimumPrivacyStandardForEveryRequestInThisWorkspace")}
				actions={<Button asChild variant="outline"><Link href="/settings/routing/access">{t("strings.Route Access")}</Link></Button>}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<PrivacySettingsContent />
			</Suspense>
		</div>
	);
}

const PrivacySettingsContent = withSettingsResource("privacy", function PrivacySettingsContent({ initialData }: { initialData: SettingsPrivacyInitialData }) {
	const t = useTranslations("SettingsUI");

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("settingsPageCopy.privacyWorkspace")}
			</div>
		);
	}

	return (
		<div className="space-y-8">
		<AccountPrivacySettingsClient
			key={initialData.workspaceId}
			canManage={initialData.canManage}
			policy={initialData.policy}
			providers={initialData.providers}
			models={initialData.models}
			workspaceId={initialData.workspaceId}
			workspaceLogStorage={{
				enabled: initialData.initialGlobal?.io_logging_enabled === true,
				retentionDays: Math.max(90, Math.min(365, Number(initialData.initialGlobal?.io_logging_retention_days ?? 90))),
				includeProviderPayloads: initialData.initialGlobal?.io_logging_include_provider_payloads !== false,
				contentsAccess: !initialData.initialGlobal ? "members" : initialData.initialGlobal.io_logging_contents_access ?? null,
			}}
		/>
		{initialData.dataContribution.available ? (
			<DataContributionSettingsCard initial={initialData.dataContribution} />
		) : null}
		</div>
	);
});
