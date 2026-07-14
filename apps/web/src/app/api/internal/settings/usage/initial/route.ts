import { NextResponse, type NextRequest } from "next/server";
import {
	fetchAppMetadata,
	fetchChartData,
	fetchModelMetadata,
	fetchOrganizationColors,
	fetchProviderNames,
	fetchRecentAsyncJobs,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

type RangeKey = "1h" | "1d" | "1w" | "1m" | "1y";
type GroupBy = "model" | "key";

type ApiKeyOption = {
	id: string;
	name: string | null;
	prefix: string | null;
};

export type SettingsUsageInitialData = {
	activeKey: ApiKeyOption | null;
	appMetadataEntries: Array<[string, any]>;
	asyncJobModelMetadataEntries: Array<[string, any]>;
	asyncJobProviderNameEntries: Array<[string, string]>;
	availableKeys: ApiKeyOption[];
	colorMapEntries: Array<[string, string]>;
	from: string;
	initialChartData: any;
	modelMetadataEntries: Array<[string, any]>;
	range: RangeKey;
	recentAsyncJobs: any[];
	signedIn: boolean;
	to: string;
	workspaceId: string | null;
};

function parseRange(range?: string | null): RangeKey {
	const value = (range ?? "").toLowerCase();
	return value === "1h" ||
		value === "1d" ||
		value === "1w" ||
		value === "1m" ||
		value === "1y"
		? value
		: "1m";
}

function parseGroup(group?: string | null): GroupBy {
	return group === "key" ? "key" : "model";
}

function fromForRange(key: RangeKey): Date {
	const now = new Date();
	const date = new Date(now);
	if (key === "1h") date.setHours(now.getHours() - 1);
	else if (key === "1d") date.setDate(now.getDate() - 1);
	else if (key === "1w") date.setDate(now.getDate() - 7);
	else if (key === "1m") date.setMonth(now.getMonth() - 1);
	else if (key === "1y") date.setFullYear(now.getFullYear() - 1);
	return date;
}

function getParam(request: NextRequest, key: string): string | null {
	const value = request.nextUrl.searchParams.get(key);
	return value && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({
			activeKey: null,
			appMetadataEntries: [],
			asyncJobModelMetadataEntries: [],
			asyncJobProviderNameEntries: [],
			availableKeys: [],
			colorMapEntries: [],
			from: new Date().toISOString(),
			initialChartData: null,
			modelMetadataEntries: [],
			range: "1m",
			recentAsyncJobs: [],
			signedIn: false,
			to: new Date().toISOString(),
			workspaceId: null,
		} satisfies SettingsUsageInitialData);
	}

	const workspaceId = await getWorkspaceIdFromCookie();
	const range = parseRange(getParam(request, "range"));
	const groupBy = parseGroup(getParam(request, "group"));
	const keyParam = getParam(request, "key");
	const from = fromForRange(range).toISOString();
	const to = new Date().toISOString();

	if (!workspaceId) {
		return NextResponse.json({
			activeKey: null,
			appMetadataEntries: [],
			asyncJobModelMetadataEntries: [],
			asyncJobProviderNameEntries: [],
			availableKeys: [],
			colorMapEntries: [],
			from,
			initialChartData: null,
			modelMetadataEntries: [],
			range,
			recentAsyncJobs: [],
			signedIn: true,
			to,
			workspaceId: null,
		} satisfies SettingsUsageInitialData);
	}

	const [{ data: keyRows }, { data: modelProviderRollups }, { data: requestUniques }] =
		await Promise.all([
			supabase
				.from("keys")
				.select("id,name,prefix")
				.eq("workspace_id", workspaceId)
				.neq("status", "deleted")
				.neq("name", CHAT_MANAGED_KEY_NAME)
				.order("created_at", { ascending: true }),
			supabase
				.from("gateway_usage_rollup_15m_workspace_provider_model")
				.select("canonical_model_id, provider")
				.eq("workspace_id", workspaceId)
				.gte("bucket_15m", from)
				.lte("bucket_15m", to),
			supabase
				.from("gateway_requests")
				.select("model_id")
				.eq("workspace_id", workspaceId)
				.gte("created_at", from)
				.lte("created_at", to),
		]);

	const availableKeys: ApiKeyOption[] = (keyRows ?? []).map((row: any) => ({
		id: row.id,
		name: row?.name ?? null,
		prefix: row?.prefix ?? null,
	}));
	const activeKey =
		keyParam && groupBy === "key"
			? availableKeys.find((key) => key.id === keyParam) ?? null
			: null;

	const uniqueModels = Array.from(
		new Set(
			[
				...(modelProviderRollups ?? []).map((row: any) => row.canonical_model_id),
				...(requestUniques ?? []).map((row: any) => row.model_id),
			].filter(Boolean),
		),
	);

	const [colorMap, modelMetadata, recentAsyncJobs, initialChartData] =
		await Promise.all([
			fetchOrganizationColors(uniqueModels),
			fetchModelMetadata(uniqueModels),
			fetchRecentAsyncJobs({ limit: 20 }),
			fetchChartData({
				timeRange: { from, to },
				range,
				keyFilter: activeKey?.id ?? null,
			}),
		]);

	const asyncJobModelIds = Array.from(
		new Set(
			recentAsyncJobs
				.map((job) => job.model)
				.filter(
					(modelId): modelId is string =>
						typeof modelId === "string" && modelId.trim().length > 0,
				),
		),
	);
	const asyncJobProviderIds = Array.from(
		new Set(
			recentAsyncJobs
				.map((job) => job.provider)
				.filter(
					(providerId): providerId is string =>
						typeof providerId === "string" && providerId.trim().length > 0,
				),
		),
	);
	const asyncJobAppIds = Array.from(
		new Set(
			recentAsyncJobs
				.map((job) => job.app_id)
				.filter(
					(appId): appId is string =>
						typeof appId === "string" && appId.trim().length > 0,
				),
		),
	);
	const [asyncJobProviderNames, asyncJobModelMetadata, asyncJobAppMetadata] =
		await Promise.all([
			fetchProviderNames(asyncJobProviderIds),
			fetchModelMetadata(asyncJobModelIds),
			fetchAppMetadata(asyncJobAppIds),
		]);

	return NextResponse.json({
		activeKey,
		appMetadataEntries: Array.from(asyncJobAppMetadata.entries()),
		asyncJobModelMetadataEntries: Array.from(asyncJobModelMetadata.entries()),
		asyncJobProviderNameEntries: Array.from(asyncJobProviderNames.entries()),
		availableKeys,
		colorMapEntries: Array.from(colorMap.entries()),
		from,
		initialChartData,
		modelMetadataEntries: Array.from(modelMetadata.entries()),
		range,
		recentAsyncJobs,
		signedIn: true,
		to,
		workspaceId,
	} satisfies SettingsUsageInitialData);
}
