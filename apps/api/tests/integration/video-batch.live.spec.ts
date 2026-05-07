import { beforeAll, describe, expect, it } from "vitest";
import {
    LIVE_RUN,
    assertOk,
    createOpenAiBatchJsonl,
    getGateway,
    postJson,
    postMultipart,
    requireGatewayApiKey,
    resolveModelFromCatalog,
    resolveProvidersForModel,
    sleep,
} from "./live-gateway.helpers";

const LIVE_VIDEO_BATCH_RUN = (process.env.LIVE_VIDEO_BATCH_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_VIDEO_BATCH_RUN ? describe : describe.skip;

const VIDEO_POLL_ATTEMPTS = Number(process.env.LIVE_VIDEO_BATCH_VIDEO_POLL_ATTEMPTS ?? "40");
const VIDEO_POLL_DELAY_MS = Number(process.env.LIVE_VIDEO_BATCH_VIDEO_POLL_DELAY_MS ?? "15000");
const BATCH_POLL_ATTEMPTS = Number(process.env.LIVE_VIDEO_BATCH_BATCH_POLL_ATTEMPTS ?? "120");
const BATCH_POLL_DELAY_MS = Number(process.env.LIVE_VIDEO_BATCH_BATCH_POLL_DELAY_MS ?? "30000");
const BATCH_REQUEST_COUNT = Number(process.env.LIVE_VIDEO_BATCH_BATCH_REQUEST_COUNT ?? "4");

let videoModel = "google/veo-3.1-lite-preview";
let videoProvider = "google-vertex";
let batchModel = "openai/gpt-5.4-nano";

function parseJsonLines(text: string): any[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function toOpenAiBatchModel(model: string): string {
    return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

async function pollJson(pathname: string, attempts: number, delayMs: number, terminalStates: Set<string>) {
    let latest: any = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const result = await getGateway(pathname);
        assertOk(result, pathname);
        if (!("json" in result)) throw new Error(`Expected JSON from ${pathname}`);
        latest = result.json;
        const status = String(latest?.status ?? "").trim().toLowerCase();
        if (terminalStates.has(status)) return latest;
        if (attempt < attempts) await sleep(delayMs);
    }
    return latest;
}

describeLive("Video and batch live coverage", () => {
    beforeAll(async () => {
        requireGatewayApiKey();
        videoModel = await resolveModelFromCatalog({
            preferredModelIds: ["google/veo-3.1-lite-preview", "google/veo-3.1-lite-generate-preview"],
        });
        const providers = await resolveProvidersForModel({ modelId: videoModel });
        videoProvider =
            providers.find((providerId) => providerId === "google-vertex") ??
            providers.find((providerId) => providerId === "google-ai-studio") ??
            providers[0] ??
            "google-vertex";
        batchModel = await resolveModelFromCatalog({
            preferredModelIds: ["openai/gpt-5.4-nano", "openai/gpt-5-nano"],
            providerId: "openai",
        });

        console.log(
            `[video-batch] videoModel=${videoModel} videoProvider=${videoProvider} batchModel=${batchModel}`,
        );
    }, 120_000);

    it(
        "google_veo_31_lite_low_settings",
        async () => {
            const create = await postJson("/videos", {
                model: videoModel,
                prompt: "A simple gray sphere slowly rotating on a plain white background.",
                duration: 4,
                size: "720p",
                generate_audio: false,
                provider: { only: [videoProvider] },
            });
            assertOk(create, "/videos");
            if (!("json" in create)) throw new Error("Expected JSON response from /videos");
            expect(typeof create.json?.id).toBe("string");
            const videoId = String(create.json.id);

            const latest = await pollJson(
                `/videos/${encodeURIComponent(videoId)}`,
                VIDEO_POLL_ATTEMPTS,
                VIDEO_POLL_DELAY_MS,
                new Set(["completed", "failed"]),
            );
            const status = String(latest?.status ?? "").trim().toLowerCase();
            expect(status, "video job should complete").toBe("completed");

            const content = await getGateway(`/videos/${encodeURIComponent(videoId)}/content`);
            assertOk(content, "/videos/:id/content");
            if ("json" in content) throw new Error("Expected binary content from /videos/:id/content");
            expect(content.bytes.length, "video content should return bytes").toBeGreaterThan(0);
        },
        900_000,
    );

    it(
        "openai_batch_responses_flow",
        async () => {
            const jsonl = createOpenAiBatchJsonl({
                model: toOpenAiBatchModel(batchModel),
                count: BATCH_REQUEST_COUNT,
            });
            const upload = await postMultipart("/files", (form) => {
                form.set("purpose", "batch");
                form.set("file", new Blob([jsonl], { type: "application/jsonl" }), "batch-input.jsonl");
            });
            assertOk(upload, "/files");
            if (!("json" in upload)) throw new Error("Expected JSON response from /files");
            expect(typeof upload.json?.id).toBe("string");
            const inputFileId = String(upload.json.id);

            const create = await postJson("/batches", {
                input_file_id: inputFileId,
                endpoint: "/v1/responses",
                completion_window: "24h",
                session_id: `live_batch_${Date.now()}`,
            });
            assertOk(create, "/batches");
            if (!("json" in create)) throw new Error("Expected JSON response from /batches");
            expect(typeof create.json?.id).toBe("string");
            const batchId = String(create.json.id);

            const latest = await pollJson(
                `/batches/${encodeURIComponent(batchId)}`,
                BATCH_POLL_ATTEMPTS,
                BATCH_POLL_DELAY_MS,
                new Set(["completed", "failed", "expired", "cancelled", "canceled"]),
            );
            const status = String(latest?.status ?? "").trim().toLowerCase();
            expect(status, "batch should complete successfully").toBe("completed");
            expect(Array.isArray(latest?.pricing_lines), "batch should include pricing lines").toBe(true);
            expect(latest?.billing && typeof latest.billing === "object", "batch should include billing").toBe(true);

            const outputFileId = String(latest?.output_file_id ?? "");
            expect(outputFileId.length, "completed batch should include output_file_id").toBeGreaterThan(0);

            const fileMeta = await getGateway(`/files/${encodeURIComponent(outputFileId)}`);
            assertOk(fileMeta, "/files/:id");
            if (!("json" in fileMeta)) throw new Error("Expected JSON response from /files/:id");
            expect(String(fileMeta.json?.id ?? "")).toBe(outputFileId);

            const content = await getGateway(`/files/${encodeURIComponent(outputFileId)}/content`);
            assertOk(content, "/files/:id/content");
            if ("json" in content) throw new Error("Expected JSONL/binary content from /files/:id/content");
            const lines = parseJsonLines(content.bytes.toString("utf8"));
            expect(lines.length).toBeGreaterThanOrEqual(BATCH_REQUEST_COUNT);
            const successfulRows = lines.filter((line) => Number(line?.response?.status_code) === 200);
            expect(successfulRows.length).toBeGreaterThanOrEqual(BATCH_REQUEST_COUNT);
        },
        4_200_000,
    );
});
