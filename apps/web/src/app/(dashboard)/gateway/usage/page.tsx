import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import UsageOverviewChart from "@/components/(gateway)/usage/UsageOverviewChart";
import UsageStatCards from "@/components/(gateway)/usage/UsageHeader/UsageStatCards";
import TopModels from "@/components/(gateway)/usage/TopModels";
import ErrorsPanel from "@/components/(gateway)/usage/ErroredRequests/ErrorsPanel";
import UsageHeader from "@/components/(gateway)/usage/UsageHeader/UsageHeader";
import RecentRequestsPanel from "@/components/(gateway)/usage/SuccessfulRequests/RecentRequestsPanel";
import DeprecationWarnings from "@/components/(gateway)/usage/DeprecationWarnings/DeprecationWarnings";
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
	title: "Usage - AI Stats Conduit",
};

type RangeKey = "1h" | "1d" | "1w" | "1m" | "1y";

function parseRange(range?: string | null): RangeKey {
	const r = (range ?? "").toLowerCase();
	return r === "1h" || r === "1d" || r === "1w" || r === "1m" || r === "1y"
		? r
		: "1m";
}

type GroupBy = "model" | "key";

function parseGroup(group?: string | null): GroupBy {
	return group === "key" ? "key" : "model";
}

type ApiKeyOption = {
	id: string;
	name: string | null;
	prefix: string | null;
};

type BreakdownRow = {
	id: string;
	label: string;
	subtitle: string | null;
	spendUsd: number;
	requests: number;
	tokens: number;
	avgLatencyMs: number | null;
};

const UNKNOWN_KEY_ID = "unknown";

