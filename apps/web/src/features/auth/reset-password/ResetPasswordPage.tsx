import * as React from 'react'
import { useSearch } from '@tanstack/react-router'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/utils/supabase/client'
import { Loader2, Lock } from 'lucide-react'
import { useTranslations } from '@/i18n/react'
import { authDialogHref } from '@/lib/auth/authDialogRedirect'

/**
 * Landing page of the reset-password email. The Supabase browser client reads the
 * recovery tokens from this URL and fires PASSWORD_RECOVERY; the session is then in
 * cookies and the new password is set in the auth dialog over the home page.
 * This page stays separate so nothing else on a full page consumes the tokens first.
 */
export function ResetPasswordPage() {
    const t = useTranslations('Common.authFlows.passwordReset')
    const search = useSearch({ strict: false }) as Record<string, unknown>

    React.useEffect(() => {
        const supabase = createClient()
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                // A full load, so the page renders with the recovery session.
                window.location.replace(authDialogHref({ params: {}, search }, { auth: 'reset' }))
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [search])

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        {t('title')}
                    </CardTitle>
                    <CardDescription>
                        {t('loading')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                        {t('expiredLink')}
                        <br />
                        {t('requestNew')}
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
