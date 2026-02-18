import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "anthropic",
    name: "Anthropic",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.anthropic.com/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY}`,
                    "anthropic-version": "2023-06-01",
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
