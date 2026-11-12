/** Crop the existing Epoch wordmark to its turquoise symbol. */
export function EpochLogo({ size = 20 }: { size?: number }) {
	return <svg width={size} height={size} viewBox="0 0 28 28" className="shrink-0" aria-hidden="true"><image href="/benchmarks/epoch-ai.svg" width="150" height="26" y="1" /></svg>;
}
