"use server"

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { OBFUSCATE_INFO_COOKIE, serializeObfuscateInfo } from '@/lib/obfuscation'
import { getStripe } from '@/lib/stripe'
import {
    hasRecentInteractiveAuthentication,
    hasRecentSignIn,
} from '@/lib/auth/method'
import { createClient as createSupabaseAuthClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normaliseCountryCode } from '@/lib/countryCodes'

export type PasskeyMutationFailure = {
    code:
        | 'fresh_sign_in_required'
        | 'incorrect_password'
        | 'invalid_request'
        | 'not_authenticated'
        | 'passkey_error'
    message: string
    ok: false
}

export type PasskeyMutationResult<T = undefined> =
    | { data: T; ok: true }
    | PasskeyMutationFailure

const passkeyChallengeIdSchema = z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)

const passkeyIdSchema = z.string().uuid()

const base64UrlSchema = z
    .string()
    .min(1)
    .max(131_072)
    .regex(/^[A-Za-z0-9_-]+$/)

const passkeyRegistrationCredentialSchema = z
    .object({
        authenticatorAttachment: z.string().max(64).optional(),
        clientExtensionResults: z.object({}).passthrough(),
        id: z.string().min(1).max(4096),
        rawId: z.string().min(1).max(4096),
        response: z
            .object({
                attestationObject: base64UrlSchema,
                clientDataJSON: base64UrlSchema,
            })
            .passthrough(),
        type: z.literal('public-key'),
    })
    .passthrough()

function userHasPassword(user: {
    app_metadata?: { provider?: unknown }
}) {
    const provider = String(user.app_metadata?.provider ?? '').toLowerCase()
    return !provider || provider === 'email'
}

async function hasRecentServerAuthentication(
    supabase: Awaited<ReturnType<typeof createClient>>,
    lastSignInAt: string | null | undefined
) {
    const { data, error } = await supabase.auth.getClaims()
    return (
        !error &&
        (hasRecentInteractiveAuthentication(
            data?.claims as Record<string, unknown> | undefined
        ) || hasRecentSignIn(lastSignInAt))
    )
}

async function requirePasskeyStepUp(
    supabase: Awaited<ReturnType<typeof createClient>>,
    currentPassword?: string
): Promise<
    | { ok: true; user: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']> }
    | { ok: false; result: PasskeyMutationFailure }
> {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const user = userData.user
    if (userError || !user) {
        return {
            ok: false,
            result: {
                code: 'not_authenticated',
                message: 'Your session has expired. Sign in again to continue.',
                ok: false,
            },
        }
    }

    const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError) {
        return {
            ok: false,
            result: {
                code: 'passkey_error',
                message: 'Could not verify your authentication level.',
                ok: false,
            },
        }
    }
    if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
        return {
            ok: false,
            result: {
                code: 'fresh_sign_in_required',
                message: 'Complete MFA verification before changing passkeys.',
                ok: false,
            },
        }
    }

    if (userHasPassword(user)) {
        if (!user.email || !currentPassword) {
            return {
                ok: false,
                result: {
                    code: 'incorrect_password',
                    message: 'Enter your current password.',
                    ok: false,
                },
            }
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseAnonKey) {
            return {
                ok: false,
                result: {
                    code: 'passkey_error',
                    message: 'Passkey verification is unavailable.',
                    ok: false,
                },
            }
        }

        // Verify the password without replacing or downgrading the user's
        // existing session (which may already be elevated to AAL2).
        const passwordVerifier = createSupabaseAuthClient(
            supabaseUrl,
            supabaseAnonKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        )
        const { data, error } = await passwordVerifier.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        })
        if (error || data.user?.id !== user.id) {
            return {
                ok: false,
                result: {
                    code: 'incorrect_password',
                    message: 'Current password is incorrect.',
                    ok: false,
                },
            }
        }
        return { ok: true, user }
    }

    if (!(await hasRecentServerAuthentication(supabase, user.last_sign_in_at))) {
        return {
            ok: false,
            result: {
                code: 'fresh_sign_in_required',
                message: 'Sign in again before changing passkeys.',
                ok: false,
            },
        }
    }

    return { ok: true, user }
}

async function requireSensitiveAccountStepUp(
    supabase: Awaited<ReturnType<typeof createClient>>,
    currentPassword?: string
) {
    const stepUp = await requirePasskeyStepUp(supabase, currentPassword)
    if (!stepUp.ok) throw new Error(stepUp.result.message)
    return stepUp.user
}

export async function startPasskeyRegistrationAction(
    currentPassword?: string
): Promise<
    PasskeyMutationResult<{
        challengeId: string
        options: unknown
    }>
