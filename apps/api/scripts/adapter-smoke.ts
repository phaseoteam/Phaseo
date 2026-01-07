import { readFile } from "node:fs/promises";

type ParsedArgs = {
    endpoint?: string;
    model?: string;
    provider?: string;
    url?: string;
    prompt?: string;
    jsonPath?: string;
    stream?: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
    const out: ParsedArgs = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg) continue;
        switch (arg) {
            case "--endpoint":
                out.endpoint = argv[++i];
                break;
            case "--model":
                out.model = argv[++i];
                break;
            case "--provider":
                out.provider = argv[++i];
                break;
            case "--url":
                out.url = argv[++i];
                break;
            case "--prompt":
                out.prompt = argv[++i];
                break;
            case "--json":
                out.jsonPath = argv[++i];
                break;
            case "--stream":
                out.stream = true;
                break;
            default:
                break;
        }
    }
    return out;
}

function resolveEndpointPath(endpoint: string): string | null {
    const trimmed = endpoint.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/v1/")) return trimmed;

    const table: Record<string, string> = {
        "chat.completions": "/v1/chat/completions",
        "responses": "/v1/responses",
        "embeddings": "/v1/embeddings",
        "moderations": "/v1/moderations",
        "audio.speech": "/v1/audio/speech",
        "audio.transcription": "/v1/audio/transcriptions",
        "audio.translations": "/v1/audio/translations",
        "images.generations": "/v1/images/generations",
        "images.edits": "/v1/images/edits",
        "video.generation": "/v1/videos",
    };
    return table[trimmed] ?? null;
}

function defaultBody(endpoint: string, model: string, prompt: string, stream: boolean, provider?: string) {
    const providerHint = provider ? { provider: { only: [provider] } } : {};
    switch (endpoint) {
        case "chat.completions":
            return {
                model,
                messages: [{ role: "user", content: prompt }],
                stream,
                ...providerHint,
            };
        case "responses":
            return {
                model,
                input: prompt,
                stream,
                ...providerHint,
            };
        case "embeddings":
            return {
                model,
                input: prompt,
                ...providerHint,
            };
        default:
            return null;
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const endpoint = args.endpoint ?? process.env.ADAPTER_ENDPOINT;
    const model = args.model ?? process.env.ADAPTER_MODEL;
    const provider = args.provider ?? process.env.ADAPTER_PROVIDER;
    const baseUrl = args.url ?? process.env.GATEWAY_URL ?? "http://localhost:8787";
    const prompt = args.prompt ?? process.env.ADAPTER_PROMPT ?? "Hello from adapter smoke";
    const stream = Boolean(args.stream ?? (process.env.ADAPTER_STREAM === "1"));

    if (!endpoint || !model) {
        console.error("Missing --endpoint or --model.");
        console.error("Usage: tsx apps/api/scripts/adapter-smoke.ts --endpoint chat.completions --model gpt-4o-mini --provider openai --prompt \"hi\"");
        process.exit(1);
    }

    const path = resolveEndpointPath(endpoint);
    if (!path) {
        console.error(`Unsupported endpoint: ${endpoint}`);
        process.exit(1);
    }

    let body: any = null;
    if (args.jsonPath) {
        const raw = await readFile(args.jsonPath, "utf8");
        body = JSON.parse(raw);
    } else {
        body = defaultBody(endpoint, model, prompt, stream, provider);
    }

    if (!body) {
        console.error("No request body. Provide --json for this endpoint.");
        process.exit(1);
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const key = process.env.GATEWAY_API_KEY;
    if (key) {
        headers.Authorization = `Bearer ${key}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (stream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            process.stdout.write(chunk);
        }
        return;
    }

    const text = await res.text();
    console.log(text);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
