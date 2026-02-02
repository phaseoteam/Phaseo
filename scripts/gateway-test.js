#!/usr/bin/env node
"use strict";

const DEFAULT_BASE_URL = process.env.AI_STATS_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || "http://localhost:8787";

const DEFAULT_API_KEY = process.env.AI_STATS_API_KEY
    || process.env.GATEWAY_API_KEY
    || "";

const DEFAULT_MODELS = (process.env.GATEWAY_TEST_MODELS || "openai/gpt-5-nano-2025-08-07")
    .split(",").map(s => s.trim()).filter(Boolean);

const DEFAULT_PROTOCOLS = (process.env.GATEWAY_TEST_PROTOCOLS || "responses")
    .split(",").map(s => s.trim()).filter(Boolean);

const DEFAULT_CASES = (process.env.GATEWAY_TEST_CASES || "text,reasoning,image,tool,structured,stream")
    .split(",").map(s => s.trim()).filter(Boolean);

const DEFAULT_EMBEDDING_MODELS = (process.env.GATEWAY_TEST_EMBEDDING_MODELS || "")
    .split(",").map(s => s.trim()).filter(Boolean);

const DEFAULT_MODERATION_MODELS = (process.env.GATEWAY_TEST_MODERATION_MODELS || "")
    .split(",").map(s => s.trim()).filter(Boolean);

const DEFAULT_IMAGE_OUTPUT_MODELS = (process.env.GATEWAY_TEST_IMAGE_OUTPUT_MODELS || "")
    .split(",").map(s => s.trim()).filter(Boolean);

const IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg";

function parseArgs(argv) {
    const out = {
        baseUrl: DEFAULT_BASE_URL,
        apiKey: DEFAULT_API_KEY,
        protocol: null,
        protocols: [...DEFAULT_PROTOCOLS],
        models: [],
        cases: [],
        trace: false,
        show: false,
        listCases: false,
        outDir: null,
        embeddingModels: [...DEFAULT_EMBEDDING_MODELS],
        moderationModels: [...DEFAULT_MODERATION_MODELS],
        imageOutputModels: [...DEFAULT_IMAGE_OUTPUT_MODELS],
        errorModel: null,
        requireImageOutput: false,
        strict: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--base-url") out.baseUrl = argv[++i];
        else if (arg === "--api-key") out.apiKey = argv[++i];
        else if (arg === "--protocol") out.protocol = argv[++i];
        else if (arg === "--protocols") out.protocols = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
        else if (arg === "--model") out.models.push(argv[++i]);
        else if (arg === "--models") out.models.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--case") out.cases.push(argv[++i]);
        else if (arg === "--cases") out.cases.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--embedding-model") out.embeddingModels.push(argv[++i]);
        else if (arg === "--embedding-models") out.embeddingModels.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--moderation-model") out.moderationModels.push(argv[++i]);
        else if (arg === "--moderation-models") out.moderationModels.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--image-output-model") out.imageOutputModels.push(argv[++i]);
        else if (arg === "--image-output-models") out.imageOutputModels.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--error-model") out.errorModel = argv[++i];
        else if (arg === "--require-image-output") out.requireImageOutput = true;
        else if (arg === "--strict") out.strict = true;
        else if (arg === "--trace") out.trace = true;
        else if (arg === "--show") out.show = true;
        else if (arg === "--list-cases") out.listCases = true;
        else if (arg === "--out-dir") out.outDir = argv[++i];
    }

    if (out.protocol) out.protocols = [out.protocol];

    return out;
}

function listCases() {
    return ["text", "reasoning", "image", "tool", "structured", "stream", "image_output", "error"];
}

