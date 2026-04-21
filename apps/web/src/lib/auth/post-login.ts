import type { Session, User } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createAdminClient } from "@/utils/supabase/admin";
import { classifyAuthMethodFromSession } from "@/lib/auth/method";
import { evaluateTeamSsoEnforcementNoop } from "@/lib/auth/ssoEnforcement";
import type { createClient } from "@/utils/supabase/server";

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
	teamId?: string;
	userId: string;
};

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

function maskEmailForWebhook(email: string | null): string {
	if (!email) return "unknown";
	const atIndex = email.indexOf("@");
	if (atIndex <= 0 || atIndex === email.length - 1) return "unknown";
	const localPart = email.slice(0, atIndex);
	const domain = email.slice(atIndex + 1);
	const maskedLocal = `${localPart[0]}${"*".repeat(
		Math.max(1, localPart.length - 1),
	)}`;
	return `${maskedLocal}@${domain}`;
}

async function sendSignupWelcomeEmail(args: {
	email: string;
	displayName: string;
}) {
	const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
	if (!apiKey) return;

	const from =
		String(process.env.RESEND_FROM_EMAIL ?? "").trim() ||
		"AI Stats <noreply@phaseo.app>";
	const subject =
		String(process.env.RESEND_WELCOME_SUBJECT ?? "").trim() ||
		"Welcome to AI Stats";
	const templateId =
		String(process.env.RESEND_WELCOME_TEMPLATE_ID ?? "").trim() ||
		"welcome-email";
	const firstName = deriveFirstName(args.displayName);
	const dashboardUrl =
		String(
			process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
		).trim() || "https://www.aistats.com";
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
				app_name: "AI Stats",
				providers_count: 14,
				models_count: 300,
				endpoints_count: 9,
				gateway_base_url: "https://api.ai-stats.io",
				example_model: "openai/gpt-4.1-mini",
				dashboard_url: dashboardUrl,
				quickstart_url: getStartedUrl,
				docs_url: docsUrl,
				support_email: "support@aistats.com",
			},
		},
	});

	if (error) {
		throw new Error(`resend_error:${error.name}:${error.message}`);
	}
}

async function sendSignupDiscordWebhook(args: {
	userId: string;
	email: string | null;
	createdAtIso: string;
}) {
	const webhookUrl = String(process.env.DISCORD_SIGNUP_WEBHOOK_URL ?? "").trim();
	if (!webhookUrl) return;

	const maskedEmail = maskEmailForWebhook(args.email);

	const res = await fetch(webhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			content: [
				"New AI Stats signup",
				`- user_id: \`${args.userId}\``,
				`- email: \`${maskedEmail}\``,
				`- created_at: \`${args.createdAtIso}\``,
			].join("\n"),
			allowed_mentions: { parse: [] },
		}),
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(
			`discord_webhook_error:${res.status}:${detail || res.statusText}`,
		);
	}
}

async function ensureWalletRow(
	supabaseAdmin: ReturnType<typeof createAdminClient>,
	teamId: string,
) {
	await supabaseAdmin.from("wallets").upsert(
		{ team_id: teamId },
		{
			onConflict: "team_id",
			ignoreDuplicates: true,
		},
	);
}