> {
    const supabase = await createClient()
    const stepUp = await requirePasskeyStepUp(supabase, currentPassword)
    if (!stepUp.ok) return stepUp.result

    const { data, error } = await supabase.auth.passkey.startRegistration()
    if (error || !data) {
        return {
            code: 'passkey_error',
            message: 'Could not start passkey registration.',
            ok: false,
        }
    }

    return {
        data: {
            challengeId: data.challenge_id,
            options: data.options,
        },
        ok: true,
    }
}

export async function verifyPasskeyRegistrationAction(
    challengeId: unknown,
    credential: unknown,
    currentPassword?: string
): Promise<PasskeyMutationResult> {
    const parsedChallengeId = passkeyChallengeIdSchema.safeParse(challengeId)
    const parsedCredential =
        passkeyRegistrationCredentialSchema.safeParse(credential)
    if (!parsedChallengeId.success || !parsedCredential.success) {
        return {
            code: 'invalid_request',
            message: 'The passkey response was invalid.',
            ok: false,
        }
    }

    const supabase = await createClient()
    const stepUp = await requirePasskeyStepUp(supabase, currentPassword)
    if (!stepUp.ok) return stepUp.result

    type VerifyRegistrationParams = Parameters<
        typeof supabase.auth.passkey.verifyRegistration
    >[0]
    const { error } = await supabase.auth.passkey.verifyRegistration({
        challengeId: parsedChallengeId.data,
        credential:
            parsedCredential.data as VerifyRegistrationParams['credential'],
    })
    if (error) {
        return {
            code: 'passkey_error',
            message: 'Could not verify the new passkey.',
            ok: false,
        }
    }

    return { data: undefined, ok: true }
}

export async function deletePasskeyAction(
    passkeyId: unknown,
    currentPassword?: string
): Promise<PasskeyMutationResult> {
    const parsedPasskeyId = passkeyIdSchema.safeParse(passkeyId)
    if (!parsedPasskeyId.success) {
        return {
            code: 'invalid_request',
            message: 'The passkey identifier was invalid.',
            ok: false,
        }
    }

    const supabase = await createClient()
    const stepUp = await requirePasskeyStepUp(supabase, currentPassword)
    if (!stepUp.ok) return stepUp.result

    const { error } = await supabase.auth.passkey.delete({
        passkeyId: parsedPasskeyId.data,
    })
    if (error) {
        return {
            code: 'passkey_error',
            message: 'Could not remove passkey.',
            ok: false,
        }
    }

    return { data: undefined, ok: true }
}

