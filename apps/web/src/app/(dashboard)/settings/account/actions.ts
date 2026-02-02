"use server"

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createHash, randomBytes } from 'crypto'

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
export async function enrollMFAAction() {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

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
 * Verifies the TOTP code during MFA enrollment and generates recovery codes.
 * Stores hashed recovery codes in the database.
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
    } catch (err) {
        // Ignore cleanup errors - non-critical
    }

    // Generate 10 recovery codes
    const recoveryCodes = Array.from({ length: 10 }, () =>
        generateRecoveryCode()
    )

    // Hash and store recovery codes
    const adminClient = createAdminClient()
    const hashedCodes = recoveryCodes.map((code) => ({
        user_id: user.id,
        code_hash: hashRecoveryCode(code),
        created_at: new Date().toISOString(),
    }))

    const { error: insertError } = await adminClient
        .from('user_recovery_codes')
        .insert(hashedCodes)

    if (insertError) {
        console.error('Error storing recovery codes:', insertError)
        // Don't fail enrollment if recovery codes fail to store
        // MFA is still active, user just won't have recovery codes
    }

    revalidatePath('/settings/account')

    return {
        success: true,
        recoveryCodes, // Return plaintext codes only once
    }
}

/**
 * Disables MFA for the user after password confirmation.
 * Removes all MFA factors and deletes recovery codes.
 * For OAuth users, password verification is skipped.
 */
export async function unenrollMFAAction(
    factorId: string,
    currentPassword: string
) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user?.email) {
        throw new Error('Not authenticated or no email found')
    }

    // Only verify password for email/password users (not OAuth users)
    const provider = user.app_metadata?.provider
    const isOAuthUser = provider && provider !== 'email'

    if (!isOAuthUser && currentPassword) {
        // Verify current password for email/password users
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
    }

    // Unenroll MFA
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
    })

    if (unenrollError) {
        console.error('MFA unenroll error:', unenrollError)
        throw new Error('Failed to disable MFA')
    }

    // Delete recovery codes
    const adminClient = createAdminClient()
    const { error: deleteError } = await adminClient
        .from('user_recovery_codes')
        .delete()
        .eq('user_id', user.id)

    if (deleteError) {
        console.error('Error deleting recovery codes:', deleteError)
        // Don't fail unenrollment if recovery code deletion fails
    }

    revalidatePath('/settings/account')
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

/**
 * Retrieves unused recovery codes count for the current user.
 * Used for checking if codes exist after initial setup.
 */
export async function getRecoveryCodesAction() {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

    // Recovery codes are stored hashed, so we can't return the original codes
    // This function is mainly for checking if codes exist
    const { data, error } = await supabase
        .from('user_recovery_codes')
        .select('id, created_at, used_at')
        .eq('user_id', user.id)
        .is('used_at', null)

    if (error) {
        console.error('Error fetching recovery codes:', error)
        throw new Error('Failed to retrieve recovery codes')
    }

    return {
        hasRecoveryCodes: (data?.length ?? 0) > 0,
        unusedCount: data?.length ?? 0,
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a random 8-character recovery code (alphanumeric, no ambiguous chars).
 */
function generateRecoveryCode(): string {
    // Use crypto-safe random bytes, convert to alphanumeric (no ambiguous chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No O, 0, I, 1
    const bytes = randomBytes(8)
    let code = ''

    for (let i = 0; i < 8; i++) {
        code += chars[bytes[i] % chars.length]
    }

    // Format as XXXX-XXXX for readability
    return `${code.slice(0, 4)}-${code.slice(4)}`
}

/**
 * Hashes a recovery code for secure storage.
 */
function hashRecoveryCode(code: string): string {
    // Remove hyphen and hash with SHA-256
    const normalized = code.replace(/-/g, '')
    return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Verifies a recovery code against stored hash.
 * Used during MFA login verification.
 */
export async function verifyRecoveryCodeAction(code: string) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
        throw new Error('Not authenticated')
    }

    const codeHash = hashRecoveryCode(code)

    // Find matching unused recovery code
    const { data: codes, error: fetchError } = await supabase
        .from('user_recovery_codes')
        .select('id')
        .eq('user_id', user.id)
        .eq('code_hash', codeHash)
        .is('used_at', null)
        .limit(1)

    if (fetchError) {
        console.error('Error fetching recovery code:', fetchError)
        throw new Error('Failed to verify recovery code')
    }

    if (!codes || codes.length === 0) {
        throw new Error('Invalid or already used recovery code')
    }

    // Mark code as used
    const adminClient = createAdminClient()
    const { error: updateError } = await adminClient
        .from('user_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', codes[0].id)

    if (updateError) {
        console.error('Error marking recovery code as used:', updateError)
        throw new Error('Failed to use recovery code')
    }

    return { success: true }
}