function fromForRange(key: RangeKey): Date {
	const now = new Date();
	const d = new Date(now);
	if (key === "1h") d.setHours(now.getHours() - 1);
	else if (key === "1d") d.setDate(now.getDate() - 1);
	else if (key === "1w") d.setDate(now.getDate() - 7);
	else if (key === "1m") d.setMonth(now.getMonth() - 1);
	else if (key === "1y") d.setFullYear(now.getFullYear() - 1);
	return d;
}

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const supabase = await createClient();

	// Check if user signed in
	const { data: { user } } = await supabase.auth.getUser();

	if (!user) {
		redirect('/sign-in');
	}

	const teamId = await getTeamIdFromCookie();

    const sp = await searchParams;
    const range = parseRange(
        typeof sp?.range === "string"
            ? sp?.range
            : Array.isArray(sp?.range)
            ? sp?.range?.[0]
            : undefined
    );
    const groupParam =
        typeof sp?.group === "string"
            ? sp.group
            : Array.isArray(sp?.group)
            ? sp.group?.[0]
            : undefined;
    const groupBy = parseGroup(groupParam);
    // Optional key filter coming from Settings/Keys "Usage" action
    const keyParam =
        typeof sp?.key === "string"
            ? sp.key
            : Array.isArray(sp?.key)
            ? sp.key?.[0]
            : undefined;
    let activeKey: ApiKeyOption | null = null;
	// pagination removed (no full table)

	if (!teamId) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<Card>
						<CardHeader>
							<CardTitle>Usage</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								You need to be signed in and have a team
								selected to view usage.
							</p>
						</CardContent>
					</Card>
				</div>
			</main>
		);
	}

    const { data: keyRows } = await supabase
        .from("keys")
        .select("id,name,prefix")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
    const availableKeys: ApiKeyOption[] =
        (keyRows ?? []).map((row: any) => ({
            id: row.id,
            name: row?.name ?? null,
            prefix: row?.prefix ?? null,
        }));
    if (keyParam) {
        activeKey = availableKeys.find((k) => k.id === keyParam) ?? null;
    }

	const from = fromForRange(range).toISOString();
	const nowIso = new Date().toISOString();
	// previous window (same duration before 'from')
	const fromDate = fromForRange(range);
	const nowDate = new Date();
	const windowMs = nowDate.getTime() - fromDate.getTime();
	const prevTo = fromDate;
	const prevFrom = new Date(prevTo.getTime() - windowMs).toISOString();

	// 1) Pull series source data (limited) for charts
	const SERIES_MAX = 5000;

    let seriesQuery = supabase
        .from("gateway_requests")
        .select(
            "request_id,created_at,provider,model_id,key_id,app_id,usage,cost_nanos,generation_ms,currency,success"
        )
        .eq("team_id", teamId)
        .gte("created_at", from)
        .lte("created_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(SERIES_MAX);
    if (activeKey) seriesQuery = seriesQuery.eq("key_id", activeKey.id);
    const { data: seriesRows, error } = await seriesQuery;

	if (error) {
		console.error("usage fetch error:", error);
	}

	// 2b) Fetch full (unpaged) current + previous for summary metrics
    let currentQuery = supabase
        .from("gateway_requests")
        .select(
            "request_id,created_at,provider,model_id,key_id,usage,cost_nanos,generation_ms,latency_ms,success,error_code,status_code,currency"
        )
        .eq("team_id", teamId)
        .gte("created_at", from)
        .lte("created_at", nowIso);
    if (activeKey) currentQuery = currentQuery.eq("key_id", activeKey.id);
    const { data: currentRows } = await currentQuery;

    let previousQuery = supabase
        .from("gateway_requests")
        .select(
            "request_id,created_at,provider,model_id,key_id,usage,cost_nanos,generation_ms,latency_ms,success,error_code,status_code,currency"
        )
        .eq("team_id", teamId)
        .gte("created_at", prevFrom)
        .lt("created_at", from);
    if (activeKey) previousQuery = previousQuery.eq("key_id", activeKey.id);
    const { data: previousRows } = await previousQuery;

	// helpers
	const getTokens = (usage: any) => {
		const safeNumber = (value: unknown): number => {
			if (value === null || value === undefined || value === "") return 0;
			const n = Number(value);
			return Number.isFinite(n) && n >= 0 ? n : 0;
		};

		// Prefer the canonical aggregate total_tokens, mirroring the RPC:
		//   sum(NULLIF(usage->>'total_tokens','')::bigint)
		const totalFromField = safeNumber(usage?.total_tokens);

		// Fallback for older rows that might not have total_tokens populated.
		const sumAllTokenCounters = (value: any): number => {
			if (Array.isArray(value)) {
				return value.reduce((sum, item) => sum + sumAllTokenCounters(item), 0);
			}
			if (!value || typeof value !== "object") return 0;
			return Object.entries(value)
				.filter(
					([key]) =>
						typeof key === "string" &&
						key.toLowerCase().includes("token") &&
						key.toLowerCase() !== "total_tokens"
				)
				.reduce((sum, [, v]) => {
					const n = Number(v);
					return Number.isFinite(n) && n > 0 ? sum + n : sum;
				}, 0);
		};

		const input =
			safeNumber(usage?.input_text_tokens ?? usage?.input_tokens ?? 0);
		const output =
			safeNumber(usage?.output_text_tokens ?? usage?.output_tokens ?? 0);
		const total =
			totalFromField > 0 ? totalFromField : sumAllTokenCounters(usage);

		return { input, output, total };
	};
	const sumSpend = (rows?: any[] | null) =>
		(rows ?? []).reduce((s, r) => s + Number(r?.cost_nanos ?? 0) / 1e9, 0);
	const sumTokens = (rows?: any[] | null) =>
		(rows ?? []).reduce((s, r) => s + getTokens(r?.usage).total, 0);
	const countReq = (rows?: any[] | null) => (rows ?? []).length;
	const avg = (arr: number[]) =>
		arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
	const sumGenMs = (rows?: any[] | null) =>
		(rows ?? []).reduce((s, r) => s + Number(r?.generation_ms ?? 0), 0);
	const avgLatencyMs = (rows?: any[] | null) => {
		const vals = (rows ?? [])
			.map((r) => Number(r?.generation_ms ?? r?.latency_ms ?? NaN))
			.filter(Number.isFinite);
		return vals.length ? avg(vals) : null;
	};

	const spendNow = sumSpend(currentRows);
	const spendPrev = sumSpend(previousRows);
	const tokensNow = sumTokens(currentRows);
	const tokensPrev = sumTokens(previousRows);
	const reqNow = countReq(currentRows);
	const reqPrev = countReq(previousRows);
	const genMsNow = sumGenMs(currentRows);
	const throughputNow = genMsNow > 0 ? tokensNow / (genMsNow / 1000) : 0;
	const throughputPrev = (() => {
		const gm = sumGenMs(previousRows);
		const tk = tokensPrev;
		return gm > 0 ? tk / (gm / 1000) : 0;
	})();

	const delta = (curr: number, prev: number) => {
		if (!Number.isFinite(prev) || prev === 0) return curr > 0 ? 1 : null;
		return (curr - prev) / prev;
	};

	const periodLabel = (() => {
		const startDate = new Date(from);
		const endDate = new Date(nowIso);

		const fmtDateNoYear = (d: Date) =>
			d.toLocaleString(undefined, { month: "short", day: "2-digit" });
		const fmtDateWithTime = (d: Date) =>
			d.toLocaleString(undefined, {
				month: "short",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});

		if (range === "1d" || range === "1h") {
			const start = fmtDateWithTime(startDate);
			const end = fmtDateWithTime(endDate);
			return `From ${start} - ${end}, ${endDate.getFullYear()}`;
		} else {
			const start = fmtDateNoYear(startDate);
			const end = fmtDateNoYear(endDate);
			const startYear = startDate.getFullYear();
			const endYear = endDate.getFullYear();
			return startYear === endYear
				? `From ${start} - ${end}, ${endYear}`
				: `From ${start}, ${startYear} - ${end}, ${endYear}`;
		}
	})();

	// Top models and API keys by spend
	type AggValue = {
		spendUsd: number;
		requests: number;
		tokens: number;
		latencies: number[];
	};
	const makeAggValue = (): AggValue => ({
		spendUsd: 0,
		requests: 0,
		tokens: 0,
		latencies: [],
	});
	const ensureEntry = (map: Map<string, AggValue>, key: string) => {
		const node = map.get(key);
		if (node) return node;
		const next = makeAggValue();
		map.set(key, next);
		return next;
	};
	const modelAgg = new Map<string, AggValue>();
	const keyAgg = new Map<string, AggValue>();
	(currentRows ?? []).forEach((r) => {
		const spend = Number(r.cost_nanos ?? 0) / 1e9;
		const tokens = getTokens(r.usage).total;
		const latencyValue = Number(r.generation_ms ?? r.latency_ms ?? NaN);
		const latency = Number.isFinite(latencyValue) ? latencyValue : null;

		const modelEntry = ensureEntry(modelAgg, r.model_id ?? "unknown");
		modelEntry.spendUsd += spend;
		modelEntry.requests += 1;
		modelEntry.tokens += tokens;
		if (latency != null) modelEntry.latencies.push(latency);

		const keyEntry = ensureEntry(keyAgg, (r as any)?.key_id ?? UNKNOWN_KEY_ID);
		keyEntry.spendUsd += spend;
		keyEntry.requests += 1;
		keyEntry.tokens += tokens;
		if (latency != null) keyEntry.latencies.push(latency);
	});

	const keyMetaMap = new Map(availableKeys.map((key) => [key.id, key]));
	const truncateId = (value: string) =>
		value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
	const describeKey = (keyId: string): { label: string; subtitle: string | null } => {
		if (keyId === UNKNOWN_KEY_ID) {
			return {
				label: "Unknown key",
				subtitle: "Legacy requests missing key attribution",
			};
		}
		const meta = keyMetaMap.get(keyId);
		if (!meta) {
			return { label: truncateId(keyId), subtitle: null };
		}
		const name = meta.name?.trim();
		const prefix = meta.prefix?.trim();
		if (name) {
			return { label: name, subtitle: prefix || null };
		}
		if (prefix) {
			return { label: prefix, subtitle: null };
		}
		return { label: truncateId(keyId), subtitle: null };
	};

	const topModels: BreakdownRow[] = Array.from(modelAgg.entries())
		.map(([model, v]) => ({
			id: model,
			label: model,
			subtitle: null,
			spendUsd: v.spendUsd,
			requests: v.requests,
			tokens: v.tokens,
			avgLatencyMs: v.latencies.length
				? v.latencies.reduce((s, x) => s + x, 0) / v.latencies.length
				: null,
		}))
		.sort((a, b) => b.spendUsd - a.spendUsd)
		.slice(0, 6);
	const topKeys: BreakdownRow[] = Array.from(keyAgg.entries())
		.map(([keyId, v]) => {
			const { label, subtitle } = describeKey(keyId);
			return {
				id: keyId,
				label,
				subtitle,
				spendUsd: v.spendUsd,
				requests: v.requests,
				tokens: v.tokens,
				avgLatencyMs: v.latencies.length
					? v.latencies.reduce((s, x) => s + x, 0) / v.latencies.length
					: null,
			};
		})
		.sort((a, b) => b.spendUsd - a.spendUsd)
		.slice(0, 6);
	const breakdownRows = groupBy === "key" ? topKeys : topModels;
	const breakdownVariant = groupBy === "key" ? "key" : "model";

	// Errors (filter to user-attributed only)
	const isUserAttributed = (row: any) => {
		const code = String(row?.error_code ?? "").toLowerCase();
		if (code.startsWith("user:")) return true;
		if (code.startsWith("upstream:")) return false;
		const sc = Number(row?.status_code ?? 0);
		if (Number.isFinite(sc)) {
			if (sc >= 500) return false;
			if (sc === 408 || sc === 429) return false;
			if (sc >= 400 && sc < 500) return true;
		}
		// Default to user if unknown but marked unsuccessful
		return !row?.success;
	};
	const errsAll = (currentRows ?? []).filter(
		(r) => !r.success || Number(r.status_code ?? 0) >= 400
	);
	const errs = errsAll.filter(isUserAttributed);
	const totalErrors = errs.length;
	const codeAgg = new Map<string, number>();
	errs.forEach((e) => {
		let key = (e.error_code ?? String(e.status_code ?? "error")) as string;
		key = key.replace(/^user:/i, "");
		codeAgg.set(key, (codeAgg.get(key) ?? 0) + 1);
	});
	const topCodes = Array.from(codeAgg.entries())
		.map(([code, count]) => ({ code, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);
	const recentErrors = errs
		.sort(
			(a, b) =>
				new Date(b.created_at).getTime() -
				new Date(a.created_at).getTime()
		)
		.slice(0, 5);
	const recentRequests = (currentRows ?? [])
		.filter((r) => Boolean(r.success) && Number(r.status_code ?? 200) < 400)
		.slice()
		.sort(
			(a, b) =>
				new Date(b.created_at).getTime() -
				new Date(a.created_at).getTime()
		)
		.slice(0, 5);

	return (
		<main className="flex min-h-screen flex-col">
            <div className="container mx-auto px-4 py-8">
				<UsageHeader keys={availableKeys} />

                {activeKey ? (
                    <div className="mb-4 text-sm text-muted-foreground">
                        Showing usage for key
                        {" "}
                        <span className="font-mono">{activeKey.prefix ?? ""}</span>
                        {activeKey.name ? (
                            <>
                                {" "}(<span className="font-medium">{activeKey.name}</span>)
                            </>
                        ) : null}
                        . {" "}
                        <a className="underline" href="/conduit/usage">Clear filter</a>
                    </div>
                ) : (
                    <DeprecationWarnings />
                )}

				<UsageStatCards
					periodLabel={periodLabel}
					cards={[
						{
							icon: "spend",
							title: "Spend",
							value: spendNow,
							format: {
								style: "currency",
								currency: "USD",
								currencyDisplay: "narrowSymbol",
								minimumFractionDigits: 5,
								maximumFractionDigits: 5,
							},
							delta: {
								percent: delta(spendNow, spendPrev),
								// abs: spendNow - spendPrev, // <<— absolute change
							},
						},
						{
							icon: "requests",
							title: "Requests",
							value: reqNow,
							delta: {
								percent: delta(reqNow, reqPrev),
								// abs: reqNow - reqPrev,
							},
						},
						{
							icon: "tokens",
							title: "Tokens",
							value: tokensNow,
							delta: {
								percent: delta(tokensNow, tokensPrev),
								// abs: tokensNow - tokensPrev,
							},
						},
					]}
				/>

				{/* Recent lists */}
				<div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
					<RecentRequestsPanel rows={recentRequests} />
					<Card className="hidden">
						<CardHeader>
							<CardTitle>Recent Requests</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="space-y-2">
								{recentRequests.map((r, idx) => (
									<li
										key={idx}
										className="flex items-center justify-between text-sm"
									>
										<div className="min-w-0">
											<div className="font-medium truncate">
												{r.provider ?? "-"} ·{" "}
												{r.model_id ?? "-"}
											</div>
											<div className="text-xs text-muted-foreground">
												{new Date(
													r.created_at
												).toLocaleString()}
											</div>
										</div>
										<div className="ml-2 shrink-0 text-right text-xs text-muted-foreground">
											$
											{(
												Number(r.cost_nanos ?? 0) / 1e9
											).toFixed(5)}
										</div>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
					<ErrorsPanel
						totalErrors={totalErrors}
						totalRequests={reqNow}
						topCodes={topCodes}
						recent={recentErrors}
					/>
				</div>

				{/* Overview chart */}
				<div className="mt-8">
					<UsageOverviewChart
						range={range}
						rows={(seriesRows ?? []).map((r) => ({
							created_at: r.created_at,
							usage: r.usage,
							cost_nanos: r.cost_nanos,
							model_id: r.model_id,
							key_id: (r as any)?.key_id ?? null,
						}))}
						windowLabel={periodLabel}
						groupMode={groupBy === "key" && !activeKey ? "key" : "model"}
						keyMeta={availableKeys}
					/>
				</div>

				<div className="mt-8">
					<TopModels
						rows={breakdownRows}
						variant={breakdownVariant}
					/>
				</div>
			</div>
		</main>
	);
}
