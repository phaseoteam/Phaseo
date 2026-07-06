import {
    normalizeChatTags,
    normalizeChatThread,
    type ChatThread,
} from "./chats";

const baseThread: ChatThread = {
    id: "chat_1",
    title: "Imported chat",
    modelId: "openai/gpt-5.5",
    createdAt: "2026-07-03T12:00:00.000Z",
    updatedAt: "2026-07-03T12:00:00.000Z",
    messages: [],
    settings: {
        temperature: null,
        maxOutputTokens: null,
        stream: true,
    },
};

describe("chat IndexedDB normalization", () => {
    it("drops malformed imported tags that are not arrays", () => {
        const thread = normalizeChatThread({
            ...baseThread,
            tags: { bad: true },
        } as unknown as ChatThread);

        expect(thread.tags).toEqual([]);
    });

    it("keeps valid tags and drops entries that cannot be rendered safely", () => {
        expect(
            normalizeChatTags([
                { id: "keep", name: "Important", color: "#0ea5e9" },
                { id: "default-color", name: "Needs colour" },
                { id: "missing-name", color: "#ef4444" },
                { name: "missing id", color: "#ef4444" },
                { id: "bad-name", name: { text: "Broken" }, color: "#ef4444" },
                null,
                "not a tag",
            ]),
        ).toEqual([
            { id: "keep", name: "Important", color: "#0ea5e9" },
            { id: "default-color", name: "Needs colour", color: "#737373" },
        ]);
    });

    it("normalizes thread tags to an iterable array before storage callers consume them", () => {
        const thread = normalizeChatThread({
            ...baseThread,
            tags: [
                { id: "a", name: "Alpha", color: "#22c55e" },
                { id: "bad", name: 123, color: "#ef4444" },
            ],
        } as unknown as ChatThread);

        expect(Array.isArray(thread.tags)).toBe(true);
        expect(thread.tags).toEqual([
            { id: "a", name: "Alpha", color: "#22c55e" },
        ]);
    });
});