export async function updateAccount(payload: {
    display_name?: string | null
    default_workspace_id?: string | null
    declared_country_code?: string | null
    obfuscate_info?: boolean
}) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData.user

    if (!authUser) {
        throw new Error('Not authenticated')
    }

    const toUpdate: any = {}
    if (payload.display_name !== undefined) toUpdate.display_name = payload.display_name
    if (payload.default_workspace_id !== undefined) toUpdate.default_workspace_id = payload.default_workspace_id
    if (payload.declared_country_code !== undefined) {
        const countryCode = normaliseCountryCode(payload.declared_country_code)
        if (!countryCode) throw new Error('Select a valid country')
        const { data: existingCountry, error: countryError } = await supabase
            .from('users')
            .select('declared_country_code')
            .eq('user_id', authUser.id)
            .maybeSingle()
        if (countryError) throw new Error(countryError.message)
        if (existingCountry?.declared_country_code !== countryCode) {
            toUpdate.declared_country_code = countryCode
            toUpdate.country_declared_at = new Date().toISOString()
        }
    }
    if (payload.obfuscate_info !== undefined) toUpdate.obfuscate_info = payload.obfuscate_info

    // Use a scoped UPDATE instead of upsert: the users table intentionally does
    // not grant authenticated users UPDATE access to the protected user_id key.
    if (Object.keys(toUpdate).length > 0) {
        const { error } = await supabase.from('users').update(toUpdate).eq('user_id', authUser.id)
        if (error) throw new Error(error.message)
    }
    if (payload.obfuscate_info !== undefined) {
        const cookieStore = await cookies()
        cookieStore.set(OBFUSCATE_INFO_COOKIE, serializeObfuscateInfo(payload.obfuscate_info), {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        })
    }

    revalidatePath('/settings/account')

    return { ok: true }
}
export async function deleteAccount(confirmation: string, currentPassword?: string) {
    if (confirmation.trim().toUpperCase() !== 'DELETE') throw new Error('Type DELETE to confirm account deletion')
    const supabase = await createClient()
    const authUser = await requireSensitiveAccountStepUp(supabase, currentPassword)
    const admin = createAdminClient()

    const { data: workspaceRows, error: workspaceError } = await admin
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', authUser.id)
    if (workspaceError) throw new Error(workspaceError.message)
    const workspaceIds = (workspaceRows ?? []).map((row: any) => String(row.id)).filter(Boolean)

    const keyRows = workspaceIds.length
        ? await admin.from('keys').select('id,kid').in('workspace_id', workspaceIds)
        : { data: [], error: null }
    if (keyRows.error) throw new Error(keyRows.error.message)
    const keyIds = (keyRows.data ?? []).map((row: any) => String(row.id)).filter(Boolean)
    const keyKids = (keyRows.data ?? []).map((row: any) => String(row.kid ?? '')).filter(Boolean)

    const walletRows = workspaceIds.length
        ? await admin.from('wallets').select('stripe_customer_id').in('workspace_id', workspaceIds)
        : { data: [], error: null }
    if (walletRows.error) throw new Error(walletRows.error.message)
    const stripeCustomerIds = Array.from(new Set(
        (walletRows.data ?? []).map((row: any) => String(row.stripe_customer_id ?? '').trim()).filter(Boolean)
    ))

    const { data: existingJob, error: existingJobError } = await admin
        .from('account_deletion_jobs')
        .select('id,deadline_at')
        .eq('user_id', authUser.id)
        .neq('status', 'completed')
        .maybeSingle()
    if (existingJobError) throw new Error(existingJobError.message)

    const deadlineAt = existingJob?.deadline_at ?? new Date(Date.now() + 30 * 86_400_000).toISOString()
    const jobMutation = existingJob
        ? admin.from('account_deletion_jobs').update({
            workspace_ids: workspaceIds,
            key_ids: keyIds,
            key_kids: keyKids,
            status: 'pending',
            lease_expires_at: null,
            last_error: null,
            updated_at: new Date().toISOString(),
        }).eq('id', existingJob.id).select('id').single()
        : admin.from('account_deletion_jobs').insert({
            user_id: authUser.id,
            workspace_ids: workspaceIds,
            key_ids: keyIds,
            key_kids: keyKids,
            deadline_at: deadlineAt,
        }).select('id').single()
    const { data: job, error: jobError } = await jobMutation
    if (jobError || !job?.id) throw new Error(jobError?.message ?? 'Could not queue account deletion')

    let authDeleted = false
    try {
        if (stripeCustomerIds.length > 0) {
            const stripe = getStripe()
            for (const customerId of stripeCustomerIds) {
                await stripe.customers.del(customerId)
            }
        }

        // Hard deletion removes Auth credentials and sessions. The database
        // cascade removes the public user, owned workspaces, and workspace data.
        const { error: deleteError } = await admin.auth.admin.deleteUser(authUser.id, false)
        if (deleteError) throw new Error(deleteError.message)
        authDeleted = true
    } catch (error) {
        if (!authDeleted) {
            await admin.from('account_deletion_jobs').delete().eq('id', job.id)
        }
        throw error
    }

    return { ok: true, deletionJobId: job.id, deadlineAt }
}

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

/**
 * Changes the user's password after verifying their current password.
 * Re-authenticates the user before allowing the password change.
 */
export async function changePasswordAction(
    currentPassword: string,
    newPassword: string
) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user?.email) {
        throw new Error('Not authenticated or no email found')
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    })

    if (signInError) {
        if (signInError.message?.includes('Invalid login credentials')) {
            throw new Error('Current password is incorrect')
        }
        throw new Error('Failed to verify current password')
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    })

    if (updateError) {
        if (updateError.message?.includes('rate limit')) {
            throw new Error(
                'Too many password change attempts. Please wait and try again.'
            )
        }
        throw new Error('Failed to update password')
    }

    revalidatePath('/settings/account')
    return { success: true }
}
/**
 * Changes the user's email address after verifying their password.
 * Supabase sends confirmation emails to both old and new addresses.
 */
export async function changeEmailAction(
    newEmail: string,
    currentPassword: string
) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user?.email) {
        throw new Error('Not authenticated or no email found')
    }

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    })

    if (signInError) {
        if (signInError.message?.includes('Invalid login credentials')) {
            throw new Error('Current password is incorrect')
        }
        throw new Error('Failed to verify current password')
    }

	const priorEmail = user.email.trim().toLowerCase()
	const identityResult = await createAdminClient()
		.from('resend_contact_identities')
		.upsert({ user_id: user.id, email: priorEmail }, { onConflict: 'user_id,email' })
	if (identityResult.error) {
		throw new Error('Failed to prepare email change')
	}

    // Update email (Supabase sends confirmation to both addresses)
    const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
    })

    if (updateError) {
        if (updateError.message?.includes('already registered')) {
            throw new Error('This email is already in use')
        }
        if (updateError.message?.includes('rate limit')) {
            throw new Error(
                'Too many email change attempts. Please wait and try again.'
            )
        }
        throw new Error('Failed to update email')
    }

    revalidatePath('/settings/account')
    return {
        success: true,
        message:
            'Confirmation emails sent to both your old and new email addresses',
    }
}

