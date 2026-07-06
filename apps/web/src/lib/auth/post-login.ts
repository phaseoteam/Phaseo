import type { Session, User } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createAdminClient } from "@/utils/supabase/admin";
import { classifyAuthMethodFromSession } from "@/lib/auth/method";
import { evaluateTeamSsoEnforcementNoop } from "@/lib/auth/ssoEnforcement";
import { sendAccountLifecycleDiscordWebhook } from "@/lib/auth/accountLifecycleDiscord";
import {
	isResendOnboardingAutomationsEnabled,
	sendUserCreatedEvent,
} from "@/lib/automations/resend-events";
import { ensureWorkspaceStripeWallet } from "@/lib/server/activeTeamStripe";
import type { createClient } from "@/utils/supabase/server";
import { shouldRedirectToOnboardingAfterLogin } from "@/lib/auth/post-login-onboarding";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type DeferredTaskRunner = (task: () => Promise<void>) => void;

type FinalizePostLoginInput = {
	supabaseUser: SupabaseServerClient;
	user?: User | null;
	session?: Session | null;
	returnUrl: string;
	source: "auth_callback" | "server_action";
	deferTask?: DeferredTaskRunner;
};

export type FinalizePostLoginResult = {
	redirectPath: string;
	workspaceId?: string;
	userId: string;
	createdPersonalTeam: boolean;
};

type PersonalWorkspaceProvisionResult = {
	workspaceId: string;
	createdPersonalTeam: boolean;
};

async function hasCompletedOnboarding(opts: {
	supabaseAdmin: ReturnType<typeof createAdminClient>;
	userId: string;
}): Promise<boolean | null> {
	const { data, error } = await opts.supabaseAdmin
		.from("users")
		.select("onboarding_completed_at")
		.eq("user_id", opts.userId)
		.maybeSingle();

	if (error) {
		const message = String(error.message ?? "").toLowerCase();
		if (message.includes("onboarding_completed_at")) return null;
		throw new Error(`onboarding_lookup_failed:${error.message}`);
	}

	return Boolean(data?.onboarding_completed_at);
}

function makeSlug(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50);
}

function deriveFirstName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "";
	return trimmed.split(/\s+/)[0] ?? "";
}

async function sendSignupWelcomeEmail(args: {
	email: string;
	displayName: string;
}) {
	const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
	if (!apiKey) return;

	const from =
		String(process.env.RESEND_FROM_EMAIL ?? "").trim() ||
		"Phaseo <noreply@phaseo.ai>";
	const subject =
		String(process.env.RESEND_WELCOME_SUBJECT ?? "").trim() ||
		"Welcome to Phaseo";
	const templateId =
		String(process.env.RESEND_WELCOME_TEMPLATE_ID ?? "").trim() ||
		"welcome-email";
	const firstName = deriveFirstName(args.displayName);
	const dashboardUrl =
		String(
			process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
		).trim() || "https://phaseo.ai";
	const getStartedUrl = `${dashboardUrl.replace(/\/+$/, "")}/settings/keys`;
	const docsUrl = `${dashboardUrl.replace(/\/+$/, "")}/help`;
	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send({
		from,
		to: args.email,
		subject,
		template: {
			id: templateId,
			variables: {
				user_first_name: firstName || "",
				welcome_heading: firstName ? `Welcome, ${firstName}` : "Welcome",
				app_name: "Phaseo",
				providers_count: 14,
				models_count: 300,
				endpoints_count: 9,
				gateway_base_url: "https://api.phaseo.ai/v1",
				example_model: "openai/gpt-4.1-mini",
				dashboard_url: dashboardUrl,
				quickstart_url: getStartedUrl,
				docs_url: docsUrl,
				support_email: "support@phaseo.ai",
			},
		},
	});

	if (error) {
		throw new Error(`resend_error:${error.name}:${error.message}`);
	}
}

