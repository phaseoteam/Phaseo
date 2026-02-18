import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "mistral",
    name: "Mistral",
    requiredEnv: ["MISTRAL_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.mistral.ai/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
