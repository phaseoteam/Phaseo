import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsAppsInitialData = {
	apps: AppRow[];
};

export type AppRow = {
	app_key: string;
	created_at: string | null;
	id: string;
	image_url: string | null;
	is_active: boolean;
	is_public: boolean;
	last_seen: string | null;
	title: string;
	url: string | null;
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

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const workspaceId = user ? await getWorkspaceIdFromCookie() : null;

	if (!workspaceId) {
		return NextResponse.json({
			apps: [],
		} satisfies SettingsAppsInitialData);
	}

	const { data, error } = await supabase
		.from("api_apps")
		.select(
			"id, title, app_key, url, image_url, is_public, is_active, last_seen, created_at",
		)
		.eq("workspace_id", workspaceId)
		.order("last_seen", { ascending: false });

	if (error) throw new Error(error.message);

	return NextResponse.json({
		apps: ((data ?? []) as AppRow[]).filter((app) => !isInternalApp(app)),
	} satisfies SettingsAppsInitialData);
}
