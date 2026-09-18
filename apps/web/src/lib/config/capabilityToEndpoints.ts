// Config file mapping capabilities to supported endpoints
export const capabilityToEndpoints: Record<string, string[]> = {
    "text.generate": ["/chat/completions", "/responses", "/messages"],
    "decisions.make": ["/decisions"],
    // Compatibility aliases for the legacy capability names. The public route is /decisions.
    "systemone": ["/decisions"],
    "system.one": ["/decisions"],
    "decision.make": ["/decisions"],
    "typed.decisions": ["/decisions"],
    "text.embed": ["/embeddings"],
    "image.generate": ["/images/generations"],
    "images.generate": ["/images/generations"],
    "image.edit": ["/images/edits"],
    "images.edits": ["/images/edits"],
    "image.vary": ["/images/variations"],
    "audio.transcribe": ["/audio/transcriptions"],
    "audio.transcription": ["/audio/transcriptions"],
    "audio.translate": ["/audio/translations"],
    "audio.translation": ["/audio/translations"],
    "audio.translations": ["/audio/translations"],
    "audio.speech": ["/audio/speech"],
    "audio.realtime": ["/audio/realtime"],
    "realtime": ["/audio/realtime"],
    "moderation": ["/moderations"],
    "moderations.create": ["/moderations"],
    "text.moderate": ["/moderations"],
    "batch": ["/batches"],
    "batch.create": ["/batches"],
    "music.generate": ["/music/generations"],
    "video.generations": ["/video/generations"],
    "ocr": ["/ocr"],
    "parse": ["/parse"],
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
