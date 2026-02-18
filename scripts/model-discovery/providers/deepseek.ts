import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "deepseek",
    name: "DeepSeek",
    requiredEnv: ["DEEPSEEK_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.deepseek.com/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
