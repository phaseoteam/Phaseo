'use server'

import { createClient } from '@/utils/supabase/server'

/**
 * Verifies MFA during login with a TOTP factor.
 */
export async function verifyMFALoginAction(code: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Not authenticated')
    }

    const normalizedCode = code.trim()
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw new Error('Enter a valid 6-digit code')
    }

    const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aalError) {
        console.error('MFA AAL lookup error:', aalError)
        throw new Error('Failed to verify MFA session')
    }

    // Already verified in this session.
    if (aalData?.currentLevel === 'aal2') {
        return { success: true }
    }

    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const factor = factorsData?.totp?.find((f) => f.status === 'verified')

    if (!factor) {
        throw new Error('No MFA factor found')
    }

    // Create challenge
    const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({
            factorId: factor.id,
        })

    if (challengeError) {
        console.error('MFA challenge error:', challengeError)
        throw new Error('Failed to create MFA challenge')
    }

    // Verify code
    const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
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

    // Session automatically elevated to aal2 by Supabase
    return { success: true }
}
