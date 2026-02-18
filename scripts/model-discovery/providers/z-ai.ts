import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "z-ai",
    name: "z.AI",
    requiredEnv: ["ZAI_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://open.bigmodel.cn/api/paas/v4/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
