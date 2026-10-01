import type { IncomingMessage } from "node:http";
import { Journal, LLMock, flattenHeaders, type Mountable } from "@copilotkit/aimock";

async function jsonBody(req: IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function mountNativeMediaFixtures(aimock: LLMock): void {
    let journal: Journal | null = null;
    const media: Mountable = {
        setJournal(value) { journal = value; },
        async handleRequest(req, res, pathname) {
            const knownPaths = [
                "/modelscope/v1/images/generations", "/modelscope/v1/tasks/aimock-image-task",
                "/ovhcloud/api/text2image", "/ovhcloud/api/v1/tts/text_to_audio", "/sse",
            ];
            if (!knownPaths.includes(pathname)) return false;
            const body = await jsonBody(req);
            const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);
            let status = 400;
            let contentType = "application/json";
            let response: string | Buffer = JSON.stringify({ error: "Invalid native media fixture request" });
            if (pathname === "/modelscope/v1/images/generations" && req.method === "POST"
                && headers["x-modelscope-async-mode"] === "true" && body.model === "Qwen/Qwen-Image"
                && body.prompt?.includes("[aimock-image]") && body.size === undefined) {
                status = 200;
                response = JSON.stringify({ task_id: "aimock-image-task" });
            } else if (pathname === "/modelscope/v1/tasks/aimock-image-task" && req.method === "GET"
                && headers["x-modelscope-task-type"] === "image_generation") {
                status = 200;
                response = JSON.stringify({ task_status: "SUCCEED", output_images: ["https://example.com/aimock/skyline.png"] });
            } else if (pathname === "/ovhcloud/api/text2image" && req.method === "POST"
                && body.prompt?.includes("[aimock-image]") && body.model === undefined) {
                status = 200;
                contentType = "image/png";
                response = Buffer.from([1, 2, 3]);
            } else if (pathname === "/ovhcloud/api/v1/tts/text_to_audio" && req.method === "POST"
                && body.text?.includes("[aimock-speech]") && body.language_code === "en-US"
                && body.voice_name === "English-US.Female-1" && body.encoding === 1 && body.sample_rate_hz === 16000) {
                status = 200;
                contentType = "audio/wav";
                response = Buffer.from("AIMOCK_TTS_AUDIO");
            } else if (pathname === "/sse" && req.method === "POST"
                && body.audio?.input?.transcription?.model === "stepaudio-2.5-asr"
                && body.audio?.input?.format?.type === "pcm" && body.audio.input.format.rate === 16000
                && body.audio.input.format.bits === 16 && body.audio.input.format.channel === 1
                && Buffer.from(body.audio.data ?? "", "base64").length === 16000) {
                status = 200;
                contentType = "text/event-stream";
                response = 'data: {"type":"transcript.text.done","text":"Deterministic transcription from AIMock."}\n\n';
            }
            journal?.add({ method: req.method, path: req.url ?? pathname, headers, body, service: "native-media", response: { status, fixture: null } });
            res.writeHead(status, { "Content-Type": contentType });
            res.end(response);
            return true;
        },
    };
    aimock.mount("/native-media", media);
    aimock.mount("/v1/audio/asr", media);
}
