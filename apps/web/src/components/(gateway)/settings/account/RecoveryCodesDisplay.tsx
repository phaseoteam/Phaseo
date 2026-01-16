'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Download, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface RecoveryCodesDisplayProps {
    codes: string[]
    onConfirm?: () => void
    className?: string
}

export function RecoveryCodesDisplay({
    codes,
    onConfirm,
    className,
}: RecoveryCodesDisplayProps) {
    const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null)
    const [confirmed, setConfirmed] = React.useState(false)

    const copyCode = async (code: string, index: number) => {
        try {
            await navigator.clipboard.writeText(code)
            setCopiedIndex(index)
            toast.success('Code copied to clipboard')
            setTimeout(() => setCopiedIndex(null), 2000)
        } catch (err) {
            toast.error('Failed to copy code')
        }
    }

    const downloadCodes = () => {
        const content = `AI Stats - MFA Recovery Codes
Generated: ${new Date().toLocaleString()}

IMPORTANT: Save these codes securely. Each code can only be used once.
If you lose access to your authenticator app, you can use these codes to sign in.

Recovery Codes:
${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

---
Keep these codes secure and never share them with anyone.
`

        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ai-stats-recovery-codes-${Date.now()}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success('Recovery codes downloaded')
    }

    const handleConfirm = () => {
        setConfirmed(true)
        onConfirm?.()
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* Warning message */}
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/10">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                    Save these codes securely
                </p>
                <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-300/90">
                    These recovery codes will only be shown once. Store them in
                    a safe place like a password manager. You can use each code
                    once if you lose access to your authenticator app.
                </p>
            </div>

            {/* Codes grid */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {codes.map((code, index) => (
                    <div
                        key={index}
                        className="group relative flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2.5"
                    >
                        <span className="font-mono text-sm font-medium">
                            {code}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => copyCode(code, index)}
                        >
                            {copiedIndex === index ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                    variant="outline"
                    onClick={downloadCodes}
                    className="w-full sm:w-auto"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Download as text file
                </Button>

                {onConfirm && (
                    <Button
                        onClick={handleConfirm}
                        disabled={confirmed}
                        className="w-full sm:w-auto"
                    >
                        {confirmed ? (
                            <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Confirmed
                            </>
                        ) : (
                            "I've saved these codes"
                        )}
                    </Button>
                )}
            </div>

            {/* Additional info */}
            <p className="text-xs text-muted-foreground">
                Tip: Print these codes or save them in a password manager. Each
                code can only be used once.
            </p>
        </div>
    )
}
