import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import {
    DEFAULT_AUTH_ERROR_MESSAGE,
    buildAuthErrorRedirectUrl,
    resolveCallbackErrorMessage,
} from '@/lib/auth/errorMessage'

function makeSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
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

    if (userRow?.default_team_id) return userRow.default_team_id as string;

    // 2) Reuse any existing owner team (from previous runs)
    const { data: ownedTeam } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (ownedTeam?.id) {
        // backfill default_team_id if missing
        await supabaseAdmin.from('users')
            .update({ default_team_id: ownedTeam.id })
            .eq('user_id', userId)
            .is('default_team_id', null);
        return ownedTeam.id as string;
    }

    // 3) Reuse a prior "personal" team by slug pattern (if it exists)
    const baseSlug = `${makeSlug(displayName)}-personal`;
    const { data: personalCandidate } = await supabaseAdmin
        .from('teams')
        .select('id')
        .ilike('slug', `${baseSlug}%`)
        .order('created_at', { ascending: true })
        .limit(1);

    if (personalCandidate && personalCandidate[0]?.id) {
        await supabaseAdmin.from('users')
            .update({ default_team_id: personalCandidate[0].id })
            .eq('user_id', userId)
            .is('default_team_id', null);
        return personalCandidate[0].id as string;
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
    await supabaseAdmin
        .from('team_members')
        .upsert({ team_id: teamId, user_id: userId, role: 'owner' }, {
            onConflict: 'team_id,user_id',
            ignoreDuplicates: true
        });

    // 6) Backfill default_team_id (no-op if already set)
    await supabaseAdmin
        .from('users')
        .update({ default_team_id: teamId })
        .eq('user_id', userId)
        .is('default_team_id', null);

    return teamId;
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const type = url.searchParams.get('type')
    const returnUrl = "/";
    const callbackErrorMessage = resolveCallbackErrorMessage(url)

    if (callbackErrorMessage) {
        const error = url.searchParams.get('error')
        const payload = {
            error,
            errorCode: url.searchParams.get('error_code'),
            errorDescription: url.searchParams.get('error_description'),
        }
        if (error === 'access_denied') {
            console.info('Auth callback provider cancellation', payload)
        } else {
            console.error('Auth callback provider error', payload)
        }
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
            return NextResponse.redirect(buildAuthErrorRedirectUrl(request.url, DEFAULT_AUTH_ERROR_MESSAGE))
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
    try {
        teamId = await getOrCreatePersonalTeamId({ supabaseAdmin, userId: user.id, displayName });
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

    // 3) If this team is enterprise + invoice mode but the invoice profile is not
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

    return NextResponse.redirect(new URL(returnUrl, url));
}
