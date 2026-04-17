import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import {
    DEFAULT_AUTH_ERROR_MESSAGE,
    buildAuthErrorRedirectUrl,
    resolveCallbackErrorMessage,
} from '@/lib/auth/errorMessage'
import { sanitizeReturnUrl } from '@/lib/auth/return-url'
import { classifyAuthMethodFromSession } from '@/lib/auth/method'
import { evaluateTeamSsoEnforcementNoop } from '@/lib/auth/ssoEnforcement'
import { Resend } from 'resend'

function makeSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

function deriveFirstName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return ''
    return trimmed.split(/\s+/)[0] ?? ''
}

function maskEmailForWebhook(email: string | null): string {
    if (!email) return 'unknown'
    const atIndex = email.indexOf('@')
    if (atIndex <= 0 || atIndex === email.length - 1) return 'unknown'
    const localPart = email.slice(0, atIndex)
    const domain = email.slice(atIndex + 1)
    const maskedLocal = `${localPart[0]}${'*'.repeat(Math.max(1, localPart.length - 1))}`
    return `${maskedLocal}@${domain}`
}

async function sendSignupWelcomeEmail(args: {
    email: string
    displayName: string
}) {
    const apiKey = String(process.env.RESEND_API_KEY ?? '').trim()
    if (!apiKey) return

    const from = String(process.env.RESEND_FROM_EMAIL ?? '').trim() || 'AI Stats <noreply@phaseo.app>'
    const subject = String(process.env.RESEND_WELCOME_SUBJECT ?? '').trim() || 'Welcome to AI Stats'
    const templateId = String(process.env.RESEND_WELCOME_TEMPLATE_ID ?? '').trim() || 'welcome-email'
    const firstName = deriveFirstName(args.displayName)
    const dashboardUrl = String(process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || 'https://www.aistats.com'
    const getStartedUrl = `${dashboardUrl.replace(/\/+$/, '')}/settings/keys`
    const docsUrl = `${dashboardUrl.replace(/\/+$/, '')}/help`
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
        from,
        to: args.email,
        subject,
        template: {
            id: templateId,
            variables: {
                user_first_name: firstName || '',
                welcome_heading: firstName ? `Welcome, ${firstName}` : 'Welcome',
                app_name: 'AI Stats',
                providers_count: 14,
                models_count: 300,
                endpoints_count: 9,
                gateway_base_url: 'https://api.ai-stats.io',
                example_model: 'openai/gpt-4.1-mini',
                dashboard_url: dashboardUrl,
                quickstart_url: getStartedUrl,
                docs_url: docsUrl,
                support_email: 'support@aistats.com',
            },
        },
    })

    if (error) {
        throw new Error(`resend_error:${error.name}:${error.message}`)
    }
}

async function sendSignupDiscordWebhook(args: {
    userId: string
    email: string | null
    createdAtIso: string
}) {
    const webhookUrl = String(process.env.DISCORD_SIGNUP_WEBHOOK_URL ?? '').trim()
    if (!webhookUrl) return

    const maskedEmail = maskEmailForWebhook(args.email)

    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content: [
                'New AI Stats signup',
                `- user_id: \`${args.userId}\``,
                `- email: \`${maskedEmail}\``,
                `- created_at: \`${args.createdAtIso}\``,
            ].join('\n'),
            allowed_mentions: { parse: [] },
        }),
    })

    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`discord_webhook_error:${res.status}:${detail || res.statusText}`)
    }
}

