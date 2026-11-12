import { z } from "zod";
import { request, workspaceCookie } from "./http";

const str = z.string().nullish();
const num = z.coerce.number().nullish();

const workspaceSchema = z.object({ id: z.string(), name: z.string().nullish(), role: z.string().nullish() }).passthrough();
export type Workspace = z.infer<typeof workspaceSchema>;

export async function getWorkspaces(): Promise<Workspace[]> {
  const raw = await request("/api/account/auth/workspaces", { auth: true });
  return z.object({ workspaces: z.array(workspaceSchema).default([]) }).parse(raw).workspaces;
}

/** The workspace the web would open: the requested one if accessible, else the user's default. */
export async function resolveWorkspace(requested?: string | null, persist = false): Promise<string | null> {
  const raw = await request("/api/account/auth/workspace", { auth: true, query: { requested: requested ?? undefined, persist: persist ? 1 : undefined } });
  return z.object({ workspaceId: z.string().nullish() }).passthrough().parse(raw).workspaceId ?? null;
}

export async function getBalance(workspaceId: string): Promise<number | null> {
  const raw = await request("/api/account/credits/balance", { auth: true, query: { workspaceId } });
  return z.object({ initialBalance: num }).passthrough().parse(raw).initialBalance ?? null;
}

const usageCellSchema = z.object({
  bucket: str,
  modelId: str,
  provider: str,
  keyId: str,
  appId: str,
  requests: z.coerce.number().default(0),
  successfulRequests: z.coerce.number().default(0),
  costNanos: z.coerce.number().default(0),
  tokens: z.coerce.number().default(0),
  inputTokens: z.coerce.number().default(0),
  outputTokens: z.coerce.number().default(0),
}).passthrough();

export type UsageCell = z.infer<typeof usageCellSchema>;

const usageWindowSchema = z.object({ from: z.string(), to: z.string(), cells: z.array(usageCellSchema).default([]) });

const usageOverviewSchema = z.object({
  current: usageWindowSchema,
  previous: usageWindowSchema,
  /** Always the last 7 days, whatever range was asked for. */
  recent: usageWindowSchema.nullish(),
  keys: z.array(z.object({ id: z.string(), name: str, prefix: str }).passthrough()).default([]),
  modelMetadataEntries: z.array(z.tuple([z.string(), z.object({ name: str }).passthrough()])).nullish(),
}).passthrough();

export type UsageOverview = z.infer<typeof usageOverviewSchema>;

export type UsageRange = { from: Date; to: Date; previousFrom: Date; previousTo: Date; bucket: "hour" | "day" };

export async function getUsageOverview(workspaceId: string, range: UsageRange, timeZone: string): Promise<UsageOverview | null> {
  const raw = await request<Record<string, unknown>>("/api/account/settings/usage/observability", {
    auth: true,
    query: {
      workspaceId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      previousFrom: range.previousFrom.toISOString(),
      previousTo: range.previousTo.toISOString(),
      bucket: range.bucket,
      timeZone,
    },
  });
  if (!raw?.current) return null;
  return usageOverviewSchema.parse(raw);
}

const memberSchema = z.object({ user_id: z.string(), role: str, display_name: str }).passthrough();
export type Member = z.infer<typeof memberSchema>;

const teamsSchema = z.object({
  teams: z.array(z.object({ id: z.string(), name: str, logoUrl: str }).passthrough()).default([]),
  membersByTeam: z.record(z.string(), z.array(memberSchema)).default({}),
  invitesByTeam: z.record(z.string(), z.array(z.unknown())).default({}),
  manageableTeamIds: z.array(z.string()).default([]),
  currentUserId: str,
}).passthrough();

export type Team = { members: Member[]; pendingInvites: number; logoUrl: string | null; currentUserId: string | null; canManage: boolean };

/** The workspace's members and pending invites, as the website's Members page lists them. */
export async function getTeam(workspaceId: string): Promise<Team> {
  const parsed = teamsSchema.parse(await request("/api/account/settings/teams", { auth: true, query: { workspaceId } }));
  return {
    members: parsed.membersByTeam[workspaceId] ?? [],
    pendingInvites: (parsed.invitesByTeam[workspaceId] ?? []).length,
    logoUrl: parsed.teams.find((team) => team.id === workspaceId)?.logoUrl ?? null,
    currentUserId: parsed.currentUserId ?? null,
    canManage: parsed.manageableTeamIds.includes(workspaceId),
  };
}

export async function getMembers(workspaceId: string): Promise<Member[]> {
  return (await getTeam(workspaceId)).members;
}

// ---- Credits & billing (the website's Settings → Credits) ----

