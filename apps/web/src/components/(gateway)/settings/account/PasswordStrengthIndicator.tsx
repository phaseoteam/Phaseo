import * as React from 'react'
import { cn } from '@/lib/utils'

type PasswordStrength = 'weak' | 'medium' | 'strong' | 'very-strong'

interface PasswordStrengthIndicatorProps {
    password: string
    className?: string
}

/**
 * Calculates password strength based on multiple criteria:
 * - Length (min 8, ideal 12+)
 * - Character variety (uppercase, lowercase, numbers, special chars)
 * - Common patterns (no repeated chars, sequences)
 */
export function calculatePasswordStrength(password: string): {
    strength: PasswordStrength
    score: number
    feedback: string[]
} {
    if (!password) {
        return { strength: 'weak', score: 0, feedback: [] }
    }

    let score = 0
    const feedback: string[] = []

    // Length scoring (0-40 points)
    if (password.length >= 8) score += 10
    if (password.length >= 12) score += 15
    if (password.length >= 16) score += 15

    // Character variety (0-40 points)
    if (/[a-z]/.test(password)) score += 10
    else feedback.push('Add lowercase letters')

    if (/[A-Z]/.test(password)) score += 10
    else feedback.push('Add uppercase letters')

    if (/[0-9]/.test(password)) score += 10
    else feedback.push('Add numbers')

    if (/[^a-zA-Z0-9]/.test(password)) score += 10
    else feedback.push('Add special characters (!@#$%...)')

    // Bonus points for good patterns (0-20 points)
    if (password.length >= 8 && !/(.)\1{2,}/.test(password)) {
        score += 10 // No repeated characters (e.g., "aaa")
    }

    if (!/(?:abc|123|qwerty|password|admin)/i.test(password)) {
        score += 10 // No common sequences
    }

    // Determine strength level
    let strength: PasswordStrength
    if (score < 30) strength = 'weak'
    else if (score < 50) strength = 'medium'
    else if (score < 70) strength = 'strong'
    else strength = 'very-strong'

    return { strength, score, feedback }
}

export function PasswordStrengthIndicator({
    password,
    className,
}: PasswordStrengthIndicatorProps) {
    const { strength, score, feedback } = React.useMemo(
        () => calculatePasswordStrength(password),
        [password]
    )

    if (!password) return null

    const strengthConfig = {
        weak: {
            label: 'Weak',
            color: 'bg-red-500',
            textColor: 'text-red-600',
            bars: 1,
        },
        medium: {
            label: 'Medium',
            color: 'bg-yellow-500',
            textColor: 'text-yellow-600',
            bars: 2,
        },
        strong: {
            label: 'Strong',
            color: 'bg-green-500',
            textColor: 'text-green-600',
            bars: 3,
        },
        'very-strong': {
            label: 'Very Strong',
            color: 'bg-green-600',
            textColor: 'text-green-700',
            bars: 4,
        },
    }

    const config = strengthConfig[strength]

    return (
        <div className={cn('space-y-2', className)}>
            {/* Strength bars */}
            <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((bar) => (
                    <div
                        key={bar}
                        className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            bar <= config.bars
                                ? config.color
                                : 'bg-muted'
                        )}
                    />
                ))}
            </div>

            {/* Strength label */}
            <div className="flex items-center justify-between">
                <p className={cn('text-xs font-medium', config.textColor)}>
                    {config.label}
                </p>
                <p className="text-xs text-muted-foreground">
                    {password.length} characters
                </p>
            </div>

            {/* Feedback (only show if not very strong) */}
            {feedback.length > 0 && strength !== 'very-strong' && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {feedback.slice(0, 2).map((item, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                            <span className="text-muted-foreground/60">•</span>
                            {item}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
