"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import CreateKeyDialog from "@/components/(gateway)/settings/keys/CreateKeyDialog";
import KeysPanel from "@/components/(gateway)/settings/keys/KeysPanel";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsKeysInitialData } from "@/lib/fetchers/internal/settingsTypes";

const QUICKSTART_DOCS_HREF = "https://phaseo.app/docs/v1/quickstart";

export default withSettingsResource("keys", function KeysContent({ initialData }: { initialData: SettingsKeysInitialData }) {
	const {
		currentUserId,
		initialWorkspaceId,
		teamsWithKeys,
		workspaces,
	} = initialData;

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="API Keys"
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link
								href={QUICKSTART_DOCS_HREF}
								target="_blank"
								rel="noreferrer"
							>
								Quick Start
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