function buildHashPreservingAuthErrorResponse(requestUrl: string) {
    const fallbackUrl = buildAuthErrorRedirectUrl(requestUrl, DEFAULT_AUTH_ERROR_MESSAGE)
    const fallbackPath = `${fallbackUrl.pathname}${fallbackUrl.search}`
    const errorPath = fallbackUrl.pathname

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting...</title>
    <noscript>
      <meta http-equiv="refresh" content="0;url=${fallbackPath}" />
    </noscript>
  </head>
  <body>
    <script>
      (function () {
        try {
          var rawHash = window.location.hash || '';
          var normalizedHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
          var params = new URLSearchParams(normalizedHash);
          var hasAuthError =
            !!params.get('error') ||
            !!params.get('error_code') ||
            !!params.get('error_description');

          var target = hasAuthError && normalizedHash
            ? ${JSON.stringify(errorPath)} + '#' + normalizedHash
            : ${JSON.stringify(fallbackPath)};
          window.location.replace(target);
        } catch (_e) {
          window.location.replace(${JSON.stringify(fallbackPath)});
        }
      })();
    </script>
    <noscript>
      <p>Redirecting to the sign-in error page...</p>
      <p><a href="${fallbackPath}">Continue</a></p>
    </noscript>
  </body>
</html>`

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    })
}

async function ensureWalletRow(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    teamId: string
) {
    // Ensure a wallet exists per team. Stripe customer is now created lazily
    // when billing flows are first used.
    await supabaseAdmin.from('wallets').upsert(
        { team_id: teamId },
        {
            onConflict: 'team_id',
            ignoreDuplicates: true,
        }
    );
}

async function getOrCreatePersonalTeamId(opts: {
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    userId: string,
    displayName: string
}) {
    const { supabaseAdmin, userId, displayName } = opts;
    let createdPersonalTeam = false;
    const ensureOwnerMembership = async (teamId: string) => {
        await supabaseAdmin
            .from("team_members")
            .upsert(
                { team_id: teamId, user_id: userId, role: "owner" },
                { onConflict: "team_id,user_id", ignoreDuplicates: true }
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

    // 0) Ensure users row exists (no-op if present)
    await supabaseAdmin
        .from('users')
        .upsert({ user_id: userId, display_name: displayName }, { onConflict: 'user_id' });

    // 1) Reuse existing default team if set
    const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('default_team_id')
        .eq('user_id', userId)
        .maybeSingle();

    const defaultTeamId = String(userRow?.default_team_id ?? "").trim();
    if (defaultTeamId) {
        if (await hasTeamAccess(defaultTeamId)) {
            return {
                teamId: defaultTeamId,
                createdPersonalTeam,
            }
        }

        // Stale or invalid default team pointer: clear it so we can recover.
        await supabaseAdmin
            .from("users")
            .update({ default_team_id: null })
            .eq("user_id", userId)
            .eq("default_team_id", defaultTeamId);

        console.warn("auth_callback_default_team_invalid", {
            userId,
            defaultTeamId,
        });
    }

    // 2) Reuse any existing owner team (from previous runs)
    const { data: ownedTeam } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (ownedTeam?.id) {
        await ensureOwnerMembership(ownedTeam.id);
        // backfill default_team_id
        await supabaseAdmin.from('users')
            .update({ default_team_id: ownedTeam.id })
            .eq('user_id', userId);
        return {
            teamId: ownedTeam.id as string,
            createdPersonalTeam,
        }
    }

    // 3) Reuse a prior "personal" team by slug pattern (if it exists).
    // Scope strictly to teams owned by this user to avoid cross-user attribution.
    const baseSlug = `${makeSlug(displayName)}-personal`;
    const { data: personalCandidate } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq("owner_user_id", userId)
        .ilike('slug', `${baseSlug}%`)
        .order('created_at', { ascending: true })
        .limit(1);

    if (personalCandidate && personalCandidate[0]?.id) {
        await ensureOwnerMembership(personalCandidate[0].id);
        await supabaseAdmin.from('users')
            .update({ default_team_id: personalCandidate[0].id })
            .eq('user_id', userId);
        return {
            teamId: personalCandidate[0].id as string,
            createdPersonalTeam,
        }
    }

    // 4) Create the team (slug collision-safe)
    let slugAttempt = baseSlug;
    let teamId: string | null = null;

    for (let i = 0; i < 3 && !teamId; i++) {
        const { data, error } = await supabaseAdmin
            .from('teams')
            .insert({ name: 'Personal', slug: slugAttempt, owner_user_id: userId })
            .select('id')
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
        // Unexpected error: have a final look for any team we own
        const { data: fallback } = await supabaseAdmin
            .from('teams')
            .select('id')
            .eq('owner_user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (fallback?.id) teamId = fallback.id as string;
    }

    if (!teamId) throw new Error('Could not obtain a team id');

    // 5) Ensure membership (no-op if exists)
    await ensureOwnerMembership(teamId);

    // 6) Backfill default_team_id (no-op if already set)
    await supabaseAdmin
        .from('users')
        .update({ default_team_id: teamId })
        .eq('user_id', userId)
        .is('default_team_id', null);

    return {
        teamId,
        createdPersonalTeam,
    };
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const type = url.searchParams.get('type')
    const returnUrl = sanitizeReturnUrl(url.searchParams.get('returnUrl'), "/");
    const callbackErrorMessage = resolveCallbackErrorMessage(url)

    if (callbackErrorMessage) {
        console.error('Auth callback provider error', {
            error: url.searchParams.get('error'),
            errorCode: url.searchParams.get('error_code'),
            errorDescription: url.searchParams.get('error_description'),
        })
        return NextResponse.redirect(buildAuthErrorRedirectUrl(request.url, callbackErrorMessage))
    }

    const supabaseUser = await createClient();

    // If this is an email sign-in callback, Supabase will have set a session cookie
    // so we can read the current user directly. For OAuth providers we must exchange
    // the code for a session first.
    if (type !== 'email') {
        if (!code) {
            console.error('Auth callback missing code', {
                search: url.search,
            })
            return buildHashPreservingAuthErrorResponse(request.url)
        }

        const { error: exchangeErr } = await supabaseUser.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
            console.error('Auth code exchange failed', {
                message: exchangeErr.message,
                status: (exchangeErr as { status?: number }).status,
                code: (exchangeErr as { code?: string }).code,
            })
            return NextResponse.redirect(
                buildAuthErrorRedirectUrl(request.url, exchangeErr.message || DEFAULT_AUTH_ERROR_MESSAGE)
            )
        }
    }

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user?.id) {
        console.error('Auth callback missing authenticated user after session exchange')
        if (type === 'email') {
            return buildHashPreservingAuthErrorResponse(request.url)
        }
        return NextResponse.redirect(buildAuthErrorRedirectUrl(request.url, DEFAULT_AUTH_ERROR_MESSAGE))
    }

    // Check if user has MFA enabled
    const { data: mfaData } = await supabaseUser.auth.mfa.listFactors();
    const hasMFAFactor = mfaData?.totp?.some((f) => f.status === 'verified');

    // Check current AAL (Authenticator Assurance Level)
    const { data: aalData } = await supabaseUser.auth.mfa.getAuthenticatorAssuranceLevel();

    // If user has MFA but hasn't completed verification yet, redirect to verify-mfa
    if (hasMFAFactor && aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
        return NextResponse.redirect(new URL('/auth/verify-mfa', url));
    }

    const displayName =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split('@')[0] ??
        'User';

    const supabaseAdmin = createAdminClient();

    // 1) Get or create team id BUT prefer reusing anything that already exists
    let teamId: string;
    let createdPersonalTeam = false;
    try {
        const provisionedTeam = await getOrCreatePersonalTeamId({
            supabaseAdmin,
            userId: user.id,
            displayName,
        });
        teamId = provisionedTeam.teamId;
        createdPersonalTeam = provisionedTeam.createdPersonalTeam;
    } catch (error) {
        console.error('Failed to provision personal team during auth callback', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.redirect(
            buildAuthErrorRedirectUrl(
                request.url,
                'Your account was created, but we could not finish setting up your workspace. Please contact support.'
            )
        )
    }

    // 2) Ensure wallet exists. Stripe customer is created lazily when needed.
    try {
        await ensureWalletRow(supabaseAdmin, teamId);
    } catch (error) {
        console.error('Failed to ensure wallet row during auth callback', {
            teamId,
            error: error instanceof Error ? error.message : String(error),
        })
    }

    // 3) Fire signup notifications once, directly from app code.
    if (createdPersonalTeam) {
        const notificationTasks: Promise<unknown>[] = []
        if (user.email) {
            notificationTasks.push(
                sendSignupWelcomeEmail({
                    email: user.email,
                    displayName,
                })
                    .catch((error) => {
                        console.error('Failed sending direct signup welcome email', {
                            userId: user.id,
                            teamId,
                            error: error instanceof Error ? error.message : String(error),
                        })
                    })
            )
        }

        notificationTasks.push(
            sendSignupDiscordWebhook({
                userId: user.id,
                email: user.email ?? null,
                createdAtIso: String(user.created_at ?? new Date().toISOString()),
            })
                .catch((error) => {
                    console.error('Failed sending direct signup Discord webhook', {
                        userId: user.id,
                        teamId,
                        error: error instanceof Error ? error.message : String(error),
                    })
                })
        )

        // Best-effort side effects; don't block auth callback redirect on external providers.
        void Promise.allSettled(notificationTasks)
    }

    // 4) If this team is enterprise + invoice mode but the invoice profile is not
    // enabled yet, route directly to billing onboarding.
    try {
        const { data: teamRow } = await supabaseAdmin
            .from("teams")
            .select("tier,billing_mode")
            .eq("id", teamId)
            .maybeSingle();

        const isEnterprise = String(teamRow?.tier ?? "").toLowerCase() === "enterprise";
        const isInvoiceMode = String(teamRow?.billing_mode ?? "wallet").toLowerCase() === "invoice";

        if (isEnterprise && isInvoiceMode) {
            const { data: profileRow } = await supabaseAdmin
                .from("team_invoice_profiles")
                .select("enabled")
                .eq("team_id", teamId)
                .maybeSingle();

            if (!profileRow?.enabled) {
                return NextResponse.redirect(new URL("/settings/credits/onboarding", url));
            }
        }
    } catch (error) {
        console.error('Failed invoice onboarding check during auth callback', {
            teamId,
            error: error instanceof Error ? error.message : String(error),
        })
        // Ignore onboarding redirect issues and continue to default destination.
    }

    try {
        const {
            data: { session },
        } = await supabaseUser.auth.getSession()
        await evaluateTeamSsoEnforcementNoop({
            teamId,
            userId: user.id,
            authMethod: classifyAuthMethodFromSession(session),
            source: "auth_callback",
        })
    } catch (error) {
        console.error('Failed deferred SSO enforcement hook during auth callback', {
            teamId,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        })
        // Hook is best-effort while scaffold is non-enforcing.
    }

    return NextResponse.redirect(new URL(returnUrl, url));
}

