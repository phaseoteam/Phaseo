// Purpose: Stable public metadata for model capability discovery.
// Why: Catalogue capability IDs do not always match public API paths.
// How: Maps canonical IDs and compatibility aliases to one documented endpoint record.

export type EndpointCollection =
    | "text"
    | "images"
    | "video"
    | "audio"
    | "embeddings"
    | "rerank"
    | "decisions"
    | "moderation"
    | "ocr"
    | "parse"
    | "music"
    | "batch"
    | "files";

export type EndpointMetadata = {
    id: string;
    public_path: string;
    collection: EndpointCollection;
    aliases: string[];
};

const ENDPOINT_METADATA: EndpointMetadata[] = [
    {
        id: "chat.completions",
        public_path: "/v1/chat/completions",
        collection: "text",
        aliases: ["chat/completions", "text.generate", "audio"],
    },
    {
        id: "responses",
        public_path: "/v1/responses",
        collection: "text",
        aliases: [],
    },
    {
        id: "messages",
        public_path: "/v1/messages",
        collection: "text",
        aliases: [],
    },
    {
        id: "images.generations",
        public_path: "/v1/images/generations",
        collection: "images",
        aliases: ["images/generations", "image.generate", "image.generations"],
    },
    {
        id: "images.edits",
        public_path: "/v1/images/edits",
        collection: "images",
        aliases: ["images/edits", "image.edit"],
    },
    {
        id: "video.generation",
        public_path: "/v1/videos",
        collection: "video",
        aliases: ["video.generate", "video.generations", "video.edit", "videos"],
    },
    {
        id: "audio.speech",
        public_path: "/v1/audio/speech",
        collection: "audio",
        aliases: ["audio/speech", "audio.generate"],
    },
    {
        id: "audio.transcription",
        public_path: "/v1/audio/transcriptions",
        collection: "audio",
        aliases: ["audio.transcriptions", "audio/transcriptions", "audio.transcribe"],
    },
    {
        id: "audio.translations",
        public_path: "/v1/audio/translations",
        collection: "audio",
        aliases: ["audio/translations"],
    },
    {
        id: "audio.realtime",
        public_path: "/v1/realtime/sessions",
        collection: "audio",
        aliases: ["realtime"],
    },
    {
        id: "embeddings",
        public_path: "/v1/embeddings",
        collection: "embeddings",
        aliases: ["text.embed"],
    },
    {
        id: "rerank",
        public_path: "/v1/rerank",
        collection: "rerank",
        aliases: ["text.rerank"],
    },
    {
        id: "decisions.make",
        public_path: "/v1/systemone",
        collection: "decisions",
        aliases: ["systemone", "system.one", "decision.make", "typed.decisions"],
    },
    {
        id: "moderations",
        public_path: "/v1/moderations",
        collection: "moderation",
        aliases: ["moderation", "text.moderate"],
    },
    {
        id: "ocr",
        public_path: "/v1/ocr",
        collection: "ocr",
        aliases: [],
    },
    {
        id: "parse",
        public_path: "/v1/parse",
        collection: "parse",
        aliases: ["document.parse"],
    },
    {
        id: "music.generate",
        public_path: "/v1/music/generate",
        collection: "music",
        aliases: ["music/generate"],
    },
    {
        id: "batch",
        public_path: "/v1/batches",
        collection: "batch",
        aliases: ["batches"],
    },
    {
        id: "files.upload",
        public_path: "/v1/files",
        collection: "files",
        aliases: ["files"],
    },
    {
        id: "files.list",
        public_path: "/v1/files",
        collection: "files",
        aliases: [],
    },
    {
        id: "files.retrieve",
        public_path: "/v1/files/{id}",
        collection: "files",
        aliases: [],
    },
];

const METADATA_BY_KEY = new Map(
    ENDPOINT_METADATA.flatMap((metadata) =>
        [metadata.id, metadata.public_path, ...metadata.aliases].map(
            (key) => [key.toLowerCase(), metadata] as const,
        ),
    ),
);

export function listEndpointMetadata(): EndpointMetadata[] {
    return ENDPOINT_METADATA.map((metadata) => ({
        ...metadata,
        aliases: [...metadata.aliases],
    }));
}
export function getEndpointMetadata(endpoint: string): EndpointMetadata {
    const normalized = endpoint.trim().toLowerCase();
    const metadata = METADATA_BY_KEY.get(normalized);
    if (metadata) {
        return { ...metadata, aliases: [...metadata.aliases] };
    }
    throw new Error(`Unsupported public capability metadata: ${endpoint}`);
}

export function findEndpointMetadata(endpoint: string): EndpointMetadata | null {
    const normalized = endpoint.trim().toLowerCase();
    const metadata = METADATA_BY_KEY.get(normalized);
    return metadata ? { ...metadata, aliases: [...metadata.aliases] } : null;
}
