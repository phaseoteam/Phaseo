#!/usr/bin/env node
"use strict";

const DEFAULT_BASE_URL = process.env.AI_STATS_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || "http://localhost:8787";

const DEFAULT_API_KEY = process.env.AI_STATS_API_KEY
    || process.env.GATEWAY_API_KEY
    || "";

const IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg";

function parseArgs(argv) {
    const out = {
        baseUrl: DEFAULT_BASE_URL,
        apiKey: DEFAULT_API_KEY,
        protocol: "responses",
        models: [],
        cases: [],
        trace: false,
        show: false,
        listCases: false,
        outDir: null,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--base-url") out.baseUrl = argv[++i];
        else if (arg === "--api-key") out.apiKey = argv[++i];
        else if (arg === "--protocol") out.protocol = argv[++i];
        else if (arg === "--model") out.models.push(argv[++i]);
        else if (arg === "--models") out.models.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--case") out.cases.push(argv[++i]);
        else if (arg === "--cases") out.cases.push(...argv[++i].split(",").map(s => s.trim()).filter(Boolean));
        else if (arg === "--trace") out.trace = true;
        else if (arg === "--show") out.show = true;
        else if (arg === "--list-cases") out.listCases = true;
        else if (arg === "--out-dir") out.outDir = argv[++i];
    }

    return out;
}

function listCases() {
    return ["text", "reasoning", "image", "tool"];
}

function buildCase(protocol, name, model) {
    if (protocol === "responses") {
        if (name === "text") {
            return {
                body: {
                    model,
                    input: [
                        { role: "user", content: [{ type: "input_text", text: "Say hello in one short sentence." }] }
                    ],
                    stream: false,
                    usage: true,
                    meta: true,
                },
            };
        }
        if (name === "reasoning") {
            return {
                body: {
                    model,
                    input: [
                        { role: "user", content: [{ type: "input_text", text: "Solve 12*13 and explain your reasoning briefly." }] }
                    ],
                    reasoning: { effort: "medium", summary: "auto" },
                    stream: false,
                    usage: true,
                    meta: true,
                },
            };
        }
        if (name === "image") {
            return {
                body: {
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
                    usage: true,
                    meta: true,
                },
            };
        }
        if (name === "tool") {
            return {
                body: {
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
                    usage: true,
                    meta: true,
                },
            };
        }
    }

    if (protocol === "chat") {
        if (name === "text") {
            return {
                body: {
                    model,
                    messages: [
                        { role: "user", content: "Say hello in one short sentence." },
                    ],
                    stream: false,
                    usage: true,
                    meta: true,
                },
            };
        }
        if (name === "reasoning") {
            return {
                body: {
                    model,
                    messages: [
                        { role: "user", content: "Solve 12*13 and explain your reasoning briefly." },
                    ],
                    reasoning: { effort: "medium", summary: "auto" },
                    stream: false,
                    usage: true,
                    meta: true,
                },
            };
        }
        if (name === "image") {
            return {
                body: {
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
                    usage: true,
                    meta: true,
                },
            };
        }
        if (name === "tool") {
            return {
                body: {
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
                    usage: true,
                    meta: true,
                },
            };
        }
    }

    if (protocol === "messages") {
        if (name === "text") {
            return {
                body: {
                    model,
                    system: "You are a helpful assistant.",
                    messages: [
                        { role: "user", content: [{ type: "text", text: "Say hello in one short sentence." }] },
                    ],
                    stream: false,
                    usage: true,
                    meta: true,
                    max_tokens: 256,
                },
            };
        }
        if (name === "reasoning") {
            return {
                body: {
                    model,
                    system: "You are a helpful assistant.",
                    messages: [
                        { role: "user", content: [{ type: "text", text: "Solve 12*13 and explain your reasoning briefly." }] },
                    ],
                    stream: false,
                    usage: true,
                    meta: true,
                    max_tokens: 256,
                },
            };
        }
        if (name === "image") {
            return {
                body: {
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
                    usage: true,
                    meta: true,
                    max_tokens: 256,
                },
            };
        }
        if (name === "tool") {
            return {
                body: {
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
                    usage: true,
                    meta: true,
                    max_tokens: 256,
                },
            };
        }
    }

    throw new Error(`Unknown case: ${name} for protocol: ${protocol}`);
}

function endpointForProtocol(protocol) {
    if (protocol === "responses") return "/v1/responses";
    if (protocol === "chat") return "/v1/chat/completions";
    if (protocol === "messages") return "/v1/messages";
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

async function writeOut(outDir, requestId, payload) {
    if (!outDir) return;
    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${requestId}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
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
        console.error("Missing models. Use --model or --models.");
        process.exit(1);
    }
    if (args.cases.length === 0) {
        args.cases = listCases();
    }

    const endpoint = endpointForProtocol(args.protocol);
    const baseUrl = args.baseUrl.replace(/\/+$/, "");

    const results = [];
    for (const model of args.models) {
        for (const name of args.cases) {
            const { body } = buildCase(args.protocol, name, model);
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
            let json = null;
            try {
                json = await res.json();
            } catch {
                json = { error: "invalid_json_response" };
            }
            const error = res.ok ? assertResponse(args.protocol, json) : `HTTP ${res.status}`;
            const requestId = json?.id || json?.requestId || json?.generation_id || `${model}_${name}`;
            results.push({ model, case: name, status: res.status, error });
            if (args.show) {
                console.log(`\n[${args.protocol}] ${model} / ${name} -> ${res.status}`);
                console.log(JSON.stringify(json, null, 2));
            }
            await writeOut(args.outDir, requestId, json);
        }
    }

    const failed = results.filter(r => r.error);
    console.log("\nResults:");
    for (const r of results) {
        const status = r.error ? `FAIL (${r.error})` : "OK";
        console.log(`${r.model} / ${r.case}: ${status}`);
    }
    if (failed.length) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