async function sendSignupWelcomeNotification(args: {
	email: string;
	displayName: string;
	userId: string;
	workspaceId: string;
	source: "auth_callback" | "server_action";
	createdAtIso: string;
}) {
	if (!isResendOnboardingAutomationsEnabled()) {
		await sendSignupWelcomeEmail({
			email: args.email,
			displayName: args.displayName,
		});
		return;
	}

	const firstName = deriveFirstName(args.displayName);

	try {
		await sendUserCreatedEvent({
			email: args.email,
			payload: {
				userId: args.userId,
				workspaceId: args.workspaceId,
				displayName: args.displayName,
				firstName,
				source: args.source,
				createdAtIso: args.createdAtIso,
			},
		});
		return;
	} catch (automationError) {
		console.error("Failed sending onboarding automation signup event", {
			userId: args.userId,
			workspaceId: args.workspaceId,
			error:
				automationError instanceof Error
					? automationError.message
					: String(automationError),
		});
	}

	await sendSignupWelcomeEmail({
		email: args.email,
		displayName: args.displayName,
	});
}

async function sendSignupDiscordWebhook(args: {
	userId: string;
	email: string | null;
	createdAtIso: string;
}) {
	await sendAccountLifecycleDiscordWebhook({
		event: "signup",
		userId: args.userId,
		email: args.email,
		timestampIso: args.createdAtIso,
	});
}

async function ensureWalletRow(
	workspaceId: string,
	userId: string,
	email: string | null | undefined,
	displayName: string,
) {
	await ensureWorkspaceStripeWallet({
		workspaceId,
		userId,
		email: email ?? undefined,
		name: displayName,
	});
}

