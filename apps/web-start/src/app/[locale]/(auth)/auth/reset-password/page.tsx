'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Loader2, Lock } from 'lucide-react'
import { PasswordStrengthIndicator } from '@/components/(gateway)/settings/account/PasswordStrengthIndicator'
import { z } from 'zod'
import { useTranslations } from 'next-intl'

export default function ResetPasswordPage() {
    const router = useRouter()
    const t = useTranslations('Common.authFlows.passwordReset')
    const [password, setPassword] = React.useState('')
    const [confirmPassword, setConfirmPassword] = React.useState('')
    const [loading, setLoading] = React.useState(false)
    const [isRecoveryMode, setIsRecoveryMode] = React.useState(false)

    React.useEffect(() => {
        // Listen for password recovery event
        const supabase = createClient()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryMode(true)
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const passwordSchema = z
            .object({
                password: z
                    .string()
                    .min(8, t('minLength'))
                    .regex(/[A-Z]/, t('uppercase'))
                    .regex(/[a-z]/, t('lowercase'))
                    .regex(/[0-9]/, t('number')),
                confirmPassword: z.string(),
            })
            .refine((data) => data.password === data.confirmPassword, {
                message: t('mismatch'),
                path: ['confirmPassword'],
            })
        const parsed = passwordSchema.safeParse({ password, confirmPassword })

        if (!parsed.success) {
            const msg =
                parsed.error.issues[0]?.message ?? t('checkInputs')
            toast.error(msg)
            return
        }

        setLoading(true)

        try {
            const supabase = createClient()

            const { error } = await supabase.auth.updateUser({
                password,
            })

            if (error) {
                throw error
            }

            toast.success(t('success'))

            // Redirect to home or settings page
            setTimeout(() => {
                router.push('/settings/account')
            }, 1500)
        } catch (error: any) {
            toast.error(t('failure'))
        } finally {
            setLoading(false)
        }
    }

    if (!isRecoveryMode) {
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

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                            {t('setTitle')}
                    </CardTitle>
                    <CardDescription>
                        {t('description')}
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">{t('newPassword')}</Label>
                            <Input
                                id="password"
                                type="password"
                                dir="ltr"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('newPasswordPlaceholder')}
                                disabled={loading}
                                autoFocus
                            />
                            {password && (
                                <PasswordStrengthIndicator password={password} />
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">
                                {t('confirmPassword')}
                            </Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                dir="ltr"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder={t('confirmPasswordPlaceholder')}
                                disabled={loading}
                            />
                        </div>
                    </CardContent>

                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={!password || !confirmPassword || loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                    {t('resetting')}
                                </>
                            ) : (
                                t('submit')
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
