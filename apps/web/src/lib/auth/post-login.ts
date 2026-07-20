import type { Session, User } from "@supabase/supabase-js";
import { Resend } from "resend";
import { classifyAuthMethodFromSession } from "@/lib/auth/method";
import { evaluateTeamSsoEnforcementNoop } from "@/lib/auth/ssoEnforcement";
import { sendAccountLifecycleDiscordWebhook } from "@/lib/auth/accountLifecycleDiscord";
import { isResendOnboardingAutomationsEnabled, sendUserCreatedEvent } from "@/lib/automations/resend-events";
import type { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
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
export type FinalizePostLoginResult = { redirectPath: string; workspaceId?: string; userId: string; createdPersonalTeam: boolean };

type PersonalWorkspaceProvisionResult = {
	workspaceId: string;
	createdPersonalTeam: boolean;
};

async function provisionPersonalWorkspace(args: {
	userId: string;
	displayName: string;
}): Promise<PersonalWorkspaceProvisionResult> {
	const admin = createAdminClient();
	const provisioned = await admin.rpc("provision_personal_workspace", {
		p_user_id: args.userId,
		p_display_name: args.displayName,
	});
	if (!provisioned.error) {
		const row = Array.isArray(provisioned.data) ? provisioned.data[0] : provisioned.data;
		const workspaceId = String((row as { workspace_id?: unknown } | null)?.workspace_id ?? "").trim();
		if (workspaceId) {
			return {
				workspaceId,
				createdPersonalTeam: Boolean((row as { created_workspace?: unknown } | null)?.created_workspace),
			};
		}
	}

	// The previous web-server implementation could recover accounts when the
	// workspace RPC was absent from PostgREST's schema cache. Keep that recovery
	// local to the authenticated Next server rather than sending login traffic
	// through the public Worker.
	const profileUpsert = await admin
		.from("users")
		.upsert({ user_id: args.userId, display_name: args.displayName }, { onConflict: "user_id" });
	if (profileUpsert.error) throw new Error(`post_login_profile_upsert_failed:${profileUpsert.error.message}`);

	const [profile, memberships, owned] = await Promise.all([
		admin.from("users").select("default_workspace_id").eq("user_id", args.userId).maybeSingle(),
		admin.from("workspace_members").select("workspace_id").eq("user_id", args.userId).order("workspace_id", { ascending: true }),
		admin.from("workspaces").select("id").eq("owner_user_id", args.userId).order("created_at", { ascending: true }),
	]);
	if (profile.error || memberships.error || owned.error) {
		throw new Error("post_login_workspace_lookup_failed");
	}

	const accessible = new Set([
		...(memberships.data ?? []).map((row) => String(row.workspace_id ?? "")),
		...(owned.data ?? []).map((row) => String(row.id ?? "")),
	].filter(Boolean));
	const preferred = String(profile.data?.default_workspace_id ?? "").trim();
	let workspaceId = (preferred && accessible.has(preferred) ? preferred : "") || [...accessible][0] || "";
	let createdPersonalTeam = false;

	if (!workspaceId) {
		const base = `${args.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "user"}-personal`;
		for (let attempt = 0; attempt < 3 && !workspaceId; attempt += 1) {
			const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`;
			const inserted = await admin.from("workspaces").insert({ name: "Personal", slug, owner_user_id: args.userId }).select("id").maybeSingle();
			if (inserted.data?.id) {
				workspaceId = String(inserted.data.id);
				createdPersonalTeam = true;
			} else if (!/duplicate|unique/i.test(String(inserted.error?.message ?? ""))) {
				throw new Error(`post_login_workspace_create_failed:${inserted.error?.message ?? "unknown"}`);
			}
		}
	}
	if (!workspaceId) throw new Error("post_login_workspace_missing");

	const [membership, settings, defaultWorkspace] = await Promise.all([
		admin.from("workspace_members").upsert({ workspace_id: workspaceId, user_id: args.userId, role: "owner" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true }),
		admin.from("workspace_settings").upsert({ workspace_id: workspaceId }, { onConflict: "workspace_id" }),
		admin.from("users").update({ default_workspace_id: workspaceId }).eq("user_id", args.userId),
	]);
	if (membership.error || settings.error || defaultWorkspace.error) throw new Error("post_login_workspace_finalize_failed");

	return { workspaceId, createdPersonalTeam };
}

function firstName(name: string): string { return name.trim().split(/\s+/)[0] ?? ""; }
async function sendSignupWelcomeEmail(args: { email: string; displayName: string }) {
	const apiKey = String(process.env.RESEND_API_KEY ?? "").trim(); if (!apiKey) return;
	const from = String(process.env.RESEND_FROM_EMAIL ?? "").trim() || "Phaseo <noreply@phaseo.ai>";
	const subject = String(process.env.RESEND_WELCOME_SUBJECT ?? "").trim() || "Welcome to Phaseo";
	const templateId = String(process.env.RESEND_WELCOME_TEMPLATE_ID ?? "").trim() || "welcome-email";
	const name = firstName(args.displayName);
	const dashboardUrl = String(process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim() || "https://phaseo.app";
	const { error } = await new Resend(apiKey).emails.send({ from, to: args.email, subject, template: { id: templateId, variables: { user_first_name: name, welcome_heading: name ? `Welcome, ${name}` : "Welcome", app_name: "Phaseo", providers_count: 14, models_count: 300, endpoints_count: 9, gateway_base_url: "https://api.phaseo.app/v1", example_model: "openai/gpt-4.1-mini", dashboard_url: dashboardUrl, quickstart_url: `${dashboardUrl.replace(/\/+$/, "")}/settings/keys`, docs_url: `${dashboardUrl.replace(/\/+$/, "")}/help`, support_email: "support@phaseo.ai" } } });
	if (error) throw new Error(`resend_error:${error.name}:${error.message}`);
}
async function sendSignupWelcomeNotification(args: { email: string; displayName: string; userId: string; workspaceId: string; source: "auth_callback" | "server_action"; createdAtIso: string }) {
	if (!isResendOnboardingAutomationsEnabled()) return sendSignupWelcomeEmail(args);
	try { await sendUserCreatedEvent({ email: args.email, payload: { userId: args.userId, workspaceId: args.workspaceId, displayName: args.displayName, firstName: firstName(args.displayName), source: args.source, createdAtIso: args.createdAtIso } }); }
	catch (error) { console.error("Failed sending onboarding automation signup event", { userId: args.userId, workspaceId: args.workspaceId, error: error instanceof Error ? error.message : String(error) }); await sendSignupWelcomeEmail(args); }
}

export async function finalizePostLogin(input: FinalizePostLoginInput): Promise<FinalizePostLoginResult> {
	const user = input.user ?? (await input.supabaseUser.auth.getUser()).data.user;
	if (!user?.id) throw new Error("AUTHENTICATED_USER_MISSING");
	const { data: mfaData } = await input.supabaseUser.auth.mfa.listFactors();
	const { data: aalData } = await input.supabaseUser.auth.mfa.getAuthenticatorAssuranceLevel();
	if (mfaData?.totp?.some((factor) => factor.status === "verified") && aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2") return { redirectPath: "/auth/verify-mfa", userId: user.id, createdPersonalTeam: false };
	const session = input.session ?? (await input.supabaseUser.auth.getSession()).data.session;
	const displayName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "User";
	const provisioned = await provisionPersonalWorkspace({ userId: user.id, displayName });
	if (provisioned.createdPersonalTeam) {
		const tasks: Promise<unknown>[] = [];
		if (user.email) tasks.push(sendSignupWelcomeNotification({ email: user.email, displayName, userId: user.id, workspaceId: provisioned.workspaceId, source: input.source, createdAtIso: String(user.created_at ?? new Date().toISOString()) }).catch((error) => console.error("Failed sending signup onboarding notification", { userId: user.id, error })));
		tasks.push(sendAccountLifecycleDiscordWebhook({ event: "signup", userId: user.id, email: user.email ?? null, timestampIso: String(user.created_at ?? new Date().toISOString()) }).catch((error) => console.error("Failed sending direct signup Discord webhook", { userId: user.id, error })));
		if (input.deferTask) input.deferTask(async () => { await Promise.allSettled(tasks); }); else await Promise.allSettled(tasks);
	}
	try { await evaluateTeamSsoEnforcementNoop({ workspaceId: provisioned.workspaceId, userId: user.id, authMethod: classifyAuthMethodFromSession(session), source: input.source }); }
	catch (error) { console.error("Failed deferred SSO enforcement hook during post-login finalize", { source: input.source, workspaceId: provisioned.workspaceId, userId: user.id, error: error instanceof Error ? error.message : String(error) }); }
	const redirectPath = shouldRedirectToOnboardingAfterLogin({ returnUrl: input.returnUrl, onboardingComplete: null, createdPersonalTeam: provisioned.createdPersonalTeam }) ? "/onboarding" : input.returnUrl;
	return { redirectPath, workspaceId: provisioned.workspaceId, userId: user.id, createdPersonalTeam: provisioned.createdPersonalTeam };
}