async function legacyGetOrCreatePersonalWorkspace(opts: {
	supabaseAdmin: ReturnType<typeof createAdminClient>;
	userId: string;
	displayName: string;
}): Promise<PersonalWorkspaceProvisionResult> {
	const { supabaseAdmin, userId, displayName } = opts;
	let createdPersonalTeam = false;

	const ensureOwnerMembership = async (workspaceId: string) => {
		await supabaseAdmin.from("workspace_members").upsert(
			{ workspace_id: workspaceId, user_id: userId, role: "owner" },
			{ onConflict: "workspace_id,user_id", ignoreDuplicates: true },
		);
	};

	const ensureWorkspaceSettings = async (workspaceId: string) => {
		await supabaseAdmin
			.from("workspace_settings")
			.upsert({ workspace_id: workspaceId }, { onConflict: "workspace_id" });
	};

	const hasTeamAccess = async (workspaceId: string): Promise<boolean> => {
		if (!workspaceId) return false;

		const { data: membershipRow, error: membershipErr } = await supabaseAdmin
			.from("workspace_members")
			.select("workspace_id")
			.eq("workspace_id", workspaceId)
			.eq("user_id", userId)
			.maybeSingle();
		if (membershipErr) {
			throw new Error(`membership_lookup_failed:${membershipErr.message}`);
		}
		if (membershipRow?.workspace_id) return true;

		const { data: teamRow, error: teamErr } = await supabaseAdmin
			.from("workspaces")
			.select("id,owner_user_id")
			.eq("id", workspaceId)
			.maybeSingle();
		if (teamErr) {
			throw new Error(`team_lookup_failed:${teamErr.message}`);
		}
		if (!teamRow?.id) return false;

		const isOwner = String(teamRow.owner_user_id ?? "") === userId;
		if (!isOwner) return false;

		await ensureOwnerMembership(workspaceId);
		return true;
	};

	await supabaseAdmin
		.from("users")
		.upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });

	const { data: userRow } = await supabaseAdmin
		.from("users")
		.select("default_workspace_id")
		.eq("user_id", userId)
		.maybeSingle();

	const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim();
	if (defaultWorkspaceId) {
		if (await hasTeamAccess(defaultWorkspaceId)) {
			await ensureWorkspaceSettings(defaultWorkspaceId);
			return { workspaceId: defaultWorkspaceId, createdPersonalTeam };
		}

		await supabaseAdmin
			.from("users")
			.update({ default_workspace_id: null })
			.eq("user_id", userId)
			.eq("default_workspace_id", defaultWorkspaceId);

		console.warn("post_login_default_workspace_invalid", {
			userId,
			defaultWorkspaceId,
		});
	}

	const { data: ownedTeam } = await supabaseAdmin
		.from("workspaces")
		.select("id")
		.eq("owner_user_id", userId)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();

	if (ownedTeam?.id) {
		await ensureOwnerMembership(ownedTeam.id);
		await ensureWorkspaceSettings(ownedTeam.id);
		await supabaseAdmin
			.from("users")
			.update({ default_workspace_id: ownedTeam.id })
			.eq("user_id", userId);
		return {
			workspaceId: ownedTeam.id as string,
			createdPersonalTeam,
		};
	}

	const baseSlug = `${makeSlug(displayName)}-personal`;
	const { data: personalCandidate } = await supabaseAdmin
		.from("workspaces")
		.select("id")
		.eq("owner_user_id", userId)
		.ilike("slug", `${baseSlug}%`)
		.order("created_at", { ascending: true })
		.limit(1);

	if (personalCandidate && personalCandidate[0]?.id) {
		await ensureOwnerMembership(personalCandidate[0].id);
		await ensureWorkspaceSettings(personalCandidate[0].id);
		await supabaseAdmin
			.from("users")
			.update({ default_workspace_id: personalCandidate[0].id })
			.eq("user_id", userId);
		return {
			workspaceId: personalCandidate[0].id as string,
			createdPersonalTeam,
		};
	}

	let slugAttempt = baseSlug;
	let workspaceId: string | null = null;

	for (let i = 0; i < 3 && !workspaceId; i += 1) {
		const { data, error } = await supabaseAdmin
			.from("workspaces")
			.insert({ name: "Personal", slug: slugAttempt, owner_user_id: userId })
			.select("id")
			.single();

		if (data?.id) {
			workspaceId = data.id as string;
			createdPersonalTeam = true;
			break;
		}

		if (error && /duplicate|unique/i.test(error.message)) {
			slugAttempt = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
			continue;
		}

		const { data: fallback } = await supabaseAdmin
			.from("workspaces")
			.select("id")
			.eq("owner_user_id", userId)
			.order("created_at", { ascending: true })
			.limit(1)
			.maybeSingle();
		if (fallback?.id) workspaceId = fallback.id as string;
	}

	if (!workspaceId) {
		throw new Error("Could not obtain a workspace id");
	}

	await ensureOwnerMembership(workspaceId);
	await ensureWorkspaceSettings(workspaceId);

	await supabaseAdmin
		.from("users")
		.update({ default_workspace_id: workspaceId })
		.eq("user_id", userId)
		.is("default_workspace_id", null);

	return {
		workspaceId,
		createdPersonalTeam,
	};
}

async function provisionPersonalWorkspace(opts: {
	supabaseAdmin: ReturnType<typeof createAdminClient>;
	userId: string;
	displayName: string;
}): Promise<PersonalWorkspaceProvisionResult> {
	const { supabaseAdmin, userId, displayName } = opts;
	const { data, error } = await supabaseAdmin.rpc("provision_personal_workspace", {
		p_user_id: userId,
		p_display_name: displayName,
	});

	if (error) {
		const message = String(error.message ?? "");
		const missingRpc =
			message.includes("provision_personal_workspace") &&
			message.toLowerCase().includes("schema cache");
		if (!missingRpc) {
			throw new Error(`provision_personal_workspace_failed:${message || "unknown"}`);
		}

		console.warn(
			"[post-login] provision_personal_workspace rpc unavailable, falling back to legacy provisioning",
			{ userId },
		);
		return legacyGetOrCreatePersonalWorkspace(opts);
	}

	const row = Array.isArray(data) ? (data[0] ?? null) : data;
	const workspaceId = String((row as any)?.workspace_id ?? "").trim();
	if (!workspaceId) {
		throw new Error("provision_personal_workspace_empty");
	}

	return {
		workspaceId,
		createdPersonalTeam: Boolean((row as any)?.created_workspace),
	};
}

