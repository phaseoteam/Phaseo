// Purpose: Public endpoint metadata for model discovery routes.
// Why: Keeps endpoint IDs, user-facing paths, and model collections consistent.
// How: Maps catalogue capability IDs to stable API paths and collection names.

export type ModelCollectionSlug =
    | "text"
    | "images"
    | "videos"
    | "audio"
    | "embeddings"
    | "rerank"
    | "ocr"
    | "music"
    | "batches";

export type EndpointMetadata = {
    id: string;
    public_path: string;
    collection: ModelCollectionSlug;
    aliases: string[];
};

const ENDPOINT_METADATA: EndpointMetadata[] = [
    {
        id: "chat/completions",
        public_path: "/v1/chat/completions",
        collection: "text",
        aliases: ["chat.completions", "/v1/chat/completions"],
    },
    {
        id: "responses",
        public_path: "/v1/responses",
        collection: "text",
        aliases: ["/v1/responses"],
    },
    {
        id: "messages",
        public_path: "/v1/messages",
        collection: "text",
        aliases: ["/v1/messages"],
    },
    {
        id: "embeddings",
        public_path: "/v1/embeddings",
        collection: "embeddings",
        aliases: ["/v1/embeddings"],
    },
    {
        id: "rerank",
        public_path: "/v1/rerank",
        collection: "rerank",
        aliases: ["/v1/rerank"],
    },
    {
        id: "audio/speech",
        public_path: "/v1/audio/speech",
        collection: "audio",
        aliases: ["audio.speech", "/v1/audio/speech"],
    },
    {
        id: "audio/transcriptions",
        public_path: "/v1/audio/transcriptions",
        collection: "audio",
        aliases: ["audio.transcriptions", "/v1/audio/transcriptions"],
    },
    {
        id: "audio/translations",
        public_path: "/v1/audio/translations",
        collection: "audio",
        aliases: ["audio.translations", "/v1/audio/translations"],
    },
    {
        id: "images/generations",
        public_path: "/v1/images/generations",
        collection: "images",
        aliases: ["images.generate", "images.generations", "/v1/images/generations"],
    },
    {
        id: "images/edits",
        public_path: "/v1/images/edits",
        collection: "images",
        aliases: ["images.edit", "images.edits", "/v1/images/edits"],
    },
    {
        id: "video.generation",
        public_path: "/v1/videos",
        collection: "videos",
        aliases: ["video.generate", "video.generations", "videos", "/v1/videos"],
    },
    {
        id: "videos",
        public_path: "/v1/videos",
        collection: "videos",
        aliases: ["video.generation", "video.generate", "video.generations", "/v1/videos"],
    },
    {
        id: "ocr",
        public_path: "/v1/ocr",
        collection: "ocr",
        aliases: ["/v1/ocr"],
    },
    {
        id: "music/generate",
        public_path: "/v1/music/generate",
        collection: "music",
        aliases: ["music.generations", "/v1/music/generate", "/v1/music/generations"],
    },
    {
        id: "batch",
        public_path: "/v1/batches",
        collection: "batches",
        aliases: ["batches", "/v1/batches"],
    },
    {
        id: "batches",
        public_path: "/v1/batches",
        collection: "batches",
        aliases: ["batch", "/v1/batches"],
    },
];

const METADATA_BY_ID = new Map(ENDPOINT_METADATA.flatMap((item) => {
    const keys = [item.id, item.public_path, ...item.aliases].map((value) => value.toLowerCase());
    return keys.map((key) => [key, item] as const);
}));

export function listEndpointMetadata(): EndpointMetadata[] {
    return [...ENDPOINT_METADATA];
}

export function getEndpointMetadata(endpoint: string): EndpointMetadata {
    const normalized = endpoint.trim().toLowerCase();
    return METADATA_BY_ID.get(normalized) ?? {
        id: endpoint,
        public_path: endpoint.startsWith("/") ? endpoint : `/v1/${endpoint}`,
        collection: "text",
        aliases: [],
    };
}

export function getPublicEndpointPath(endpoint: string): string {
    return getEndpointMetadata(endpoint).public_path;
}

