import { generatePublicId } from "@/pipeline/before/genId";

const requestIds = new WeakMap<Request, string>();

export function requestIdFor(request: Request): string {
	const existing = requestIds.get(request);
	if (existing) return existing;
	// Public generation identity is always server-owned, including when callers
	// supply an x-request-id. Reused caller IDs cannot alias separate generations.
	const requestId = generatePublicId();
	requestIds.set(request, requestId);
	return requestId;
}
