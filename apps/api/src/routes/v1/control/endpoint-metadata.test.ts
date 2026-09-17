import { describe, expect, it } from "vitest";
import { findEndpointMetadata, getEndpointMetadata, listEndpointMetadata } from "./endpoint-metadata";

describe("endpoint metadata", () => {
    it.each([
        ["chat/completions", "chat.completions", "/v1/chat/completions", "text"],
        ["image.generate", "images.generations", "/v1/images/generations", "images"],
        ["video.generate", "video.generation", "/v1/videos", "video"],
        ["audio.transcriptions", "audio.transcription", "/v1/audio/transcriptions", "audio"],
        ["audio.transcribe", "audio.transcription", "/v1/audio/transcriptions", "audio"],
        ["audio.generate", "audio.speech", "/v1/audio/speech", "audio"],
        ["text.embed", "embeddings", "/v1/embeddings", "embeddings"],
        ["text.rerank", "rerank", "/v1/rerank", "rerank"],
        ["text.moderate", "moderations", "/v1/moderations", "moderation"],
        ["video.edit", "video.generation", "/v1/videos", "video"],
        ["systemone", "decisions.make", "/v1/systemone", "decisions"],
    ])("maps %s to its public endpoint", (alias, id, publicPath, collection) => {
        expect(getEndpointMetadata(alias)).toMatchObject({
            id,
            public_path: publicPath,
            collection,
        });
    });

    it("returns defensive copies", () => {
        const first = listEndpointMetadata();
        first[0].aliases.push("mutated");
        expect(listEndpointMetadata()[0].aliases).not.toContain("mutated");
    });

    it("rejects unmapped capabilities instead of inventing public paths", () => {
        expect(() => getEndpointMetadata("unknown.capability")).toThrow(
            "Unsupported public capability metadata",
        );
    });

    it("allows discovery callers to ignore non-endpoint capabilities", () => {
        expect(findEndpointMetadata("structured.output")).toBeNull();
        expect(findEndpointMetadata("text.generate")).toMatchObject({ id: "chat.completions" });
    });
});
