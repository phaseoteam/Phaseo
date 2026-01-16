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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Mail, CheckCircle2 } from 'lucide-react'

interface ForgotPasswordDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (email: string) => Promise<{ success: boolean }>
}

export function ForgotPasswordDialog({
    open,
    onOpenChange,
    onSubmit,
}: ForgotPasswordDialogProps) {
    const [email, setEmail] = React.useState('')
    const [loading, setLoading] = React.useState(false)
    const [success, setSuccess] = React.useState(false)

    // Reset state when dialog closes
    React.useEffect(() => {
        if (!open) {
            setTimeout(() => {
                setEmail('')
                setLoading(false)
                setSuccess(false)
            }, 300)
        }
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !email.includes('@')) {
            toast.error('Please enter a valid email address')
            return
        }

        setLoading(true)
        try {
            await onSubmit(email)
            setSuccess(true)
        } catch (error: any) {
            toast.error(error.message || 'Failed to send reset email')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {!success ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Mail className="h-5 w-5" />
                                Reset your password
                            </DialogTitle>
                            <DialogDescription>
                                Enter your email address and we'll send you a
                                link to reset your password.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="reset-email">
                                    Email address
                                </Label>
                                <Input
                                    id="reset-email"
                                    type="email"
                                    placeholder="your.email@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                    disabled={loading}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={!email || loading}>
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        'Send reset link'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                Check your email
                            </DialogTitle>
                            <DialogDescription>
                                If an account exists for {email}, you'll receive
                                a password reset link shortly.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="rounded-lg border bg-muted/50 p-4">
                                <p className="text-sm text-muted-foreground">
                                    <strong>Didn't receive an email?</strong>
                                    <br />
                                    Check your spam folder or try again in a few
                                    minutes. The link expires in 1 hour.
                                </p>
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={() => onOpenChange(false)}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
