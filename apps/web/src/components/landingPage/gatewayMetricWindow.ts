export function localizedGatewayMetricWindow(hours: number, locale: string, fallback: string): string {
	if (!Number.isFinite(hours) || hours <= 0) return fallback;
	const [unit, value] = hours % (24 * 30) === 0 ? ["month", hours / (24 * 30)] : hours % (24 * 7) === 0 ? ["week", hours / (24 * 7)] : hours % 24 === 0 ? ["day", hours / 24] : ["hour", hours];
	return new Intl.NumberFormat(locale, { style: "unit", unit: String(unit), unitDisplay: "short" }).format(Number(value));
}