async function getOrCreatePersonalTeamId(opts: {
	supabaseAdmin: ReturnType<typeof createAdminClient>;
	userId: string;
	displayName: string;
}) {
	const { supabaseAdmin, userId, displayName } = opts;
	let createdPersonalTeam = false;

	const ensureOwnerMembership = async (teamId: string) => {
		await supabaseAdmin.from("team_members").upsert(
			{ team_id: teamId, user_id: userId, role: "owner" },
			{ onConflict: "team_id,user_id", ignoreDuplicates: true },
		);
	};

	const hasTeamAccess = async (teamId: string): Promise<boolean> => {
		if (!teamId) return false;

		const { data: membershipRow, error: membershipErr } = await supabaseAdmin
			.from("team_members")
			.select("team_id")
			.eq("team_id", teamId)
			.eq("user_id", userId)
			.maybeSingle();
		if (membershipErr) {
			throw new Error(`membership_lookup_failed:${membershipErr.message}`);
		}
		if (membershipRow?.team_id) return true;

		const { data: teamRow, error: teamErr } = await supabaseAdmin
			.from("teams")
			.select("id,owner_user_id")
			.eq("id", teamId)
			.maybeSingle();
		if (teamErr) {
			throw new Error(`team_lookup_failed:${teamErr.message}`);
		}
		if (!teamRow?.id) return false;

		const isOwner = String(teamRow.owner_user_id ?? "") === userId;
		if (!isOwner) return false;

		await ensureOwnerMembership(teamId);
		return true;
	};

	await supabaseAdmin
		.from("users")
		.upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });

	const { data: userRow } = await supabaseAdmin
		.from("users")
		.select("default_team_id")
		.eq("user_id", userId)
		.maybeSingle();

	const defaultTeamId = String(userRow?.default_team_id ?? "").trim();
	if (defaultTeamId) {
		if (await hasTeamAccess(defaultTeamId)) {
			return { teamId: defaultTeamId, createdPersonalTeam };
		}

		await supabaseAdmin
			.from("users")
			.update({ default_team_id: null })
			.eq("user_id", userId)
			.eq("default_team_id", defaultTeamId);

		console.warn("post_login_default_team_invalid", {
			userId,
			defaultTeamId,
		});
	}

	const { data: ownedTeam } = await supabaseAdmin
		.from("teams")
		.select("id")
		.eq("owner_user_id", userId)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();

	if (ownedTeam?.id) {
		await ensureOwnerMembership(ownedTeam.id);
		await supabaseAdmin
			.from("users")
			.update({ default_team_id: ownedTeam.id })
			.eq("user_id", userId);
		return {
			teamId: ownedTeam.id as string,
			createdPersonalTeam,
		};
	}

	const baseSlug = `${makeSlug(displayName)}-personal`;
	const { data: personalCandidate } = await supabaseAdmin
		.from("teams")
		.select("id")
		.eq("owner_user_id", userId)
		.ilike("slug", `${baseSlug}%`)
		.order("created_at", { ascending: true })
		.limit(1);

	if (personalCandidate && personalCandidate[0]?.id) {
		await ensureOwnerMembership(personalCandidate[0].id);
		await supabaseAdmin
			.from("users")
			.update({ default_team_id: personalCandidate[0].id })
			.eq("user_id", userId);
		return {
			teamId: personalCandidate[0].id as string,
			createdPersonalTeam,
		};
	}

	let slugAttempt = baseSlug;
	let teamId: string | null = null;

	for (let i = 0; i < 3 && !teamId; i += 1) {
		const { data, error } = await supabaseAdmin
			.from("teams")
			.insert({ name: "Personal", slug: slugAttempt, owner_user_id: userId })
			.select("id")
			.single();

		if (data?.id) {
			teamId = data.id as string;
			createdPersonalTeam = true;
			break;
		}

		if (error && /duplicate|unique/i.test(error.message)) {
			slugAttempt = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
			continue;
		}

		const { data: fallback } = await supabaseAdmin
			.from("teams")
			.select("id")
			.eq("owner_user_id", userId)
			.order("created_at", { ascending: true })
			.limit(1)
			.maybeSingle();
		if (fallback?.id) teamId = fallback.id as string;
	}

	if (!teamId) {
		throw new Error("Could not obtain a team id");
	}

	await ensureOwnerMembership(teamId);

	await supabaseAdmin
		.from("users")
		.update({ default_team_id: teamId })
		.eq("user_id", userId)
		.is("default_team_id", null);

	return {
		teamId,
		createdPersonalTeam,
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
		return { redirectPath: "/auth/verify-mfa", userId: user.id };
	}

	const displayName =
		user.user_metadata?.full_name ??
		user.user_metadata?.name ??
		user.email?.split("@")[0] ??
		"User";

	const supabaseAdmin = createAdminClient();

	const provisionedTeam = await getOrCreatePersonalTeamId({
		supabaseAdmin,
		userId: user.id,
		displayName,
	});
	const teamId = provisionedTeam.teamId;

	try {
		await ensureWalletRow(supabaseAdmin, teamId);
	} catch (error) {
		console.error("Failed to ensure wallet row during post-login finalize", {
			source: input.source,
			teamId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	if (provisionedTeam.createdPersonalTeam) {
		const notificationTasks: Promise<unknown>[] = [];

		if (user.email) {
			notificationTasks.push(
				sendSignupWelcomeEmail({
					email: user.email,
					displayName,
				}).catch((error) => {
					console.error("Failed sending direct signup welcome email", {
						source: input.source,
						userId: user.id,
						teamId,
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
					teamId,
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
		const { data: teamRow } = await supabaseAdmin
			.from("teams")
			.select("tier,billing_mode")
			.eq("id", teamId)
			.maybeSingle();

		const isEnterprise =
			String(teamRow?.tier ?? "").toLowerCase() === "enterprise";
		const isInvoiceMode =
			String(teamRow?.billing_mode ?? "wallet").toLowerCase() === "invoice";

		if (isEnterprise && isInvoiceMode) {
			const { data: profileRow } = await supabaseAdmin
				.from("team_invoice_profiles")
				.select("enabled")
				.eq("team_id", teamId)
				.maybeSingle();

			if (!profileRow?.enabled) {
				return {
					redirectPath: "/settings/credits/onboarding",
					teamId,
					userId: user.id,
				};
			}
		}
	} catch (error) {
		console.error("Failed invoice onboarding check during post-login finalize", {
			source: input.source,
			teamId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	try {
		const session =
			input.session ??
			(
				await input.supabaseUser.auth.getSession()
			).data.session;
		await evaluateTeamSsoEnforcementNoop({
			teamId,
			userId: user.id,
			authMethod: classifyAuthMethodFromSession(session),
			source: input.source,
		});
	} catch (error) {
		console.error("Failed deferred SSO enforcement hook during post-login finalize", {
			source: input.source,
			teamId,
			userId: user.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return {
		redirectPath: input.returnUrl,
		teamId,
		userId: user.id,
	};
}
