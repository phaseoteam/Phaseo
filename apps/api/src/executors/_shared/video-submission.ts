import type { ExecutorExecuteArgs } from "@executors/types";
import type { IRVideoGenerationRequest } from "@core/ir";
import { saveVideoJobMeta, type VideoJobMeta } from "@core/video-jobs";
import { fetchUpstream } from "./timing/upstream";

type Submission = { meta: VideoJobMeta; dispatched: boolean; rejected: boolean };
const submissions = new WeakMap<ExecutorExecuteArgs, Submission>();

export function configureVideoSubmission(args: ExecutorExecuteArgs, meta: Partial<VideoJobMeta>): void {
	const ir = args.ir as IRVideoGenerationRequest;
	submissions.set(args, { dispatched: false, rejected: false, meta: {
		provider: args.providerId, requestId: args.requestId, model: args.providerModelSlug || ir.model,
		sessionId: args.meta.sessionId ?? null, appId: args.meta.appId ?? null,
		seconds: Number(ir.durationSeconds ?? ir.duration ?? ir.seconds) || null,
		resolution: ir.size ?? ir.resolution ?? null, audio: ir.generateAudio,
		aspectRatio: ir.aspectRatio, inputVideoSeconds: ir.inputVideoDurationSeconds,
		inputAudioSeconds: ir.inputAudioDurationSeconds, outputCount: ir.sampleCount ?? ir.numberOfVideos ?? 1,
		outputAccess: ir.outputAccess, webhook: ir.webhook as Record<string, unknown> | null,
		...meta,
	} });
}

export function canReleaseVideoSubmission(args: ExecutorExecuteArgs): boolean {
	const state = submissions.get(args);
	return !state?.dispatched || state.rejected;
}

// Store the paid operation before crossing the network boundary. A timeout,
// malformed success or server error cannot establish that no task was created.
export async function beginVideoSubmission(args: ExecutorExecuteArgs): Promise<void> {
	const state = submissions.get(args);
	if (!state) throw new Error("video_submission_not_configured");
	await saveVideoJobMeta(args.workspaceId, args.requestId, { ...state.meta, submissionState: "submitting" }, null, "pending");
	state.dispatched = true;
}

export async function rejectVideoSubmission(args: ExecutorExecuteArgs): Promise<void> {
	const state = submissions.get(args);
	if (!state) throw new Error("video_submission_not_configured");
	state.rejected = true;
	await saveVideoJobMeta(args.workspaceId, args.requestId, { ...state.meta, submissionState: "rejected" }, null, "failed");
}

export async function observeVideoSubmissionResponse(args: ExecutorExecuteArgs, response: Response): Promise<void> {
	if (response.status >= 400 && response.status < 500 && response.status !== 408) await rejectVideoSubmission(args);
}

export async function fetchVideoSubmission(...parameters: Parameters<typeof fetchUpstream>): Promise<Response> {
	const [args, , , phase] = parameters;
	if (phase && phase !== "provider") return fetchUpstream(...parameters);
	await beginVideoSubmission(args);
	const response = await fetchUpstream(...parameters);
	await observeVideoSubmissionResponse(args, response);
	return response;
}
