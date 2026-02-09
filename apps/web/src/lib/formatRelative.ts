export function formatRelativeToNow(
    date: Date | number,
    nowMs: number
): string {
    const targetDate = date instanceof Date ? date : new Date(date)
    const diffInSeconds = Math.floor((nowMs - targetDate.getTime()) / 1000)

    // Less than 5 minutes
    if (diffInSeconds < 300) {
        return "just now"
    }

    // Minutes (5 minutes up to 1 hour)
    if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60)
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
    }

    // Hours (1 hour up to 24 hours)
    if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600)
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    }

    // Days (1 day up to 7 days)
    if (diffInSeconds < 604800) {
        const days = Math.floor(diffInSeconds / 86400)
        return `${days} ${days === 1 ? 'day' : 'days'} ago`
    }

    // Weeks (1 week up to 4 weeks)
    if (diffInSeconds < 2419200) {
        const weeks = Math.floor(diffInSeconds / 604800)
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
    }

    // Months (1 month up to 12 months)
    if (diffInSeconds < 31536000) {
        const months = Math.floor(diffInSeconds / 2628000) // Average month length
        return `${months} ${months === 1 ? 'month' : 'months'} ago`
    }

    // Years
    const years = Math.floor(diffInSeconds / 31536000)
    return `${years} ${years === 1 ? 'year' : 'years'} ago`
}
