'use server'

import { createClient } from '@/utils/supabase/server'

/**
 * Verifies a TOTP MFA challenge during login and upgrades the session to AAL2.
 */
export async function verifyMFALoginAction(code: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Not authenticated')
    }

    // Normal TOTP verification
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
        code,
    })

    if (verifyError) {
        if (verifyError.message?.includes('invalid')) {
            throw new Error('Invalid code. Please try again.')
        }
        console.error('MFA verify error:', verifyError)
        throw new Error('Failed to verify code')
    }

    // Session automatically elevated to aal2 by Supabase
    return { success: true }
}
