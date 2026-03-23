import { getJson, putJson } from "@/core/kv";
import type {
	CouncilRunEvent,
	CouncilRunEventType,
	CouncilRunRecord,
	CouncilRunStatus,
} from "./types";

const RUN_TTL_SECONDS = 60 * 60 * 24 * 14;
const RUN_KEY_PREFIX = "foundry:council:run";

function keyForRun(runId: string): string {
	return `${RUN_KEY_PREFIX}:${runId}`;
}

export async function getCouncilRun(runId: string): Promise<CouncilRunRecord | null> {
	return getJson<CouncilRunRecord>(keyForRun(runId));
}

export async function putCouncilRun(run: CouncilRunRecord): Promise<void> {
	await putJson(keyForRun(run.id), run, RUN_TTL_SECONDS);
}

export async function appendRunEvent(
	run: CouncilRunRecord,
	type: CouncilRunEventType,
	data?: Record<string, unknown>,
): Promise<CouncilRunRecord> {
	const next: CouncilRunRecord = {
		...run,
		updated_at: new Date().toISOString(),
		events: [
			...run.events,
			{
				type,
				at: new Date().toISOString(),
				data,
			} satisfies CouncilRunEvent,
		],
	};
	await putCouncilRun(next);
	return next;
}

export async function setRunStatus(
	run: CouncilRunRecord,
	status: CouncilRunStatus,
): Promise<CouncilRunRecord> {
	const nowIso = new Date().toISOString();
	const next: CouncilRunRecord = {
		...run,
		status,
		updated_at: nowIso,
		completed_at:
			status === "completed" || status === "partial" || status === "failed"
				? nowIso
				: run.completed_at,
	};
	await putCouncilRun(next);
	return next;
}

