import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "moonshot-ai",
    name: "Moonshot AI",
    requiredEnv: ["MOONSHOT_AI_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.moonshot.cn/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.MOONSHOT_AI_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
