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
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp'
import { verifyMFALoginAction } from './actions'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, LogOut, KeyRound } from 'lucide-react'

export default function VerifyMFAPage() {
    const router = useRouter()
    const [code, setCode] = React.useState('')
    const [recoveryMode, setRecoveryMode] = React.useState(false)
    const [recoveryCode, setRecoveryCode] = React.useState('')
    const [loading, setLoading] = React.useState(false)

    const handleVerify = async (codeToVerify?: string) => {
        const finalCode = codeToVerify || (recoveryMode ? recoveryCode : code)

        if (!finalCode) {
            toast.error('Please enter a code')
            return
        }

        setLoading(true)

        try {
            await verifyMFALoginAction(finalCode, recoveryMode)
            toast.success('Verification successful!')

            // Redirect to home page
            setTimeout(() => {
                router.push('/')
            }, 500)
        } catch (error: any) {
            toast.error(error.message || 'Invalid code. Please try again.')
            if (recoveryMode) {
                setRecoveryCode('')
            } else {
                setCode('')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleSignOut = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/sign-in')
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle>Two-factor authentication</CardTitle>
                    <CardDescription>
                        {recoveryMode
                            ? 'Enter one of your recovery codes'
                            : 'Enter the 6-digit code from your authenticator app'}
                    </CardDescription>
                </CardHeader>

                {!recoveryMode ? (
                    // TOTP Mode
                    <>
                        <CardContent className="space-y-6">
                            <div className="flex justify-center">
                                <InputOTP
                                    maxLength={6}
                                    value={code}
                                    onChange={setCode}
                                    onComplete={handleVerify}
                                    disabled={loading}
                                >
                                    <InputOTPGroup>
                                        <InputOTPSlot index={0} />
                                        <InputOTPSlot index={1} />
                                        <InputOTPSlot index={2} />
                                        <InputOTPSlot index={3} />
                                        <InputOTPSlot index={4} />
                                        <InputOTPSlot index={5} />
                                    </InputOTPGroup>
                                </InputOTP>
                            </div>

                            <p className="text-center text-xs text-muted-foreground">
                                The code will auto-verify when you enter all 6
                                digits
                            </p>

                            <div className="flex justify-center">
                                <Button
                                    variant="link"
                                    onClick={() => setRecoveryMode(true)}
                                    className="text-sm"
                                >
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    Use recovery code instead
                                </Button>
                            </div>
                        </CardContent>

                        <CardFooter className="flex flex-col gap-2">
                            <Button
                                className="w-full"
                                onClick={() => handleVerify()}
                                disabled={code.length !== 6 || loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify'
                                )}
                            </Button>

                            <Button
                                variant="ghost"
                                className="w-full"
                                onClick={handleSignOut}
                                disabled={loading}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                Sign out
                            </Button>
                        </CardFooter>
                    </>
                ) : (
                    // Recovery Code Mode
                    <>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="recovery-code">
                                    Recovery code
                                </Label>
                                <Input
                                    id="recovery-code"
                                    type="text"
                                    placeholder="XXXX-XXXX"
                                    value={recoveryCode}
                                    onChange={(e) =>
                                        setRecoveryCode(
                                            e.target.value.toUpperCase()
                                        )
                                    }
                                    disabled={loading}
                                    autoFocus
                                    className="text-center font-mono text-lg"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Recovery codes are 8 characters long (e.g.,
                                    ABCD-1234)
                                </p>
                            </div>

                            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/50 dark:bg-yellow-900/10">
                                <p className="text-xs text-yellow-900 dark:text-yellow-200">
                                    <strong>Note:</strong> Recovery codes can
                                    only be used once. After using this code, it
                                    will be deleted from your account.
                                </p>
                            </div>

                            <div className="flex justify-center">
                                <Button
                                    variant="link"
                                    onClick={() => setRecoveryMode(false)}
                                    className="text-sm"
                                >
                                    Back to authenticator code
                                </Button>
                            </div>
                        </CardContent>

                        <CardFooter className="flex flex-col gap-2">
                            <Button
                                className="w-full"
                                onClick={() => handleVerify()}
                                disabled={!recoveryCode || loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify recovery code'
                                )}
                            </Button>

                            <Button
                                variant="ghost"
                                className="w-full"
                                onClick={handleSignOut}
                                disabled={loading}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                Sign out
                            </Button>
                        </CardFooter>
                    </>
                )}
            </Card>
        </div>
    )
}
