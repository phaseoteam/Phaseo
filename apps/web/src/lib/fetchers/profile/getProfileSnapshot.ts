import "server-only"

import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import {
	buildDailyActivitySeries,
	buildHeatmapDays,
	buildPublicProfileSlug,
	calculatePeriodChange,
	calculateStreaks,
	formatUsdFromNanos,
	toUtcDateKey,
	type DailyActivityPoint,
	type HeatmapDay,
} from "@/lib/profile"
import { absoluteUrl } from "@/lib/seo"

type UsageValue = Record<string, unknown> | null

type ProfileTopModel = {
	id: string
	name: string
	requests: number
	tokens: number
	spendNanos: number
}

type UsageSummary = {
	today: string
	week: string
	month: string
}

export type ProfileSnapshot = {
	userId: string
	displayName: string
	email: string | null
	avatarUrl: string | null
	memberSince: string
	workspaceName: string | null
	publicProfileEnabled: boolean
	publicProfileSlug: string
	shareUrl: string
	requestSeries: DailyActivityPoint[]
	tokenSeries: DailyActivityPoint[]
	activitySeries30: DailyActivityPoint[]
	requestChange: number | null
	tokenChange: number | null
	totalRequests: number
	totalTokens: number
	avgPerDay: number
	avgPerWeek: number
	currentStreak: number
	longestStreak: number
	activeDays: number
	topModels: ProfileTopModel[]
	heatmapDays: HeatmapDay[]
	creditsUsage: UsageSummary
	byokUsage: UsageSummary
}

type GatewayRequestRow = {
	created_at: string | null
	model_id: string | null
	usage: UsageValue
	cost_nanos: number | string | null
}

const PAGE_SIZE = 1000

function toFiniteNumber(value: unknown): number | null {
	const numberValue = Number(value)
	return Number.isFinite(numberValue) ? numberValue : null
}

function getUsageNumber(usage: UsageValue, keys: string[]): number {
	if (!usage) return 0
	for (const key of keys) {
		const value = toFiniteNumber(usage[key])
		if (value != null) return value
	}
	return 0
}

function getRowTokenCount(usage: UsageValue): number {
	const totalTokens = getUsageNumber(usage, ["total_tokens", "total_text_tokens"])
	if (totalTokens > 0) return totalTokens

	const inputTokens = getUsageNumber(usage, ["input_text_tokens", "input_tokens"])
	const outputTokens = getUsageNumber(usage, ["output_text_tokens", "output_tokens"])
	return inputTokens + outputTokens
}

function getRowSpendNanos(value: number | string | null): number {
	return toFiniteNumber(value) ?? 0
}

async function fetchWorkspaceRequestRows(workspaceId: string): Promise<GatewayRequestRow[]> {
	const supabase = createAdminClient()
	const rows: GatewayRequestRow[] = []

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("gateway_requests")
			.select("created_at, model_id, usage, cost_nanos")
			.eq("workspace_id", workspaceId)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1)

		if (error) {
			throw new Error(error.message ?? "Failed to load workspace request history")
		}

		const page = (data ?? []) as GatewayRequestRow[]
		rows.push(...page)
		if (page.length < PAGE_SIZE) break
	}

	return rows
}

function buildZeroUsageSummary(): UsageSummary {
	return {
		today: "$0.0000",
		week: "$0.0000",
		month: "$0.0000",
	}
}

