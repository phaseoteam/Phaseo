import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nonTextAdapterExecutor } from "../_shared/non-text/adapter-bridge";
import { executor as alibabaVideo } from "../alibaba/video-generate";
import { executor as atlasCloudVideo } from "../atlascloud/video-generate";
import { executor as bytedanceSeedVideo } from "../bytedance-seed/video-generate";
import { executor as googleVertexVideo } from "../google-vertex/video-generate";
import { executor as minimaxVideo } from "../minimax/video-generate";
import { executor as openaiVideo } from "../openai/video-generate";
import { executor as runwayVideo } from "../runway/video-generate";
import { executor as xAiVideo } from "../x-ai/video-generate";
import { EXECUTORS_BY_PROVIDER, resolveProviderExecutor } from "../index";

const VIDEO_EXECUTOR_FILES = [
	"alibaba/video-generate/index.ts",
	"atlascloud/video-generate/index.ts",
	"bytedance-seed/video-generate/index.ts",
	"google/video-generate/index.ts",
	"google-vertex/video-generate/index.ts",
	"minimax/video-generate/index.ts",
	"openai/video-generate/index.ts",
	"runway/video-generate/index.ts",
	"x-ai/video-generate/index.ts",
	"_shared/non-text/adapter-bridge.ts",
];

describe("video reservation ids", () => {
	it("uses the stored public video job id for reservation holds", () => {
		for (const relativePath of VIDEO_EXECUTOR_FILES) {
			const source = readFileSync(join(__dirname, "..", relativePath), "utf8");

			expect(source, relativePath).toContain("videoId: args.requestId");
			expect(source, relativePath).not.toContain("videoId: `req_${args.requestId}`");
		}
	});

	it("only registers video executors that use the guarded async reservation path", () => {
		const guardedDirectExecutors = new Set([
			alibabaVideo,
			atlasCloudVideo,
			bytedanceSeedVideo,
			googleVertexVideo,
			minimaxVideo,
			openaiVideo,
			runwayVideo,
			xAiVideo,
		]);

		for (const [providerId, executors] of Object.entries(EXECUTORS_BY_PROVIDER)) {
			const executor = executors["video.generate"];
			if (!executor) continue;
			expect(
				guardedDirectExecutors.has(executor),
				`${providerId} video.generate must use a reservation-aware async executor`,
			).toBe(true);
		}

		expect(resolveProviderExecutor("novita", "video.generation")).toBe(nonTextAdapterExecutor);
		expect(resolveProviderExecutor("fal", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("fal-ai", "video.generation")).toBeNull();
	});
});
