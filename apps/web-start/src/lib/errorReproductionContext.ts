export type ApiFailureBreadcrumb = {
	method: string;
	path: string;
	requestId: string | null;
	status: number;
	timestamp: string;
};

const MAX_API_FAILURES = 5;
const MAX_PATH_LENGTH = 500;
const apiFailures: ApiFailureBreadcrumb[] = [];
let fetchObserverInstalled = false;

function safePath(input: string): string {
	try {
		const base = typeof window === "undefined" ? "https://phaseo.invalid" : window.location.origin;
		return new URL(input, base).pathname.slice(0, MAX_PATH_LENGTH);
	} catch {
		return "unknown";
	}
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
	if (typeof init?.method === "string") return init.method.toUpperCase();
	if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
	return "GET";
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

export function recordApiFailure(failure: ApiFailureBreadcrumb): void {
	apiFailures.push(failure);
	if (apiFailures.length > MAX_API_FAILURES) {
		apiFailures.splice(0, apiFailures.length - MAX_API_FAILURES);
	}
}

export function getRecentApiFailures(): ApiFailureBreadcrumb[] {
	return apiFailures.map((failure) => ({ ...failure }));
}

export function installFailedFetchObserver(): void {
	if (typeof window === "undefined" || fetchObserverInstalled) return;

	fetchObserverInstalled = true;
	const originalFetch = window.fetch.bind(window);
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const method = requestMethod(input, init);
		const path = safePath(requestUrl(input));

		try {
			const response = await originalFetch(input, init);
			if (!response.ok) {
				recordApiFailure({
					method,
					path,
					requestId: response.headers.get("x-request-id"),
					status: response.status,
					timestamp: new Date().toISOString(),
				});
			}
			return response;
		} catch (error) {
			recordApiFailure({
				method,
				path,
				requestId: null,
				status: 0,
				timestamp: new Date().toISOString(),
			});
			throw error;
		}
	};
}

export function getSanitizedLocationContext(
	locationHref: string,
	referrer = "",
	base = "https://phaseo.invalid",
): { path: string; queryKeys: string[]; referrerPath: string | null } {
	const location = new URL(locationHref, base);
	const queryKeys = [...location.searchParams.keys()]
		.filter((key, index, keys) => keys.indexOf(key) === index)
		.slice(0, 20);

	return {
		path: location.pathname.slice(0, MAX_PATH_LENGTH),
		queryKeys,
		referrerPath: referrer ? safePath(referrer) : null,
	};
}

export function buildErrorReproductionContext(sessionId?: string): Record<string, unknown> {
	if (typeof window === "undefined") {
		return {
			environment: process.env.NODE_ENV,
			release: process.env.NEXT_PUBLIC_RELEASE,
		};
	}

	const location = getSanitizedLocationContext(
		window.location.href,
		document.referrer,
		window.location.origin,
	);

	return {
		api_failures: getRecentApiFailures(),
		deploy_time: process.env.NEXT_PUBLIC_DEPLOY_TIME,
		environment: process.env.NODE_ENV,
		locale: navigator.language,
		online: navigator.onLine,
		path: location.path,
		query_keys: location.queryKeys,
		referrer_path: location.referrerPath,
		release: process.env.NEXT_PUBLIC_RELEASE,
		session_id: sessionId,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		viewport: `${window.innerWidth}x${window.innerHeight}`,
	};
}

export function resetErrorReproductionContextForTests(): void {
	apiFailures.length = 0;
	fetchObserverInstalled = false;
}
