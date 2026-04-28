import { createAdminClient } from "@/utils/supabase/admin";

type ReportStatus =
	| "received"
	| "matched"
	| "pending_review"
	| "auto_revoked"
	| "manually_revoked"
	| "dismissed"
	| "duplicate";

type SecurityReportRow = {
	id: string;
	received_at: string;
	status: ReportStatus | string | null;
	source: string | null;
	reporter_email: string | null;
	evidence_url: string | null;
	comment: string | null;
	token_prefix: string | null;
	token_last_four: string | null;
	matched: boolean | null;
	key_table: "keys" | "management_keys" | null;
	api_key_id: string | null;
	workspace_id: string | null;
	action_taken: string | null;
	action_taken_at: string | null;
	report_mode: string | null;
};

type WorkspaceRow = {
	id: string;
	name: string | null;
	owner_user_id: string | null;
};

type KeyRow = {
	id: string;
	name: string | null;
	prefix: string | null;
	status: string | null;
	last_used_at: string | null;
	workspace_id: string;
	revoked_reason?: string | null;
};

export type SecurityReportSummary = {
	total: number;
	pendingReview: number;
	autoRevoked: number;
	manuallyRevoked: number;
	dismissed: number;
	duplicate: number;
};

export type SecurityReportView = {
	id: string;
	receivedAt: string;
	status: ReportStatus | "received";
	source: string | null;
	reporterEmail: string | null;
	evidenceUrl: string | null;
	comment: string | null;
	matched: boolean;
	keyType: "api_key" | "management_key" | null;
	keyId: string | null;
	keyName: string | null;
	keyStatus: string | null;
	keyPreview: string | null;
	workspaceId: string | null;
	workspaceName: string | null;
	ownerEmail: string | null;
	lastUsedAt: string | null;
	recentSpendUsd: number | null;
	recentRequestCount: number | null;
	riskLevel: "high" | "medium" | "low";
	actionTaken: string | null;
	actionTakenAt: string | null;
	reportMode: string | null;
	canManuallyRevoke: boolean;
	canDismiss: boolean;
	canMarkDuplicate: boolean;
};

export type GetSecurityReportsInput = {
	query?: string;
	status?: string;
};

function normalizeReportStatus(status: string | null | undefined): SecurityReportView["status"] {
	const normalized = String(status ?? "").trim().toLowerCase();
	if (
		normalized === "matched" ||
		normalized === "pending_review" ||
		normalized === "auto_revoked" ||
		normalized === "manually_revoked" ||
		normalized === "dismissed" ||
		normalized === "duplicate"
	) {
		return normalized;
	}
	return "received";
}

function buildMaskedKey(prefix: string | null, lastFour: string | null): string | null {
	const normalizedPrefix = typeof prefix === "string" && prefix.trim() ? prefix.trim() : null;
	const normalizedLastFour = typeof lastFour === "string" && lastFour.trim() ? lastFour.trim() : null;
	if (normalizedPrefix && normalizedLastFour) {
		return `${normalizedPrefix}...${normalizedLastFour}`;
	}
	if (normalizedPrefix) return `${normalizedPrefix}...`;
	return null;
}

function normalizeQuery(value: string | undefined): string {
	return String(value ?? "").trim().toLowerCase();
}

function computeRiskLevel(args: {
	matched: boolean;
	status: SecurityReportView["status"];
	recentRequestCount: number | null;
	recentSpendUsd: number | null;
	lastUsedAt: string | null;
}): SecurityReportView["riskLevel"] {
	if (!args.matched) return "low";
	if (args.status === "auto_revoked" || args.status === "manually_revoked") return "low";

	const lastUsedMs = args.lastUsedAt ? Date.parse(args.lastUsedAt) : Number.NaN;
	const usedInLast15Minutes =
		Number.isFinite(lastUsedMs) && Date.now() - lastUsedMs <= 15 * 60 * 1000;

	if (
		(args.recentRequestCount ?? 0) >= 100 ||
		(args.recentSpendUsd ?? 0) >= 1 ||
		usedInLast15Minutes
	) {
		return "high";
	}

	return "medium";
}

