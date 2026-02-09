// Purpose: Capability-to-endpoint mapping for the gateway.
// Why: Keeps capability routing explicit and centralized.
// How: Exposes lookup helpers used during request normalization.

// Config file mapping capabilities to supported endpoints
export const capabilityToEndpoints: Record<string, string[]> = {
    "text.generate": ["/chat/completions", "/responses", "/messages"],
    "text.embed": ["/embeddings"],
    "image.generate": ["/images/generations"],
    "images.generate": ["/images/generations"],
    "images.generations": ["/images/generations"],
    "image.edit": ["/images/edits"],
    "images.edits": ["/images/edits"],
    "image.vary": ["/images/variations"],
    "audio.transcription": ["/audio/transcriptions"],
    "audio.transcribe": ["/audio/transcriptions"],
    "audio.translations": ["/audio/translations"],
    "audio.translate": ["/audio/translations"],
    "audio.speech": ["/audio/speech"],
    "audio.realtime": ["/audio/realtime"],
    "moderation": ["/moderations"],
    "moderations.create": ["/moderations"],
    "batch": ["/batch", "/batches"],
    "batch.create": ["/batches"],
    "ocr": ["/ocr"],
    "music.generate": ["/music/generate", "/music/generations"],
    "video.generation": ["/videos", "/video/generations"],
    "video.generate": ["/videos", "/video/generations"],
    "video.generations": ["/videos", "/video/generations"],
    // Add more as needed
};

// Reverse map for lookup
export const endpointToCapability: Record<string, string> = {};
for (const [cap, endpoints] of Object.entries(capabilityToEndpoints)) {
    for (const ep of endpoints) {
        if (!endpointToCapability[ep]) {
            endpointToCapability[ep] = cap;
        }
    }
}

const ENDPOINT_TO_PATH: Record<string, string> = {
    "chat.completions": "/chat/completions",
    responses: "/responses",
    messages: "/messages",
    embeddings: "/embeddings",
    moderations: "/moderations",
    "images.generations": "/images/generations",
    "images.edits": "/images/edits",
    "audio.speech": "/audio/speech",
    "audio.transcription": "/audio/transcriptions",
    "audio.transcriptions": "/audio/transcriptions",
    "audio.translations": "/audio/translations",
    "audio.realtime": "/audio/realtime",
    "video.generation": "/videos",
    "video.generations": "/video/generations",
    batch: "/batch",
    "music.generate": "/music/generate",
    ocr: "/ocr",
};

export function resolveCapabilityFromEndpoint(endpoint: string): string {
    const normalized = endpoint.trim().toLowerCase();
    if (capabilityToEndpoints[normalized]) return normalized;
    const path = normalized.startsWith("/")
        ? normalized
        : ENDPOINT_TO_PATH[normalized] ?? `/${normalized.replace(/\.+/g, "/")}`;
    return endpointToCapability[path] ?? normalized;
}

