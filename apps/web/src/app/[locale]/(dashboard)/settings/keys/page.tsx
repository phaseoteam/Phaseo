import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import CreateKeyDialog from "@/components/(gateway)/settings/keys/CreateKeyDialog";
import KeysPanel from "@/components/(gateway)/settings/keys/KeysPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import { fetchSettingsKeysInitialData } from "@/lib/fetchers/internal/fetchSettingsKeysInitialData";
import { getLocale, getTranslations } from "next-intl/server";
import { getLocalizedDocsHref } from "@/lib/docs";

const QUICKSTART_DOCS_HREF = "https://phaseo.app/docs/v1/quickstart";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: t("headers.apiKeys") + " - " + t("headers.settings") };
}

export default function KeysPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<KeysContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function KeysContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
const [sp, t, locale] = await Promise.all([
		searchParams,
		getTranslations("SettingsUI"),
		getLocale(),
	]);
	const preferredWorkspaceId =
		typeof sp?.workspace_id === "string"
			? sp.workspace_id
			: Array.isArray(sp?.workspace_id)
				? sp?.workspace_id?.[0]
				: undefined;
	const {
		currentUserId,
		initialWorkspaceId,
		teamsWithKeys,
		workspaces,
	} = await fetchSettingsKeysInitialData(preferredWorkspaceId);

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="API Keys"
				titleKey="headers.apiKeys"
				description="Create and manage gateway API keys for this workspace."
				descriptionKey="headers.apiKeysDescription"
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
}
