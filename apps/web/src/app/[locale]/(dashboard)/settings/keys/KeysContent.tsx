"use client";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getLocalizedDocsHref } from "@/lib/docs";
import { ArrowUpRight } from "lucide-react";
import CreateKeyDialog from "@/components/(gateway)/settings/keys/CreateKeyDialog";
import KeysPanel from "@/components/(gateway)/settings/keys/KeysPanel";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsKeysInitialData } from "@/lib/fetchers/internal/settingsTypes";

const QUICKSTART_DOCS_HREF = "https://phaseo.app/docs/v1/quickstart";

export default withSettingsResource("keys", function KeysContent({ initialData }: { initialData: SettingsKeysInitialData }) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const {
		currentUserId,
		initialWorkspaceId,
		teamsWithKeys,
		workspaces,
	} = initialData;

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("headers.apiKeys")}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link
								href={getLocalizedDocsHref(locale, QUICKSTART_DOCS_HREF)}
								target="_blank"
								rel="noreferrer"
							>
								{t("settingsPageCopy.quickStart")}
								<ArrowUpRight className="ml-1 h-4 w-4" />
							</Link>
						</Button>
						<CreateKeyDialog
							currentUserId={currentUserId}
							currentWorkspaceId={initialWorkspaceId}
							workspaces={workspaces}
						/>
					</div>
				}
			/>
			<KeysPanel
				teamsWithKeys={teamsWithKeys}
				initialTeamId={initialWorkspaceId}
				currentUserId={currentUserId}
			/>
		</div>
	);
});
