// Config file mapping capabilities to supported endpoints
export const capabilityToEndpoints: Record<string, string[]> = {
    "text.generate": ["/chat/completions", "/responses", "/messages"],
    "text.embed": ["/embeddings"],
    "image.generate": ["/images/generations"],
    "images.generate": ["/images/generations"],
    "image.edit": ["/images/edits"],
    "images.edits": ["/images/edits"],
    "image.vary": ["/images/variations"],
    "audio.transcribe": ["/audio/transcriptions"],
    "audio.translate": ["/audio/translations"],
    "audio.speech": ["/audio/speech"],
    "audio.realtime": ["/audio/realtime"],
    "moderation": ["/moderations"],
    "moderations.create": ["/moderations"],
    "batch": ["/batches"],
    "batch.create": ["/batches"],
    "music.generate": ["/music/generations"],
    "video.generations": ["/video/generations"],
    "ocr": ["/ocr"],
    // Add more as needed
};

// Reverse map for lookup
export const endpointToCapability: Record<string, string> = {};
for (const [cap, endpoints] of Object.entries(capabilityToEndpoints)) {
    for (const ep of endpoints) {
        endpointToCapability[ep] = cap;
    }
}
