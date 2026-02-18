import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "openai",
    name: "OpenAI",
    requiredEnv: ["OPENAI_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.openai.com/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
