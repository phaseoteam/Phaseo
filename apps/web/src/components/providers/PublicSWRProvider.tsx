"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { WebApiError } from "@/lib/web-api/client";
import { publicSWRFetcher } from "@/lib/swr/publicFetcher";

export function PublicSWRProvider({ children }: { children: ReactNode }) {
	return (
		<SWRConfig
			value={{
				fetcher: publicSWRFetcher,
				revalidateOnFocus: false,
				revalidateOnReconnect: true,
				errorRetryCount: 2,
				onErrorRetry: (error, key, config, revalidate, context) => {
					if (
						error instanceof WebApiError &&
						[400, 401, 403, 404].includes(error.status)
					) {
						return;
					}
					if (context.retryCount >= 2) return;
					setTimeout(() => void revalidate(context), 1_000);
				},
			}}
		>
			{children}
		</SWRConfig>
	);
}