async function buildOwnProfileSnapshot(): Promise<ProfileSnapshot | null> {
	const supabase = await createClient()
	let adminClient: ReturnType<typeof createAdminClient> | null = null
	try {
		adminClient = createAdminClient()
	} catch {
		adminClient = null
	}
	const readClient: any = adminClient ?? supabase

	const {
		data: { user },
	} = await supabase.auth.getUser()

	if (!user) return null

	const { data: userRow } = await readClient
		.from("users")
		.select("display_name, default_workspace_id, created_at")
		.eq("user_id", user.id)
		.maybeSingle()

	const displayName =
		String(userRow?.display_name ?? user.user_metadata?.display_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "AI Stats User").trim() ||
		"AI Stats User"
	const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim() || null
	const memberSince = String(userRow?.created_at ?? user.created_at ?? new Date().toISOString())

	let workspaceName: string | null = "Personal"
	if (defaultWorkspaceId) {
		const { data: workspaceRow } = await readClient
			.from("workspaces")
			.select("name")
			.eq("id", defaultWorkspaceId)
			.maybeSingle()
		const resolvedWorkspaceName = String(workspaceRow?.name ?? "").trim()
		if (resolvedWorkspaceName) workspaceName = resolvedWorkspaceName
	}

	const publicProfileSlug = buildPublicProfileSlug(displayName, user.id)
	const shareUrl = absoluteUrl(`/profile/${publicProfileSlug}`)

	const emptyActivitySeries30 = buildDailyActivitySeries(new Map(), 30)
	const emptyHeatmap = buildHeatmapDays(new Map())
	const zeroUsage = buildZeroUsageSummary()

	if (!defaultWorkspaceId) {
		return {
			userId: user.id,
			displayName,
			email: user.email ?? null,
			avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
			memberSince,
			workspaceName,
			publicProfileEnabled: false,
			publicProfileSlug,
			shareUrl,
			requestSeries: emptyActivitySeries30,
			tokenSeries: emptyActivitySeries30,
			activitySeries30: emptyActivitySeries30,
			requestChange: null,
			tokenChange: null,
			totalRequests: 0,
			totalTokens: 0,
			avgPerDay: 0,
			avgPerWeek: 0,
			currentStreak: 0,
			longestStreak: 0,
			activeDays: 0,
			topModels: [],
			heatmapDays: emptyHeatmap,
			creditsUsage: zeroUsage,
			byokUsage: zeroUsage,
		}
	}

	const requestRows = await fetchWorkspaceRequestRows(defaultWorkspaceId)
	const dayTotals = new Map<string, { requests: number; tokens: number; spendNanos: number }>()
	const topModelsById = new Map<string, { requests: number; tokens: number; spendNanos: number }>()

	for (const row of requestRows) {
		if (!row.created_at) continue
		const dayKey = toUtcDateKey(row.created_at)
		const tokens = getRowTokenCount(row.usage)
		const spendNanos = getRowSpendNanos(row.cost_nanos)

		const existingDay = dayTotals.get(dayKey) ?? { requests: 0, tokens: 0, spendNanos: 0 }
		existingDay.requests += 1
		existingDay.tokens += tokens
		existingDay.spendNanos += spendNanos
		dayTotals.set(dayKey, existingDay)

		const modelId = String(row.model_id ?? "").trim() || "unknown"
		const existingModel = topModelsById.get(modelId) ?? { requests: 0, tokens: 0, spendNanos: 0 }
		existingModel.requests += 1
		existingModel.tokens += tokens
		existingModel.spendNanos += spendNanos
		topModelsById.set(modelId, existingModel)
	}

	const activitySeries30 = buildDailyActivitySeries(dayTotals, 30)
	const activitySeries60 = buildDailyActivitySeries(dayTotals, 60)
	const requestSeries = activitySeries30
	const tokenSeries = activitySeries30
	const heatmapDays = buildHeatmapDays(dayTotals)
	const { current, longest, activeDays } = calculateStreaks(activitySeries30)

	const last30Requests = activitySeries60.slice(-30).reduce((sum, point) => sum + point.requests, 0)
	const previous30Requests = activitySeries60.slice(0, 30).reduce((sum, point) => sum + point.requests, 0)
	const last30Tokens = activitySeries60.slice(-30).reduce((sum, point) => sum + point.tokens, 0)
	const previous30Tokens = activitySeries60.slice(0, 30).reduce((sum, point) => sum + point.tokens, 0)

	const totalRequests = requestRows.length
	const totalTokens = requestRows.reduce((sum, row) => sum + getRowTokenCount(row.usage), 0)
	const avgPerDay = activeDays > 0 ? totalRequests / activeDays : 0
	const avgPerWeek = totalRequests / 52

	const topModelIds = Array.from(topModelsById.keys()).filter((id) => id !== "unknown")
	const modelNamesById = new Map<string, string>()
	if (topModelIds.length > 0) {
		const { data: modelRows } = await readClient
			.from("data_models")
			.select("model_id, name")
			.in("model_id", topModelIds)
		for (const row of modelRows ?? []) {
			const modelId = String((row as any)?.model_id ?? "").trim()
			const name = String((row as any)?.name ?? "").trim()
			if (modelId && name) modelNamesById.set(modelId, name)
		}
	}

	const topModels: ProfileTopModel[] = Array.from(topModelsById.entries())
		.map(([id, stats]) => ({
			id,
			name: modelNamesById.get(id) ?? id,
			requests: stats.requests,
			tokens: stats.tokens,
			spendNanos: stats.spendNanos,
		}))
		.sort((a, b) => {
			if (b.tokens !== a.tokens) return b.tokens - a.tokens
			if (b.requests !== a.requests) return b.requests - a.requests
			return b.spendNanos - a.spendNanos
		})

	const creditsUsage: UsageSummary = {
		today: formatUsdFromNanos(activitySeries30.slice(-1).reduce((sum, point) => sum + point.spendNanos, 0)),
		week: formatUsdFromNanos(activitySeries30.slice(-7).reduce((sum, point) => sum + point.spendNanos, 0)),
		month: formatUsdFromNanos(activitySeries30.reduce((sum, point) => sum + point.spendNanos, 0)),
	}

	return {
		userId: user.id,
		displayName,
		email: user.email ?? null,
		avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
		memberSince,
		workspaceName,
		publicProfileEnabled: false,
		publicProfileSlug,
		shareUrl,
		requestSeries,
		tokenSeries,
		activitySeries30,
		requestChange: calculatePeriodChange(last30Requests, previous30Requests),
		tokenChange: calculatePeriodChange(last30Tokens, previous30Tokens),
		totalRequests,
		totalTokens,
		avgPerDay,
		avgPerWeek,
		currentStreak: current,
		longestStreak: longest,
		activeDays,
		topModels,
		heatmapDays,
		creditsUsage,
		byokUsage: zeroUsage,
	}
}

export async function getOwnProfileSnapshot(): Promise<ProfileSnapshot | null> {
	return buildOwnProfileSnapshot()
}

export async function getPublicProfileSnapshot(_slug: string): Promise<ProfileSnapshot | null> {
	return null
}
