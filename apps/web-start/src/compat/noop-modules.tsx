// Stand-ins for Vercel/Next-only packages that have no Workers equivalent.

// @vercel/analytics/react — Vercel Web Analytics only runs on Vercel.
export function Analytics(_props: Record<string, unknown>) {
	return null;
}
export function track(_name: string, _properties?: Record<string, unknown>): void {}
