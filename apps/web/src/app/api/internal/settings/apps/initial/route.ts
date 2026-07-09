import { NextResponse } from "next/server";
import { normalizeAppCategoryCsv } from "@/lib/appCategories";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsAppsInitialData = {
	apps: AppRow[];
};

export type AppRow = {
	app_key: string;
	category: string | null;
	created_at: string | null;
	docs_url: string | null;
	id: string;
	image_url: string | null;
	is_active: boolean;
	is_public: boolean;
	last_seen: string | null;
	title: string;
	url: string | null;
};

type AppQueryResult = {
	data: Array<Record<string, unknown>> | null;
	error: { message: string } | null;
};

const INTERNAL_APP_TITLES = new Set([
	"phaseo chat",
	"phaseo playground",
	["ai", "stats", "chat"].join(" "),
	["ai", "stats", "playground"].join(" "),
]);
const INTERNAL_APP_KEY_PREFIXES = [
	"phaseo-chat",
	"phaseo-playground",
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

	const selectApps = async (columns: string): Promise<AppQueryResult> => {
		const result = await supabase
			.from("api_apps")
			.select(columns)
			.eq("workspace_id", workspaceId)
			.order("last_seen", { ascending: false });
		return result as unknown as AppQueryResult;
	};

	let { data, error } = await selectApps(
		"id, title, app_key, category, docs_url, url, image_url, is_public, is_active, last_seen, created_at",
	);

	if (
		error &&
		(error.message.toLowerCase().includes("category") ||
			error.message.toLowerCase().includes("docs_url"))
	) {
		const fallback = await selectApps(
			"id, title, app_key, url, image_url, is_public, is_active, last_seen, created_at",
		);
		data =
			fallback.data?.map((app) => ({
				...app,
				category: null,
				docs_url: null,
			})) ?? null;
		error = fallback.error;
	}

	if (error) throw new Error(error.message);

	const apps = (data ?? [])
		.map((app) => {
			return {
				app_key: String(app.app_key ?? ""),
				category:
					typeof app.category === "string"
						? normalizeAppCategoryCsv(app.category)
						: null,
				created_at:
					typeof app.created_at === "string" ? app.created_at : null,
				docs_url: typeof app.docs_url === "string" ? app.docs_url : null,
				id: String(app.id ?? ""),
				image_url:
					typeof app.image_url === "string" ? app.image_url : null,
				is_active: app.is_active === true,
				is_public: app.is_public === true,
				last_seen: typeof app.last_seen === "string" ? app.last_seen : null,
				title: String(app.title ?? ""),
				url: typeof app.url === "string" ? app.url : null,
			} satisfies AppRow;
		})
		.filter((app) => !isInternalApp(app));

	return NextResponse.json({
		apps,
	} satisfies SettingsAppsInitialData);
}