// ============================================================================
// MFA (MULTI-FACTOR AUTHENTICATION) MANAGEMENT
// ============================================================================

/**
 * Initiates MFA enrollment by generating a TOTP factor.
 * Returns QR code URI and secret for authenticator app setup.
 *
 * Uses a timestamp-based friendly name to ensure uniqueness for every enrollment attempt.
 */
export async function enrollMFAAction(currentPassword?: string) {
    const supabase = await createClient()
    await requireSensitiveAccountStepUp(supabase, currentPassword)

    // Generate truly unique friendly name using timestamp
    // This ensures no conflicts even for multiple attempts in the same day
    const friendlyName = `Authenticator ${Date.now()}`

    // Enroll MFA factor with unique name
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
    })

    if (error) {
        console.error('MFA enrollment error:', error)
        // Provide more helpful error message
        if (error.message?.includes('friendly name')) {
            throw new Error('An MFA enrollment is already in progress. Please refresh the page and try again.')
        }
        throw new Error('Failed to start MFA enrollment')
    }

    return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
    }
}

/**
 * Verifies the TOTP code during MFA enrollment.
 */
export async function verifyMFAEnrollmentAction(
    factorId: string,
    code: string,
    currentPassword?: string
) {
    if (!z.string().uuid().safeParse(factorId).success || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid MFA enrollment response')
    }
    const supabase = await createClient()
    await requireSensitiveAccountStepUp(supabase, currentPassword)
	const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
	const pendingFactor = factors?.totp?.find((factor) => factor.id === factorId && (factor as any).status === 'unverified')
	if (factorsError || !pendingFactor) throw new Error('MFA enrollment is not bound to this account')

    // Create challenge
    const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({
            factorId,
        })

    if (challengeError) {
        console.error('MFA challenge error:', challengeError)
        throw new Error('Failed to create MFA challenge')
    }

    // Verify code
    const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
    })

    if (verifyError) {
        if (verifyError.message?.includes('invalid') || verifyError.message?.includes('expired')) {
            throw new Error('Invalid or expired code. Please try again.')
        }
        console.error('MFA verify error:', verifyError)
        throw new Error('Failed to verify code')
    }

    // After successful verification, clean up any other unverified factors
    // This keeps the user's factor list clean
    try {
        const { data: allFactors } = await supabase.auth.mfa.listFactors()
        if (allFactors?.totp) {
            const cleanupPromises = allFactors.totp
                .filter(f => f.id !== factorId && (f as any).status === 'unverified')
                .map(f => supabase.auth.mfa.unenroll({ factorId: f.id }))
            await Promise.all(cleanupPromises)
        }
    } catch {
        // Ignore cleanup errors - non-critical
    }

	revalidatePath('/settings/account')
	revalidatePath('/settings/account/mfa')

	return {
        success: true,
    }
}

/**
 * Disables MFA for a user who has an AAL2 session.
 * Supabase requires AAL2 to remove an enrolled factor.
 */
export async function unenrollMFAAction(
    factorId: string
) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.currentLevel !== 'aal2') {
        throw new Error('Complete MFA verification before disabling MFA')
    }

    // Unenroll MFA
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
    })

    if (unenrollError) {
        console.error('MFA unenroll error:', unenrollError)
        throw new Error('Failed to disable MFA')
    }

	revalidatePath('/settings/account')
	revalidatePath('/settings/account/mfa')
	return { success: true }
}
/**
 * Cleans up any unverified MFA factors for the current user.
 * Used when user cancels MFA enrollment to keep their account tidy.
 *
 * Note: This is optional cleanup - unique friendly names prevent conflicts.
 */
export async function cleanupUnverifiedMFAAction() {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        return { success: false }
    }

    try {
        // Remove all unverified TOTP factors
        const { data: existingFactors } = await supabase.auth.mfa.listFactors()
        if (existingFactors?.totp) {
            const cleanupPromises = existingFactors.totp
                .filter(factor => (factor as any).status === 'unverified')
                .map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id }))

            await Promise.all(cleanupPromises)
        }
    } catch (error) {
        console.error('Cleanup error:', error)
        // Don't throw - cleanup is best-effort
    }

    return { success: true }
}
