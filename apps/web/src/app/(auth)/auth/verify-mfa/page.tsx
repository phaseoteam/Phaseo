'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { Loader2, ShieldCheck, LogOut } from 'lucide-react'

export default function VerifyMFAPage() {
    return (
        <React.Suspense fallback={null}>
            <VerifyMFAContent />
        </React.Suspense>
    )
}

function VerifyMFAContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [code, setCode] = React.useState('')
    const [loading, setLoading] = React.useState(false)

    const handleVerify = async (codeToVerify?: string) => {
        const finalCode = codeToVerify || code

        if (!finalCode) {
            toast.error('Please enter a code')
            return
        }

        setLoading(true)

        try {
            await verifyMFALoginAction(finalCode)
            toast.success('Verification successful!')

            const requestedReturnUrl = searchParams.get('returnUrl')
            const returnUrl = requestedReturnUrl?.startsWith('/') && !requestedReturnUrl.startsWith('//')
                ? requestedReturnUrl
                : '/'

            setTimeout(() => {
                router.replace(returnUrl)
            }, 500)
        } catch (error: any) {
            toast.error(error.message || 'Invalid code. Please try again.')
            setCode('')
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
                        Enter the 6-digit code from your authenticator app
                    </CardDescription>
                </CardHeader>

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
            </Card>
        </div>
    )
}