export async function finalizePostLogin(
	input: FinalizePostLoginInput,
): Promise<FinalizePostLoginResult> {
	const user =
		input.user ??
		(
			await input.supabaseUser.auth.getUser()
		).data.user;
	if (!user?.id) {
		throw new Error("AUTHENTICATED_USER_MISSING");
	}

	const { data: mfaData } = await input.supabaseUser.auth.mfa.listFactors();
	const hasMFAFactor = mfaData?.totp?.some((f) => f.status === "verified");
	const { data: aalData } =
		await input.supabaseUser.auth.mfa.getAuthenticatorAssuranceLevel();
	if (
		hasMFAFactor &&
		aalData?.currentLevel === "aal1" &&
		aalData?.nextLevel === "aal2"
	) {
		return {
			redirectPath: "/auth/verify-mfa",
			userId: user.id,
			createdPersonalTeam: false,
		};
	}

	const displayName =
		user.user_metadata?.full_name ??
		user.user_metadata?.name ??
		user.email?.split("@")[0] ??
		"User";

	const supabaseAdmin = createAdminClient();

	const provisionedTeam = await provisionPersonalWorkspace({
		supabaseAdmin,
		userId: user.id,
		displayName,
	});
	const workspaceId = provisionedTeam.workspaceId;

	try {
		await ensureWalletRow(
			workspaceId,
			user.id,
			user.email,
			displayName,
		);
	} catch (error) {
		console.error("Failed to ensure wallet row during post-login finalize", {
			source: input.source,
			workspaceId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	if (provisionedTeam.createdPersonalTeam) {
		const notificationTasks: Promise<unknown>[] = [];

		if (user.email) {
			notificationTasks.push(
				sendSignupWelcomeNotification({
					email: user.email,
					displayName,
					userId: user.id,
					workspaceId,
					source: input.source,
					createdAtIso: String(user.created_at ?? new Date().toISOString()),
				}).catch((error) => {
					console.error("Failed sending signup onboarding notification", {
						source: input.source,
						userId: user.id,
						workspaceId,
						error: error instanceof Error ? error.message : String(error),
					});
				}),
			);
		}

		notificationTasks.push(
			sendSignupDiscordWebhook({
				userId: user.id,
				email: user.email ?? null,
				createdAtIso: String(user.created_at ?? new Date().toISOString()),
			}).catch((error) => {
				console.error("Failed sending direct signup Discord webhook", {
					source: input.source,
					userId: user.id,
					workspaceId,
					error: error instanceof Error ? error.message : String(error),
				});
			}),
		);

		if (input.deferTask) {
			input.deferTask(async () => {
				await Promise.allSettled(notificationTasks);
			});
		} else {
			await Promise.allSettled(notificationTasks);
		}
	}

	try {
		const session =
			input.session ??
			(
				await input.supabaseUser.auth.getSession()
			).data.session;
		await evaluateTeamSsoEnforcementNoop({
			workspaceId,
			userId: user.id,
			authMethod: classifyAuthMethodFromSession(session),
			source: input.source,
		});
	} catch (error) {
		console.error("Failed deferred SSO enforcement hook during post-login finalize", {
			source: input.source,
			workspaceId,
			userId: user.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	let onboardingComplete: boolean | null = null;
	if (provisionedTeam.createdPersonalTeam && input.returnUrl === "/") {
		try {
			onboardingComplete = await hasCompletedOnboarding({
				supabaseAdmin,
				userId: user.id,
			});
		} catch (error) {
			console.error("Failed to check onboarding status during post-login", {
				source: input.source,
				workspaceId,
				userId: user.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	const shouldShowOnboarding = shouldRedirectToOnboardingAfterLogin({
		returnUrl: input.returnUrl,
		onboardingComplete,
		createdPersonalTeam: provisionedTeam.createdPersonalTeam,
	});

	const redirectPath = shouldShowOnboarding ? "/onboarding" : input.returnUrl;

	return {
		redirectPath,
		workspaceId,
		userId: user.id,
		createdPersonalTeam: provisionedTeam.createdPersonalTeam,
	};
}
