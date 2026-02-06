"use server"

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateAccount(payload: {
    display_name?: string | null
    default_team_id?: string | null
    obfuscate_info?: boolean
}) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData.user

    if (!authUser) {
        throw new Error('Not authenticated')
    }

    const toUpsert: any = {}
    if (payload.display_name !== undefined) toUpsert.display_name = payload.display_name
    if (payload.default_team_id !== undefined) toUpsert.default_team_id = payload.default_team_id
    if (payload.obfuscate_info !== undefined) toUpsert.obfuscate_info = payload.obfuscate_info

    toUpsert.user_id = authUser.id

    const { error } = await supabase.from('users').upsert(toUpsert, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)

    revalidatePath('/settings/account')

    return { ok: true }
}

export async function deleteAccount() {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData.user

    if (!authUser) {
        throw new Error('Not authenticated')
    }

    await requireAAL2IfMFAEnabled(supabase)

    // Use admin client to delete the auth user (service role key required)
    const admin = createAdminClient()
    // supabase-js admin API exposes auth.admin.deleteUser
    // If this fails, throw so the client can show an error
    const { error } = await (admin as any).auth.admin.deleteUser(authUser.id)
    if (error) throw new Error(error.message)

    return { ok: true }
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

    await requireAAL2IfMFAEnabled(supabase)

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

    await requireAAL2IfMFAEnabled(supabase)

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
 */
export async function enrollMFAAction() {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

    await requireAAL2IfMFAEnabled(supabase)

    const friendlyName = `Authenticator ${Date.now()}`

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
    }
}

/**
 * Verifies the TOTP code during MFA enrollment.
 */
export async function verifyMFAEnrollmentAction(
    factorId: string,
    code: string
) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

    await requireAAL2IfMFAEnabled(supabase)

    const normalizedCode = code.trim()
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw new Error('Enter a valid 6-digit code')
    }

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
        code: normalizedCode,
    })

    if (verifyError) {
        if (
            verifyError.message?.toLowerCase().includes('invalid') ||
            verifyError.message?.toLowerCase().includes('expired')
        ) {
            throw new Error('Invalid or expired code. Please try again.')
        }
        console.error('MFA verify error:', verifyError)
        throw new Error('Failed to verify code')
    }

    // Keep the user's factor list clean by removing stale unverified factors.
    try {
        const { data: allFactors } = await supabase.auth.mfa.listFactors()
        if (allFactors?.totp) {
            const cleanupPromises = allFactors.totp
                .filter(f => f.id !== factorId && (f as any).status === 'unverified')
                .map(f => supabase.auth.mfa.unenroll({ factorId: f.id }))
            await Promise.all(cleanupPromises)
        }
    } catch (err) {
        // Ignore cleanup errors - non-critical.
    }

    revalidatePath('/settings/account')

    return { success: true }
}

/**
 * Disables a verified MFA factor after proving possession with a current TOTP code.
 */
export async function unenrollMFAAction(
    factorId: string,
    verificationCode: string
) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

    if (!/^\d{6}$/.test(verificationCode.trim())) {
        throw new Error('Enter a valid 6-digit authenticator code')
    }

    const { data: factorsData, error: factorsError } =
        await supabase.auth.mfa.listFactors()
    if (factorsError) {
        console.error('MFA factors lookup error:', factorsError)
        throw new Error('Failed to validate MFA factors')
    }

    const factor = factorsData?.totp?.find(
        (item) => item.id === factorId && item.status === 'verified'
    )
    if (!factor) {
        throw new Error('Selected MFA factor was not found')
    }

    // Supabase requires aal2 to unenroll. Challenge+verify first to elevate.
    const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({
            factorId,
        })
    if (challengeError) {
        console.error('MFA challenge error:', challengeError)
        throw new Error('Failed to verify your MFA factor')
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verificationCode.trim(),
    })
    if (verifyError) {
        if (
            verifyError.message?.toLowerCase().includes('invalid') ||
            verifyError.message?.toLowerCase().includes('expired')
        ) {
            throw new Error('Invalid or expired authenticator code')
        }
        console.error('MFA verify error:', verifyError)
        throw new Error('Failed to verify your MFA factor')
    }

    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
    })

    if (unenrollError) {
        console.error('MFA unenroll error:', unenrollError)
        throw new Error('Failed to disable MFA')
    }

    // Sync the auth cookie with the new assurance level.
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
        console.error('MFA refresh session error:', refreshError)
    }

    revalidatePath('/settings/account')
    return { success: true }
}

/**
 * Cleans up any unverified MFA factors for the current user.
 * Used when user cancels MFA enrollment to keep their account tidy.
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

async function requireAAL2IfMFAEnabled(
    supabase: Awaited<ReturnType<typeof createClient>>
) {
    const [{ data: factorsData, error: factorsError }, { data: aalData, error: aalError }] =
        await Promise.all([
            supabase.auth.mfa.listFactors(),
            supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ])

    if (factorsError) {
        console.error('MFA factors lookup error:', factorsError)
        throw new Error('Failed to validate MFA session')
    }

    if (aalError) {
        console.error('MFA AAL lookup error:', aalError)
        throw new Error('Failed to validate MFA session')
    }

    const hasVerifiedTotpFactor =
        factorsData?.totp?.some((factor) => factor.status === 'verified') ?? false

    if (
        hasVerifiedTotpFactor &&
        aalData?.currentLevel === 'aal1' &&
        aalData?.nextLevel === 'aal2'
    ) {
        throw new Error(
            'Two-factor verification required. Please verify your authenticator code and try again.'
        )
    }
}
