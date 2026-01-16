const ENDPOINT_PATHS: Record<string, string> = {
    "chat.completions": "/chat/completions",
    "text.completions": "/chat/completions",
    messages: "/messages",
    responses: "/responses",
    "image.generations": "/images/generations",
    "images.generations": "/images/generations",
    "images.generation": "/images/generations",
    "image.generation": "/images/generations",
    "images.edits": "/images/edits",
    "image.edits": "/images/edits",
    "images.edit": "/images/edits",
    "video.generations": "/video/generations",
    "video.generation": "/video/generations",
    "audio.speech": "/audio/speech",
    "audio.realtime": "/audio/realtime",
    "audio.transcription": "/audio/transcriptions",
    "audio.transcriptions": "/audio/transcriptions",
    "audio.translation": "/audio/translations",
    "audio.translations": "/audio/translations",
    embeddings: "/embeddings",
    moderations: "/moderations",
    "moderations.create": "/moderations",
    moderation: "/moderations",
    batch: "/batches",
    "batch.create": "/batches",
    "music.generate": "/music/generations",
};

export function resolveGatewayPath(endpoint?: string | null): string {
    if (!endpoint) return ENDPOINT_PATHS["chat.completions"];
    const normalized = endpoint.toLowerCase();
    const mapped = ENDPOINT_PATHS[normalized];
    if (mapped) return mapped;
    const fallback = `/${normalized.replace(/\.+/g, "/")}`;
    return fallback.startsWith("/") ? fallback : `/${fallback}`;
}
