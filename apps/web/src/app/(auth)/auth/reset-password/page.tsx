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
import { Loader2, Lock, CheckCircle2 } from 'lucide-react'
import { PasswordStrengthIndicator } from '@/components/(gateway)/settings/account/PasswordStrengthIndicator'
import { z } from 'zod'

const passwordSchema = z
    .object({
        password: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/[A-Z]/, 'Must contain an uppercase letter')
            .regex(/[a-z]/, 'Must contain a lowercase letter')
            .regex(/[0-9]/, 'Must contain a number'),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    })

export default function ResetPasswordPage() {
    const router = useRouter()
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

        const parsed = passwordSchema.safeParse({ password, confirmPassword })

        if (!parsed.success) {
            const msg =
                parsed.error.errors[0]?.message ?? 'Please check your inputs.'
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

            toast.success('Password reset successfully!')

            // Redirect to home or settings page
            setTimeout(() => {
                router.push('/settings/account')
            }, 1500)
        } catch (error: any) {
            toast.error(error.message || 'Failed to reset password')
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
                            Reset password
                        </CardTitle>
                        <CardDescription>
                            Loading password reset session...
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                        <p className="text-center text-sm text-muted-foreground">
                            If this takes too long, the reset link may have
                            expired.
                            <br />
                            Please request a new password reset.
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
                        Set new password
                    </CardTitle>
                    <CardDescription>
                        Enter your new password below. Make sure it's strong and
                        secure.
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">New password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your new password"
                                disabled={loading}
                                autoFocus
                            />
                            {password && (
                                <PasswordStrengthIndicator password={password} />
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">
                                Confirm new password
                            </Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder="Confirm your new password"
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Resetting password...
                                </>
                            ) : (
                                'Reset password'
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
