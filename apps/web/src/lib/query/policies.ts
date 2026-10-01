import { WebApiError } from "@/lib/web-api/client";

const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;
export const PUBLIC_REVALIDATION_INTERVAL_MS = 15 * 60_000;

export function shouldRetryWebQuery(
	failureCount: number,
	error: unknown,
): boolean {
	if (
		error instanceof WebApiError &&
		[400, 401, 403, 404].includes(error.status)
	) {
		return false;
	}
	return failureCount < DEFAULT_RETRY_COUNT;
}

export const WEB_QUERY_POLICIES = {
	public: {
		staleTime: PUBLIC_REVALIDATION_INTERVAL_MS,
		gcTime: PUBLIC_REVALIDATION_INTERVAL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchInterval: PUBLIC_REVALIDATION_INTERVAL_MS,
		refetchIntervalInBackground: false,
		retry: shouldRetryWebQuery,
		retryDelay: DEFAULT_RETRY_DELAY_MS,
	},
	private: {
		staleTime: 5 * 60_000,
		gcTime: 5 * 60_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchInterval: 5 * 60_000,
		refetchIntervalInBackground: false,
		retry: shouldRetryWebQuery,
		retryDelay: DEFAULT_RETRY_DELAY_MS,
	},
	publicNoPolling: {
		staleTime: PUBLIC_REVALIDATION_INTERVAL_MS,
		gcTime: PUBLIC_REVALIDATION_INTERVAL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchInterval: false,
		refetchIntervalInBackground: false,
		retry: shouldRetryWebQuery,
		retryDelay: DEFAULT_RETRY_DELAY_MS,
	},
	privateNoRetry: {
		staleTime: 5 * 60_000,
		gcTime: 5 * 60_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchInterval: 5 * 60_000,
		refetchIntervalInBackground: false,
		retry: false,
		retryDelay: DEFAULT_RETRY_DELAY_MS,
	},
} as const;
