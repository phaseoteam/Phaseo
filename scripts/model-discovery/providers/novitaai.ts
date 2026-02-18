import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "novitaai",
    name: "NovitaAI",
    requiredEnv: ["NOVITA_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.novita.ai/v3/openai/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.NOVITA_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