function buildCase(protocol, name, model, opts) {
    if (protocol === "responses") {
        if (name === "text") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Say hello in one short sentence." }] }
                ],
                stream: false,
            };
        }
        if (name === "reasoning") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Solve 12*13 and explain your reasoning briefly." }] }
                ],
                reasoning: { effort: "medium", summary: "auto" },
                stream: false,
            };
        }
        if (name === "image") {
            return {
                model,
                input: [
                    {
                        role: "user",
                        content: [
                            { type: "input_text", text: "What is in this image?" },
                            { type: "input_image", image_url: IMAGE_URL },
                        ],
                    },
                ],
                stream: false,
            };
        }
        if (name === "image_output") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Generate an image of a red circle on a white background." }] }
                ],
                stream: false,
            };
        }
        if (name === "tool") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Call the weather tool for London." }] }
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get weather by city",
                            parameters: {
                                type: "object",
                                properties: {
                                    city: { type: "string" },
                                },
                                required: ["city"],
                            },
                        },
                    },
                ],
                tool_choice: "required",
                stream: false,
            };
        }
        if (name === "structured") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Return JSON with fields name and city." }] }
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "person",
                        schema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                city: { type: "string" },
                            },
                            required: ["name", "city"],
                        },
                        strict: true,
                    },
                },
                stream: false,
            };
        }
        if (name === "stream") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Stream back a short sentence." }] }
                ],
                stream: true,
            };
        }
        if (name === "error") {
            return {
                model: opts.errorModel || `${model}-does-not-exist`,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Trigger an error." }] }
                ],
                stream: false,
            };
        }
    }

    if (protocol === "chat") {
        if (name === "text") {
            return {
                model,
                messages: [
                    { role: "user", content: "Say hello in one short sentence." },
                ],
                stream: false,
            };
        }
        if (name === "reasoning") {
            return {
                model,
                messages: [
                    { role: "user", content: "Solve 12*13 and explain your reasoning briefly." },
                ],
                reasoning: { effort: "medium", summary: "auto" },
                stream: false,
            };
        }
        if (name === "image") {
            return {
                model,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "What is in this image?" },
                            { type: "image_url", image_url: { url: IMAGE_URL } },
                        ],
                    },
                ],
                stream: false,
            };
        }
        if (name === "image_output") {
            return {
                model,
                messages: [
                    { role: "user", content: "Generate an image of a red circle on a white background." },
                ],
                stream: false,
            };
        }
        if (name === "tool") {
            return {
                model,
                messages: [
                    { role: "user", content: "Call the weather tool for London." },
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get weather by city",
                            parameters: {
                                type: "object",
                                properties: {
                                    city: { type: "string" },
                                },
                                required: ["city"],
                            },
                        },
                    },
                ],
                tool_choice: "required",
                stream: false,
            };
        }
        if (name === "structured") {
            return {
                model,
                messages: [
                    { role: "user", content: "Return JSON with fields name and city." },
                ],
                response_format: {
                    type: "json_schema",
                    schema: {
                        name: "person",
                        schema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                city: { type: "string" },
                            },
                            required: ["name", "city"],
                        },
                        strict: true,
                    },
                },
                stream: false,
            };
        }
        if (name === "stream") {
            return {
                model,
                messages: [
                    { role: "user", content: "Stream back a short sentence." },
                ],
                stream: true,
            };
        }
        if (name === "error") {
            return {
                model: opts.errorModel || `${model}-does-not-exist`,
                messages: [
                    { role: "user", content: "Trigger an error." },
                ],
                stream: false,
            };
        }
    }

    if (protocol === "messages") {
        if (name === "text") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Say hello in one short sentence." }] },
                ],
                stream: false,
                max_tokens: 256,
            };
        }
        if (name === "reasoning") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Solve 12*13 and explain your reasoning briefly." }] },
                ],
                stream: false,
                max_tokens: 256,
            };
        }
        if (name === "image") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "What is in this image?" },
                            { type: "image", source: { type: "url", url: IMAGE_URL } },
                        ],
                    },
                ],
                stream: false,
                max_tokens: 256,
            };
        }
        if (name === "tool") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Call the weather tool for London." }] },
                ],
                tools: [
                    {
                        name: "get_weather",
                        description: "Get weather by city",
                        input_schema: {
                            type: "object",
                            properties: {
                                city: { type: "string" },
                            },
                            required: ["city"],
                        },
                    },
                ],
                tool_choice: { type: "tool", name: "get_weather" },
                stream: false,
                max_tokens: 256,
            };
        }
        if (name === "stream") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Stream back a short sentence." }] },
                ],
                stream: true,
                max_tokens: 256,
            };
        }
        if (name === "error") {
            return {
                model: opts.errorModel || `${model}-does-not-exist`,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Trigger an error." }] },
                ],
                stream: false,
                max_tokens: 16,
            };
        }
    }

    throw new Error(`Unknown case: ${name} for protocol: ${protocol}`);
}