export async function getSecurityReports(input: GetSecurityReportsInput = {}): Promise<{
	reports: SecurityReportView[];
	summary: SecurityReportSummary;
}> {
	const admin = createAdminClient();
	const { data, error } = await admin
		.from("security_key_reports")
		.select("id,received_at,status,source,reporter_email,evidence_url,comment,token_prefix,token_last_four,matched,key_table,api_key_id,workspace_id,action_taken,action_taken_at,report_mode")
		.order("received_at", { ascending: false })
		.limit(200);

	if (error) {
		throw new Error(error.message || "Failed to load security key reports");
	}

	const rows = (data ?? []) as unknown as SecurityReportRow[];
	const workspaceIds = Array.from(
		new Set(rows.map((row) => row.workspace_id).filter((value): value is string => Boolean(value))),
	);
	const keyIds = rows
		.filter((row) => row.key_table === "keys" && row.api_key_id)
		.map((row) => row.api_key_id as string);
	const managementKeyIds = rows
		.filter((row) => row.key_table === "management_keys" && row.api_key_id)
		.map((row) => row.api_key_id as string);

	const [workspacesRes, keysRes, managementKeysRes, recentGatewayRequestsRes] = await Promise.all([
		workspaceIds.length
			? admin
				.from("workspaces")
				.select("id,name,owner_user_id")
				.in("id", workspaceIds)
			: Promise.resolve({ data: [], error: null }),
		keyIds.length
			? admin
				.from("keys")
				.select("id,name,prefix,status,last_used_at,workspace_id,revoked_reason")
				.in("id", keyIds)
			: Promise.resolve({ data: [], error: null }),
		managementKeyIds.length
			? admin
				.from("management_keys")
				.select("id,name,prefix,status,last_used_at,workspace_id,revoked_reason")
				.in("id", managementKeyIds)
			: Promise.resolve({ data: [], error: null }),
		keyIds.length
			? admin
				.from("gateway_requests")
				.select("key_id,cost_nanos,created_at")
				.in("key_id", keyIds)
				.gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
			: Promise.resolve({ data: [], error: null }),
	]);

	if (workspacesRes.error) {
		throw new Error(workspacesRes.error.message || "Failed to load workspaces");
	}
	if (keysRes.error) {
		throw new Error(keysRes.error.message || "Failed to load keys");
	}
	if (managementKeysRes.error) {
		throw new Error(managementKeysRes.error.message || "Failed to load management keys");
	}
	if (recentGatewayRequestsRes.error) {
		throw new Error(recentGatewayRequestsRes.error.message || "Failed to load recent gateway requests");
	}

	const workspaces = new Map<string, WorkspaceRow>(
		((workspacesRes.data ?? []) as any[]).map((row) => [
			String(row.id),
			{
				id: String(row.id),
				name: typeof row.name === "string" ? row.name : null,
				owner_user_id: typeof row.owner_user_id === "string" ? row.owner_user_id : null,
			},
		]),
	);

	const ownerIds = Array.from(
		new Set(
			Array.from(workspaces.values())
				.map((workspace) => workspace.owner_user_id)
				.filter((value): value is string => Boolean(value)),
		),
	);
	const ownerEmails = new Map<string, string | null>();
	for (const ownerId of ownerIds) {
		try {
			const result = await (admin as any).auth.admin.getUserById(ownerId);
			ownerEmails.set(ownerId, result?.data?.user?.email ?? null);
		} catch {
			ownerEmails.set(ownerId, null);
		}
	}

	const apiKeys = new Map<string, KeyRow>(
		((keysRes.data ?? []) as any[]).map((row) => [
			String(row.id),
			{
				id: String(row.id),
				name: typeof row.name === "string" ? row.name : null,
				prefix: typeof row.prefix === "string" ? row.prefix : null,
				status: typeof row.status === "string" ? row.status : null,
				last_used_at: typeof row.last_used_at === "string" ? row.last_used_at : null,
				workspace_id: String(row.workspace_id),
				revoked_reason: typeof row.revoked_reason === "string" ? row.revoked_reason : null,
			},
		]),
	);

	const managementKeys = new Map<string, KeyRow>(
		((managementKeysRes.data ?? []) as any[]).map((row) => [
			String(row.id),
			{
				id: String(row.id),
				name: typeof row.name === "string" ? row.name : null,
				prefix: typeof row.prefix === "string" ? row.prefix : null,
				status: typeof row.status === "string" ? row.status : null,
				last_used_at: typeof row.last_used_at === "string" ? row.last_used_at : null,
				workspace_id: String(row.workspace_id),
				revoked_reason: typeof row.revoked_reason === "string" ? row.revoked_reason : null,
			},
		]),
	);

	const recentRequestMetrics = new Map<string, { requestCount: number; spendUsd: number }>();
	for (const row of ((recentGatewayRequestsRes.data ?? []) as any[])) {
		const keyId = String(row.key_id ?? "").trim();
		if (!keyId) continue;
		const current = recentRequestMetrics.get(keyId) ?? { requestCount: 0, spendUsd: 0 };
		current.requestCount += 1;
		current.spendUsd += (Number(row.cost_nanos ?? 0) || 0) / 1_000_000_000;
		recentRequestMetrics.set(keyId, current);
	}

	const query = normalizeQuery(input.query);
	const selectedStatus = normalizeQuery(input.status);

	const reports = rows
		.map((row) => {
			const status = normalizeReportStatus(row.status);
			const keyRow =
				row.key_table === "management_keys" && row.api_key_id
					? managementKeys.get(row.api_key_id)
					: row.key_table === "keys" && row.api_key_id
						? apiKeys.get(row.api_key_id)
						: undefined;
			const workspace = row.workspace_id ? workspaces.get(row.workspace_id) : undefined;
			const ownerEmail = workspace?.owner_user_id ? ownerEmails.get(workspace.owner_user_id) ?? null : null;
			const recentMetrics = row.key_table === "keys" && row.api_key_id
				? recentRequestMetrics.get(row.api_key_id)
				: undefined;
			const keyPreview = buildMaskedKey(
				row.token_prefix ?? keyRow?.prefix ?? null,
				row.token_last_four ?? null,
			);
			const reportView: SecurityReportView = {
				id: row.id,
				receivedAt: row.received_at,
				status,
				source: row.source,
				reporterEmail: row.reporter_email,
				evidenceUrl: row.evidence_url,
				comment: row.comment,
				matched: row.matched === true,
				keyType:
					row.key_table === "management_keys"
						? "management_key"
						: row.key_table === "keys"
							? "api_key"
							: null,
				keyId: row.api_key_id,
				keyName: keyRow?.name ?? null,
				keyStatus: keyRow?.status ?? null,
				keyPreview,
				workspaceId: row.workspace_id,
				workspaceName: workspace?.name ?? null,
				ownerEmail,
				lastUsedAt: keyRow?.last_used_at ?? null,
				recentSpendUsd: recentMetrics ? Number(recentMetrics.spendUsd.toFixed(2)) : null,
				recentRequestCount: recentMetrics?.requestCount ?? null,
				riskLevel: computeRiskLevel({
					matched: row.matched === true,
					status,
					recentRequestCount: recentMetrics?.requestCount ?? null,
					recentSpendUsd: recentMetrics ? Number(recentMetrics.spendUsd.toFixed(2)) : null,
					lastUsedAt: keyRow?.last_used_at ?? null,
				}),
				actionTaken: row.action_taken,
				actionTakenAt: row.action_taken_at,
				reportMode: row.report_mode,
				canManuallyRevoke:
					(row.key_table === "keys" || row.key_table === "management_keys") &&
					Boolean(row.api_key_id) &&
					status !== "auto_revoked" &&
					status !== "manually_revoked" &&
					status !== "dismissed" &&
					status !== "duplicate" &&
					String(keyRow?.status ?? "").toLowerCase() === "active",
				canDismiss:
					status === "received" ||
					status === "matched" ||
					status === "pending_review",
				canMarkDuplicate:
					status === "received" ||
					status === "matched" ||
					status === "pending_review",
			};
			return reportView;
		})
		.filter((report) => {
			if (selectedStatus && report.status !== selectedStatus) return false;
			if (!query) return true;
			const haystack = [
				report.id,
				report.status,
				report.source ?? "",
				report.reporterEmail ?? "",
				report.workspaceName ?? "",
				report.ownerEmail ?? "",
				report.keyPreview ?? "",
				report.keyName ?? "",
				report.comment ?? "",
				report.evidenceUrl ?? "",
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(query);
		});

	const summary = reports.reduce<SecurityReportSummary>(
		(acc, report) => {
			acc.total += 1;
			if (report.status === "pending_review") acc.pendingReview += 1;
			if (report.status === "auto_revoked") acc.autoRevoked += 1;
			if (report.status === "manually_revoked") acc.manuallyRevoked += 1;
			if (report.status === "dismissed") acc.dismissed += 1;
			if (report.status === "duplicate") acc.duplicate += 1;
			return acc;
		},
		{
			total: 0,
			pendingReview: 0,
			autoRevoked: 0,
			manuallyRevoked: 0,
			dismissed: 0,
			duplicate: 0,
		},
	);

	return { reports, summary };
}
