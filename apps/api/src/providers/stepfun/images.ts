import { z } from "zod";
import { ImagesEditSchema, ImagesGenerationSchema } from "@core/schemas";
import type { AdapterResult, ProviderExecuteArgs } from "../types";
import { resolveOpenAITransport } from "../shared/openai-transport";
import { resolveUploadableFromString } from "../openai/endpoints/uploadable";
import { upstreamTestHeaders } from "../shared/testing";

const optionsSchema = z.object({
    steps: z.coerce.number().int().min(1).max(50).optional(),
    cfg_scale: z.coerce.number().min(1).max(10).optional(),
    seed: z.coerce.number().int().min(0).max(2147483647).optional(),
    negative_prompt: z.string().max(512).optional(),
    text_mode: z.boolean().optional(),
    style_reference: z.object({ source_url: z.string().min(1), weight: z.number().positive().max(2).optional() }).optional(),
}).strict();

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const edit = args.endpoint === "images.edits";
    const body = edit ? ImagesEditSchema.parse(args.body) : ImagesGenerationSchema.parse(args.body);
    const model = args.providerModelSlug || body.model;
    const raw = args.body;
    const options = optionsSchema.parse({ ...raw.provider_params?.stepfun, ...Object.fromEntries(
        ["steps", "cfg_scale", "seed", "negative_prompt", "text_mode", "style_reference"].filter(key => raw[key] !== undefined).map(key => [key, raw[key]]),
    ) });
    const isEdit2 = model === "step-image-edit-2";
    const image = "image" in body ? body.image : undefined;
    const param = body.stream ? "stream" : body.n != null && body.n !== 1 ? "n"
        : body.prompt.length > 512 ? "prompt" : "mask" in body && body.mask != null ? "mask"
        : Array.isArray(image) && image.length !== 1 ? "image"
        : options.style_reference && model !== "step-1x-medium" ? "style_reference"
        : !isEdit2 && (options.text_mode !== undefined || options.negative_prompt !== undefined) ? "text_mode/negative_prompt"
        : body.response_format && !["url", "b64_json"].includes(body.response_format) ? "response_format" : undefined;
    if (param) return { kind: "completed", upstream: Response.json({ error: { type: "invalid_request_error", param, message: `Unsupported StepFun image ${param}.` } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } };
    const { keyInfo, url, headers } = resolveOpenAITransport(args, edit ? "/images/edits" : "/images/generations", upstreamTestHeaders(args.meta));
    const size = !edit && isEdit2 && body.size ? body.size.split("x").reverse().join("x") : body.size;
    const request = { model, prompt: body.prompt, size: edit && isEdit2 ? undefined : size, response_format: body.response_format, ...options };
    let payload: BodyInit;
    if (edit) {
        const source = Array.isArray(image) ? image[0] : image;
        const upload = typeof source === "string" ? await resolveUploadableFromString(source, { defaultMimeType: "image/png", fallbackFilename: "image", maxBytes: 50 * 1024 * 1024, upstreamTiming: args.upstreamTiming }) : { blob: source as Blob, filename: "image.png" };
        const form = new FormData();
        form.append("image", upload.blob, upload.filename);
        for (const [key, value] of Object.entries(request)) if (value !== undefined) form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        delete headers["Content-Type"];
        payload = form;
    } else payload = JSON.stringify(request);
    const upstream = await (args.upstreamTiming?.fetch ?? fetch)(url, { method: "POST", headers, body: payload });
    const json = await upstream.clone().json().catch(() => null) as any;
    const count = upstream.ok && Array.isArray(json?.data) ? json.data.filter((item: any) => item.url || item.b64_json).length : 0;
    return { kind: "completed", upstream, normalized: json ?? undefined, bill: { cost_cents: 0, currency: "USD", usage: count ? { output_image: count } : undefined, upstream_id: json?.id ?? upstream.headers.get("x-request-id") }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
