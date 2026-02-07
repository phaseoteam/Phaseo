'use client'

import * as React from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp'
import { RecoveryCodesDisplay } from './RecoveryCodesDisplay'
import {
    enrollMFAAction,
    verifyMFAEnrollmentAction,
} from '@/app/(dashboard)/settings/account/actions'
import { toast } from 'sonner'
import { Loader2, QrCode, Key, CheckCircle2, Copy } from 'lucide-react'
import Image from 'next/image'

type EnrollmentStep = 'qr-code' | 'verify' | 'recovery-codes' | 'success'

interface MFAEnrollmentFlowProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
}

export function MFAEnrollmentFlow({
    open,
    onOpenChange,
    onSuccess,
}: MFAEnrollmentFlowProps) {
    const [step, setStep] = React.useState<EnrollmentStep>('qr-code')
    const [loading, setLoading] = React.useState(false)
    const [qrCode, setQrCode] = React.useState<string | null>(null)
    const [secret, setSecret] = React.useState<string | null>(null)
    const [factorId, setFactorId] = React.useState<string | null>(null)
    const [verificationCode, setVerificationCode] = React.useState('')
    const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([])
    const [secretCopied, setSecretCopied] = React.useState(false)

    // Reset state when dialog closes
    React.useEffect(() => {
        if (!open) {
            setTimeout(() => {
                setStep('qr-code')
                setQrCode(null)
                setSecret(null)
                setFactorId(null)
                setVerificationCode('')
                setRecoveryCodes([])
                setSecretCopied(false)
            }, 300)
        }
    }, [open])

    // Start enrollment when dialog opens
    React.useEffect(() => {
        if (open && step === 'qr-code' && !qrCode && !loading) {
            startEnrollment()
        }
    }, [open, step, qrCode, loading])

    const startEnrollment = async () => {
        setLoading(true)
        try {
            const result = await enrollMFAAction()
            setQrCode(result.qrCode)
            setSecret(result.secret)
            setFactorId(result.factorId)
        } catch (error: any) {
            toast.error(error.message || 'Failed to start MFA setup')
            onOpenChange(false)
        } finally {
            setLoading(false)
        }
    }

    const copySecret = async () => {
        if (!secret) return
        try {
            await navigator.clipboard.writeText(secret)
            setSecretCopied(true)
            toast.success('Secret copied to clipboard')
            setTimeout(() => setSecretCopied(false), 2000)
        } catch (err) {
            toast.error('Failed to copy secret')
        }
    }

    const verifyCode = async () => {
        if (!factorId || verificationCode.length !== 6) {
            toast.error('Please enter a 6-digit code')
            return
        }

        setLoading(true)
        try {
            const result = await verifyMFAEnrollmentAction(
                factorId,
                verificationCode
            )
            setRecoveryCodes(result.recoveryCodes)
            setStep('recovery-codes')
            toast.success('Two-factor authentication enabled!')
        } catch (error: any) {
            toast.error(error.message || 'Invalid code. Please try again.')
            setVerificationCode('')
        } finally {
            setLoading(false)
        }
    }

    const handleRecoveryCodesConfirmed = () => {
        setStep('success')
    }

    const handleComplete = () => {
        onOpenChange(false)
        onSuccess?.()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {/* QR Code Step */}
                {step === 'qr-code' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <QrCode className="h-5 w-5" />
                                Set up two-factor authentication
                            </DialogTitle>
                            <DialogDescription>
                                Scan this QR code with your authenticator app
                                (Google Authenticator, Authy, 1Password, etc.)
                            </DialogDescription>
                        </DialogHeader>

                        {loading && !qrCode ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* QR Code */}
                                {qrCode && (
                                    <div className="flex justify-center">
                                        <div className="rounded-lg border bg-white p-4">
                                            <Image
                                                src={qrCode.trim()}
                                                alt="MFA QR Code"
                                                width={200}
                                                height={200}
                                                className="h-48 w-48"
                                                unoptimized
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Manual entry */}
                                {secret && (
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">
                                            Can't scan? Enter this code
                                            manually:
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                                                {secret}
                                            </code>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={copySecret}
                                            >
                                                {secretCopied ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                ) : (
                                                    <Copy className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => onOpenChange(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button onClick={() => setStep('verify')}>
                                        Next: Enter code
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Verify Code Step */}
                {step === 'verify' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                Verify your code
                            </DialogTitle>
                            <DialogDescription>
                                Enter the 6-digit code from your authenticator
                                app
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="flex justify-center">
                                <InputOTP
                                    maxLength={6}
                                    value={verificationCode}
                                    onChange={setVerificationCode}
                                    onComplete={verifyCode}
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

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep('qr-code')}
                                    disabled={loading}
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={verifyCode}
                                    disabled={
                                        verificationCode.length !== 6 ||
                                        loading
                                    }
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Verifying...
                                        </>
                                    ) : (
                                        'Verify code'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {/* Recovery Codes Step */}
                {step === 'recovery-codes' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Save your recovery codes</DialogTitle>
                            <DialogDescription>
                                Use these codes to access your account if you
                                lose your authenticator device
                            </DialogDescription>
                        </DialogHeader>

                        <RecoveryCodesDisplay
                            codes={recoveryCodes}
                            onConfirm={handleRecoveryCodesConfirmed}
                        />
                    </>
                )}

                {/* Success Step */}
                {step === 'success' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                Two-factor authentication enabled
                            </DialogTitle>
                            <DialogDescription>
                                Your account is now protected with two-factor
                                authentication
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-900/10">
                                <p className="text-sm text-green-900 dark:text-green-200">
                                    You'll need your authenticator app to sign
                                    in from now on. Make sure you've saved your
                                    recovery codes in a secure place.
                                </p>
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={handleComplete}>
                                    Done
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
