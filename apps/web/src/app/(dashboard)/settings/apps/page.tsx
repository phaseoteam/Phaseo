import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import AppsPanel from "@/components/(gateway)/settings/apps/AppsPanel";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

const ATTRIBUTION_DOCS_HREF =
	"https://docs.ai-stats.phaseo.app/v1/guides/app-attribution";

export const metadata = {
	title: "Apps - Settings",
};

type AppRow = {
	id: string;
	title: string;
	app_key: string;
	url: string | null;
	image_url: string | null;
	is_public: boolean;
	is_active: boolean;
	last_seen: string | null;
	created_at: string | null;
};

const INTERNAL_APP_TITLES = new Set([
	"ai stats chat",
	"ai stats playground",
]);
const INTERNAL_APP_KEY_PREFIXES = [
	"ai-stats-chat",
	"aistats-chat",
	"ai-stats-playground",
	"aistats-playground",
];

function isInternalApp(app: AppRow) {
	const title = app.title?.trim().toLowerCase();
	if (title && INTERNAL_APP_TITLES.has(title)) return true;
	const key = app.app_key?.trim().toLowerCase();
	return (
		Boolean(key) &&
		INTERNAL_APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
	);
}

export default function AppsSettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Apps"
				description="Manage application metadata and public visibility for your team."
				actions={
					<Button asChild variant="outline" size="sm">
						<Link
							href={ATTRIBUTION_DOCS_HREF}
							target="_blank"
							rel="noreferrer"
						>
							Request attribution docs
							<ArrowUpRight className="ml-1 h-4 w-4" />
						</Link>
					</Button>
				}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AppsSettingsContent />
			</Suspense>
		</div>
	);
}

async function AppsSettingsContent() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const initialTeamId = await getTeamIdFromCookie();

	const { data: teamUsers } = await supabase
		.from("team_members")
		.select("team_id, teams(id, name)")
		.eq("user_id", user?.id);

	const teams: Array<{ id: string; name: string }> = [];

	if (teamUsers) {
		for (const tu of teamUsers) {
			if (tu?.teams) {
				const team = Array.isArray(tu.teams) ? tu.teams[0] : tu.teams;
				if (team?.id && team?.name) {
					teams.push({ id: team.id, name: team.name });
				}
			}
		}
	}

	const { data: apps } = initialTeamId
		? await supabase
				.from("api_apps")
				.select(
					"id, title, app_key, url, image_url, is_public, is_active, last_seen, created_at"
				)
				.eq("team_id", initialTeamId)
				.order("last_seen", { ascending: false })
		: { data: [] as AppRow[] };
	const visibleApps = (apps ?? []).filter((app) => !isInternalApp(app));

	return <AppsPanel apps={visibleApps as AppRow[]} />;
}
