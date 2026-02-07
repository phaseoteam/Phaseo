import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

function makeSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

async function ensureStripeCustomerAndWallet(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    teamId: string,
    userId: string,
    email?: string,
    name?: string
) {
    // 1) If wallet exists with a customer, done.
    const { data: wallet } = await supabaseAdmin
        .from('wallets')
        .select('team_id, stripe_customer_id')
        .eq('team_id', teamId)
        .maybeSingle();

    if (wallet?.stripe_customer_id) return;

    const stripeSecret = process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return;
    const stripe = getStripe();

    // 2) Try to reuse an existing Stripe customer (avoid dupes if DB was wiped)
    // Prefer a metadata match, fall back to email (optional).
    let stripeCustomerId: string | undefined;

    try {
        // Search by metadata.team_id (requires Stripe search; it's on by default for most accounts)
        const search = await stripe.customers.search({
            query: `metadata['team_id']:'${teamId}'`,
            limit: 1,
        });
        if (search.data.length) {
            stripeCustomerId = search.data[0].id;
        }
    } catch {
        // ignore if search isn't available; we'll create if needed
    }

    if (!stripeCustomerId && email) {
        const list = await stripe.customers.list({ email, limit: 1 });
        if (list.data.length) {
            stripeCustomerId = list.data[0].id;
            // Optionally patch metadata so future searches work
            try {
                await stripe.customers.update(stripeCustomerId, { metadata: { user_id: userId, team_id: teamId } });
            } catch {
                // Intentionally ignore errors when updating Stripe customer metadata
            }
        }
    }

    // 3) Create a customer only if we still don't have one
    if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: email || undefined,
            name: name || undefined,
            metadata: { user_id: userId, team_id: teamId },
        });
        stripeCustomerId = customer.id;
    }

    // 4) Upsert wallet (won't duplicate thanks to unique(team_id))
    await supabaseAdmin
        .from('wallets')
        .upsert({ team_id: teamId, stripe_customer_id: stripeCustomerId }, {
            onConflict: 'team_id',
            ignoreDuplicates: false, // we want to update stripe_customer_id if it was null
        });
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

    const supabaseUser = await createClient();

    // If this is an email sign-in callback, Supabase will have set a session cookie
    // so we can read the current user directly. For OAuth providers we must exchange
    // the code for a session first.
    if (type !== 'email') {
        if (!code) return NextResponse.redirect(new URL('/error', url))

        const { error: exchangeErr } = await supabaseUser.auth.exchangeCodeForSession(code);
        if (exchangeErr) return NextResponse.redirect(new URL('/error', url));
    }

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user?.id) return NextResponse.redirect(new URL('/error', url));

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
    } catch {
        return NextResponse.redirect(new URL('/error', url));
    }

    // 2) Ensure wallet + stripe customer only if missing
    try {
        await ensureStripeCustomerAndWallet(supabaseAdmin, teamId, user.id, user.email ?? undefined, displayName);
    } catch {
        // Handle error
    }

    return NextResponse.redirect(new URL('/', url));


}
