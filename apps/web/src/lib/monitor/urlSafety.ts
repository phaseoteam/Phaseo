import { normalizeHttpUrl } from "@/lib/utils/urlSafety";

export function normalizeMonitorHistoryLinkHref(value: unknown): string | null {
	return normalizeHttpUrl(value);
}