function endpointForProtocol(protocol) {
    if (protocol === "responses") return "/v1/responses";
    if (protocol === "chat") return "/v1/chat/completions";
    if (protocol === "messages") return "/v1/messages";
    if (protocol === "embeddings") return "/v1/embeddings";
    if (protocol === "moderations") return "/v1/moderations";
    throw new Error(`Unknown protocol: ${protocol}`);
}

function assertResponse(protocol, json) {
    if (!json || typeof json !== "object") return "Response is not JSON";
    if (json.error || json?.error?.message) return "Response contains error";
    if (protocol === "responses" && json.object !== "response") return "Expected response object";
    if (protocol === "chat" && json.object !== "chat.completion") return "Expected chat.completion object";
    if (protocol === "messages" && json.type !== "message") return "Expected message object";
    return null;
}

function assertEmbeddings(json) {
    if (!json || typeof json !== "object") return "Embeddings response is not JSON";
    if (!Array.isArray(json.data)) return "Embeddings response missing data[]";
    if (json.data.length === 0) return "Embeddings response has empty data[]";
    return null;
}

function assertModerations(json) {
    if (!json || typeof json !== "object") return "Moderations response is not JSON";
    if (!Array.isArray(json.results)) return "Moderations response missing results[]";
    if (json.results.length === 0) return "Moderations response has empty results[]";
    return null;
}

function assertErrorResponse(json) {
    if (!json || typeof json !== "object") return "Error response is not JSON";
    if (typeof json.error !== "string") return "Error response missing error code";
    if (typeof json.description !== "string") return "Error response missing description";
    if (typeof json.generation_id !== "string") return "Error response missing generation_id";
    return null;
}

function extractText(protocol, json) {
    if (!json || typeof json !== "object") return "";
    if (protocol === "responses") {
        const parts = [];
        for (const item of json.output || []) {
            if (item?.type === "message" && Array.isArray(item.content)) {
                for (const part of item.content) {
                    if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
                }
            }
        }
        return parts.join("");
    }
    if (protocol === "chat") {
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
            return content.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
        }
        return "";
    }
    if (protocol === "messages") {
        const parts = [];
        for (const block of json.content || []) {
            if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
        }
        return parts.join("");
    }
    return "";
}

function countToolCalls(protocol, json) {
    if (!json || typeof json !== "object") return 0;
    if (protocol === "responses") {
        return (json.output || []).filter((item) => item?.type === "function_call").length;
    }
    if (protocol === "chat") {
        return (json?.choices?.[0]?.message?.tool_calls || []).length;
    }
    if (protocol === "messages") {
        return (json.content || []).filter((block) => block?.type === "tool_use").length;
    }
    return 0;
}

function countImageParts(protocol, json) {
    if (!json || typeof json !== "object") return 0;
    if (protocol === "responses") {
        let count = 0;
        for (const item of json.output || []) {
            if (item?.type === "message" && Array.isArray(item.content)) {
                for (const part of item.content) {
                    if (part?.type === "image" || part?.type === "output_image") count++;
                }
            }
        }
        return count;
    }
    if (protocol === "chat") {
        const content = json?.choices?.[0]?.message?.content;
        if (!Array.isArray(content)) return 0;
        return content.filter((p) => p?.type === "image_url" || p?.type === "image").length;
    }
    if (protocol === "messages") {
        return (json.content || []).filter((block) => block?.type === "image").length;
    }
    return 0;
}