const creditsSchema = z.object({
  initialBalance: num,
  latestPaymentSuccessAt: str,
  lowBalanceEmailEnabled: z.boolean().nullish(),
  lowBalanceEmailThresholdUsd: num,
  recentCreditSpend: z.object({ dailyNanos: z.coerce.number(), windowDays: z.coerce.number(), observedAt: z.coerce.number() }).nullish(),
  wallet: z.object({ auto_top_up_enabled: z.boolean().nullish(), low_balance_threshold: num, auto_top_up_amount: num }).passthrough().nullish(),
}).passthrough();

export type Credits = z.infer<typeof creditsSchema>;

export async function getCredits(workspaceId: string): Promise<Credits> {
  return creditsSchema.parse(await request("/api/account/settings/credits", { auth: true, query: { workspaceId } }));
}

const transactionSchema = z.object({
  id: z.coerce.string(),
  amount_nanos: z.coerce.number().default(0),
  created_at: str,
  status: str,
  kind: str,
  description: str,
}).passthrough();

export type CreditTransaction = z.infer<typeof transactionSchema>;

const transactionsSchema = z.object({
  billingMode: str,
  isEnterpriseInvoiceMode: z.boolean().default(false),
  transactions: z.array(transactionSchema).default([]),
  invoices: z.array(z.unknown()).default([]),
}).passthrough();

/** Top-ups, refunds, promo credit and adjustments (usage is left out, as on the website), newest first. */
export async function getCreditTransactions(workspaceId: string) {
  return transactionsSchema.parse(await request("/api/account/settings/credits/transactions", { auth: true, query: { workspaceId } }));
}

// ---- Workspace privacy (the website's Settings → Privacy) ----

/** The workspace-wide switches the website's privacy page shows, by the name its save request uses. */
export type PrivacyPatch = Partial<{
  privacyEnablePaidMayTrain: boolean;
  privacyEnableFreeMayTrain: boolean;
  privacyEnableInputOutputLogging: boolean;
  privacyZdrOnly: boolean;
  ioLoggingEnabled: boolean;
}>;

/**
 * Saves privacy switches the way the website does (owners and admins only). The request carries only the switches
 * being changed; the API writes just those columns and leaves every other setting as it is.
 */
export async function updateWorkspacePrivacy(workspaceId: string, patch: PrivacyPatch): Promise<void> {
  await request("/api/account/settings/guardrails/global", { method: "PUT", auth: true, body: { workspaceId, ...patch } });
}

const keySchema = z.object({
  id: z.string(),
  name: str,
  prefix: str,
  status: str,
  created_at: str,
  last_used_at: str,
}).passthrough();

export type GatewayKey = z.infer<typeof keySchema>;

export async function getKeys(workspaceId: string): Promise<GatewayKey[]> {
  const raw = await request("/api/account/settings/keys", { auth: true, query: { workspaceId } });
  const parsed = z.object({ teamsWithKeys: z.array(z.object({ id: str, keys: z.array(keySchema).default([]) }).passthrough()).default([]) }).passthrough().parse(raw);
  const team = parsed.teamsWithKeys.find((entry) => entry.id === workspaceId) ?? parsed.teamsWithKeys[0];
  return (team?.keys ?? []).filter((key) => key.name !== "__chat_route_managed_key__" && key.status !== "deleted");
}

export async function revokeKey(workspaceId: string, keyId: string): Promise<void> {
  await request(`/api/account/settings/keys/${encodeURIComponent(keyId)}`, { method: "DELETE", auth: true, query: { workspaceId } });
}

const privacyReviewSchema = z.object({
  version: z.string(),
  workspaceId: z.string(),
  workspaceName: str,
  reviewed: z.boolean(),
  policy: z.object({
    privacy_enable_paid_may_train: z.boolean().nullish(),
    privacy_enable_free_may_train: z.boolean().nullish(),
    privacy_enable_free_may_publish_prompts: z.boolean().nullish(),
    privacy_enable_input_output_logging: z.boolean().nullish(),
    privacy_zdr_only: z.boolean().nullish(),
    io_logging_enabled: z.boolean().nullish(),
    io_logging_retention_days: num,
    provider_restriction_mode: str,
    provider_restriction_provider_ids: z.array(z.string()).nullish(),
    model_restriction_mode: str,
    model_restriction_model_ids: z.array(z.string()).nullish(),
  }).passthrough().default({}),
}).passthrough();

export type ChatPrivacyReview = z.infer<typeof privacyReviewSchema>;

/** Web chat asks each user to confirm their workspace's privacy settings once before chatting. */
export async function getChatPrivacyReview(workspaceId: string | null): Promise<ChatPrivacyReview> {
  return privacyReviewSchema.parse(await request("/api/account/settings/privacy/review", { auth: true, headers: workspaceCookie(workspaceId) }));
}

export async function acceptChatPrivacyReview(workspaceId: string, version: string): Promise<void> {
  await request("/api/account/settings/privacy/review", { method: "POST", auth: true, body: { workspaceId, version, accepted: true } });
}
