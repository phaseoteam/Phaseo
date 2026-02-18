import { describe, expect, it } from "vitest";
import { resolvePipeline } from "./registry";
import { runTextGeneratePipeline } from "./surfaces/text-generate";
import { runEmbeddingsPipeline } from "./surfaces/embeddings";
import { runModerationsPipeline } from "./surfaces/moderations";
import { runVideoGeneratePipeline } from "./surfaces/video-generate";
import { runNotImplementedPipeline } from "./surfaces/not-implemented";
import { runNonTextPipeline } from "./surfaces/non-text";

describe("resolvePipeline", () => {
	it("routes text and core IR endpoints to their dedicated surfaces", () => {
		expect(resolvePipeline("chat.completions")).toBe(runTextGeneratePipeline);
		expect(resolvePipeline("responses")).toBe(runTextGeneratePipeline);
		expect(resolvePipeline("messages")).toBe(runTextGeneratePipeline);
		expect(resolvePipeline("embeddings")).toBe(runEmbeddingsPipeline);
		expect(resolvePipeline("moderations")).toBe(runModerationsPipeline);
	});

	it("routes non-text generation endpoints to non-text IR surface", () => {
		expect(resolvePipeline("images.generations")).toBe(runNonTextPipeline);
		expect(resolvePipeline("images.edits")).toBe(runNonTextPipeline);
		expect(resolvePipeline("audio.speech")).toBe(runNonTextPipeline);
		expect(resolvePipeline("audio.transcription")).toBe(runNonTextPipeline);
		expect(resolvePipeline("audio.translations")).toBe(runNonTextPipeline);
		expect(resolvePipeline("video.generation")).toBe(runVideoGeneratePipeline);
		expect(resolvePipeline("ocr")).toBe(runNonTextPipeline);
		expect(resolvePipeline("music.generate")).toBe(runNonTextPipeline);
	});

	it("routes deferred endpoints to not-implemented surface", () => {
		expect(resolvePipeline("batch")).toBe(runNotImplementedPipeline);
		expect(resolvePipeline("files.upload")).toBe(runNotImplementedPipeline);
		expect(resolvePipeline("files.list")).toBe(runNotImplementedPipeline);
		expect(resolvePipeline("files.retrieve")).toBe(runNotImplementedPipeline);
	});
});