async function readStreamAsJsonFrames(res) {
    const reader = res.body?.getReader();
    if (!reader) return [];
    const decoder = new TextDecoder();
    let buf = "";
    const frames = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split(/\n\n/);
        buf = chunks.pop() ?? "";
        for (const raw of chunks) {
            const lines = raw.split(/\n/);
            let data = "";
            for (const line of lines) {
                const l = line.replace(/\r$/, "");
                if (l.startsWith("data:")) data += l.slice(5).trimStart();
            }
            if (!data || data === "[DONE]") continue;
            try {
                frames.push(JSON.parse(data));
            } catch {
                // ignore invalid frame
            }
        }
    }
    return frames;
}

async function writeOut(outDir, requestId, payload) {
    if (!outDir) return;
    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${requestId}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
}

function isCaseSupported(protocol, name) {
    if (protocol === "messages" && name === "structured") return false;
    if (protocol === "messages" && name === "image_output") return false;
    return true;
}

async function runEmbeddingTests(args, results) {
    if (args.embeddingModels.length === 0) return;
    const endpoint = endpointForProtocol("embeddings");
    const baseUrl = args.baseUrl.replace(/\/+$/, "");

    for (const model of args.embeddingModels) {
        const url = `${baseUrl}${endpoint}`;
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${args.apiKey}`,
        };
        if (args.trace) headers["x-gateway-trace"] = "true";
        const body = { model, input: "Embed this short sentence." };
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
        let json = null;
        try {
            json = await res.json();
        } catch {
            json = { error: "invalid_json_response" };
        }
        const error = res.ok ? assertEmbeddings(json) : `HTTP ${res.status}`;
        results.push({ model, case: "embeddings", status: res.status, error });
        if (args.show) {
            console.log(`\n[embeddings] ${model} -> ${res.status}`);
            console.log(JSON.stringify(json, null, 2));
        }
        const requestId = json?.id || json?.requestId || json?.generation_id || `${model}_embeddings`;
        await writeOut(args.outDir, requestId, json);
    }
}

async function runModerationTests(args, results) {
    if (args.moderationModels.length === 0) return;
    const endpoint = endpointForProtocol("moderations");
    const baseUrl = args.baseUrl.replace(/\/+$/, "");

    for (const model of args.moderationModels) {
        const url = `${baseUrl}${endpoint}`;
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${args.apiKey}`,
        };
        if (args.trace) headers["x-gateway-trace"] = "true";
        const body = {
            model,
            input: "This is a safe, neutral sentence for moderation testing.",
        };
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
        let json = null;
        try {
            json = await res.json();
        } catch {
            json = { error: "invalid_json_response" };
        }
        const error = res.ok ? assertModerations(json) : `HTTP ${res.status}`;
        results.push({ model, case: "moderations", status: res.status, error });
        if (args.show) {
            console.log(`\n[moderations] ${model} -> ${res.status}`);
            console.log(JSON.stringify(json, null, 2));
        }
        const requestId = json?.id || json?.requestId || json?.generation_id || `${model}_moderations`;
        await writeOut(args.outDir, requestId, json);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.listCases) {
        console.log(listCases().join("\n"));
        return;
    }
    if (!args.apiKey) {
        console.error("Missing API key. Set AI_STATS_API_KEY or pass --api-key.");
        process.exit(1);
    }

    if (args.models.length === 0) {
        args.models = [...DEFAULT_MODELS];
    }

    if (args.cases.length === 0) {
        args.cases = [...DEFAULT_CASES];
    }

    const baseUrl = args.baseUrl.replace(/\/+$/, "");
    const results = [];

    for (const protocol of args.protocols) {
        const endpoint = endpointForProtocol(protocol);
        for (const model of args.models) {
            for (const name of args.cases) {
                if (!isCaseSupported(protocol, name)) {
                    results.push({ model, case: `${protocol}:${name}`, status: 0, error: "SKIPPED" });
                    continue;
                }
                if (name === "image_output" && args.imageOutputModels.length === 0) {
                    results.push({ model, case: `${protocol}:${name}`, status: 0, error: "SKIPPED" });
                    continue;
                }
                if (name === "image_output" && args.imageOutputModels.length > 0 && !args.imageOutputModels.includes(model)) {
                    results.push({ model, case: `${protocol}:${name}`, status: 0, error: "SKIPPED" });
                    continue;
                }

                const body = buildCase(protocol, name, model, args);
                const url = `${baseUrl}${endpoint}`;
                const headers = {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${args.apiKey}`,
                };
                if (args.trace) headers["x-gateway-trace"] = "true";

                const res = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(body),
                });

                if (name === "stream") {
                    let error = null;
                    if (!res.ok) error = `HTTP ${res.status}`;
                    const frames = res.ok ? await readStreamAsJsonFrames(res) : [];
                    if (res.ok && frames.length === 0) error = "Stream returned no frames";
                    results.push({ model, case: `${protocol}:${name}`, status: res.status, error });
                    if (args.show && res.ok) {
                        console.log(`\n[${protocol}] ${model} / ${name} -> ${res.status}`);
                        console.log(JSON.stringify(frames.slice(0, 5), null, 2));
                    }
                    await writeOut(args.outDir, `${model}_${protocol}_${name}`, frames);
                    continue;
                }

                let json = null;
                try {
                    json = await res.json();
                } catch {
                    json = { error: "invalid_json_response" };
                }

                let error = null;
                if (name === "error") {
                    error = assertErrorResponse(json);
                } else if (res.ok) {
                    error = assertResponse(protocol, json);
                    if (!error && name === "tool" && countToolCalls(protocol, json) === 0) {
                        error = "Expected tool call but none were returned";
                    }
                    if (!error && name === "structured") {
                        const text = extractText(protocol, json).trim();
                        try {
                            const parsed = JSON.parse(text);
                            if (!parsed || typeof parsed !== "object") error = "Structured output is not a JSON object";
                        } catch {
                            error = "Structured output is not valid JSON";
                        }
                    }
                    if (!error && name === "image_output") {
                        const imageCount = countImageParts(protocol, json);
                        if (imageCount === 0) {
                            error = args.requireImageOutput ? "Expected image output but none were returned" : "WARN: no image parts returned";
                        }
                    }
                } else {
                    error = `HTTP ${res.status}`;
                }

                const requestId = json?.id || json?.requestId || json?.generation_id || `${model}_${name}`;
                results.push({ model, case: `${protocol}:${name}`, status: res.status, error, requestId: name === "error" ? requestId : undefined });

                if (args.show) {
                    console.log(`\n[${protocol}] ${model} / ${name} -> ${res.status}`);
                    console.log(JSON.stringify(json, null, 2));
                }

                await writeOut(args.outDir, requestId, json);
            }
        }
    }

    await runEmbeddingTests(args, results);
    await runModerationTests(args, results);

    const failed = results.filter(r => r.error && !String(r.error).startsWith("WARN") && r.error !== "SKIPPED");
    const warned = results.filter(r => typeof r.error === "string" && r.error.startsWith("WARN"));

    console.log("\nResults:");
    for (const r of results) {
        let status = "OK";
        if (r.error === "SKIPPED") status = "SKIP";
        else if (r.error && String(r.error).startsWith("WARN")) status = `WARN (${r.error})`;
        else if (r.error) status = `FAIL (${r.error})`;
        console.log(`${r.model} / ${r.case}: ${status}`);
        if (r.requestId && r.error && !String(r.error).startsWith("WARN")) {
            console.log(`  error requestId: ${r.requestId} (check Axiom for details)`);
        }
    }

    if (failed.length) process.exit(1);
    if (warned.length && args.strict) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
