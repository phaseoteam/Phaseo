import { NextResponse } from "next/server";
import { formatProviderOfferDisplayName } from "@/lib/providers/providerOffers";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

const IO_LOGGING_ENABLE_MIN_AVAILABLE_NANOS = 5_000_000_000;

type PrivacyGlobalSettings = {
	privacy_enable_paid_may_train?: boolean | null;
	privacy_enable_free_may_train?: boolean | null;
	privacy_enable_free_may_publish_prompts?: boolean | null;
	privacy_enable_input_output_logging?: boolean | null;
	privacy_zdr_only?: boolean | null;
	io_logging_enabled?: boolean | null;
	io_logging_retention_days?: number | null;
	io_logging_include_provider_payloads?: boolean | null;
	io_logging_billing_status?: string | null;
	io_logging_grace_until?: string | null;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
};

export type SettingsPrivacyInitialData = {
	activeProviderModels: Array<{
		apiModelId: string;
		internalModelId: string | null;
		providerId: string;
	}>;
	initialGlobal: PrivacyGlobalSettings | null;
	providers: Array<{
		id: string;
		name: string;
	}>;
	teamName: string | null;
	walletAvailableNanos: number;
	ioLoggingEnableMinAvailableNanos: number;
	workspaceId: string | null;
};

function toFiniteNumber(value: unknown, fallback = 0): number {
	const parsed = Number(value ?? "");
	return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			activeProviderModels: [],
			initialGlobal: null,
			providers: [],
			teamName: null,
			walletAvailableNanos: 0,
			ioLoggingEnableMinAvailableNanos: IO_LOGGING_ENABLE_MIN_AVAILABLE_NANOS,
			workspaceId: null,
		} satisfies SettingsPrivacyInitialData);
	}

	const [teamResult, settingsResult, walletResult, providersResult, activeProviderModelsResult] =
		await Promise.all([
			supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
			supabase
				.from("workspace_settings")
				.select(
					"privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_free_may_publish_prompts,privacy_enable_input_output_logging,privacy_zdr_only,io_logging_enabled,io_logging_retention_days,io_logging_include_provider_payloads,io_logging_billing_status,io_logging_grace_until,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed",
				)
				.eq("workspace_id", workspaceId)
				.maybeSingle(),
			supabase
				.from("wallets")
				.select("balance_nanos,reserved_nanos")
				.eq("workspace_id", workspaceId)
				.maybeSingle(),
			supabase
				.from("data_api_providers")
				.select("api_provider_id, api_provider_name, offer_label, offer_scope")
				.order("api_provider_name", { ascending: true }),
			supabase
				.from("data_api_provider_models")
				.select("provider_id, api_model_id, internal_model_id, is_active_gateway")
				.eq("is_active_gateway", true),
		]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (settingsResult.error) throw new Error(settingsResult.error.message);
	if (providersResult.error) throw new Error(providersResult.error.message);
	if (activeProviderModelsResult.error) {
		throw new Error(activeProviderModelsResult.error.message);
	}
	const walletRow = walletResult.error ? null : walletResult.data;
	const walletBalanceNanos = toFiniteNumber((walletRow as any)?.balance_nanos);
	const walletReservedNanos = toFiniteNumber((walletRow as any)?.reserved_nanos);
	const walletAvailableNanos = Math.max(0, walletBalanceNanos - walletReservedNanos);

	return NextResponse.json({
		activeProviderModels: (activeProviderModelsResult.data ?? []).map((row: any) => ({
			apiModelId: row.api_model_id as string,
			internalModelId: (row.internal_model_id as string | null) ?? null,
			providerId: row.provider_id as string,
		})),
		initialGlobal: (settingsResult.data as PrivacyGlobalSettings | null) ?? null,
		providers: (providersResult.data ?? []).map((provider: any) => ({
			id: provider.api_provider_id as string,
			name: formatProviderOfferDisplayName({
				providerId: (provider.api_provider_id as string) ?? null,
				providerName:
					(provider.api_provider_name as string) ??
					(provider.api_provider_id as string),
				offerLabel: (provider.offer_label as string | null) ?? null,
				offerScope:
					(provider.offer_scope as "global" | "regional" | "specialized" | null) ??
					null,
			}),
		})),
		teamName: (teamResult.data?.name as string | null) ?? null,
		walletAvailableNanos,
		ioLoggingEnableMinAvailableNanos: IO_LOGGING_ENABLE_MIN_AVAILABLE_NANOS,
		workspaceId,
	} satisfies SettingsPrivacyInitialData);
}
