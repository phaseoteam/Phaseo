import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "crofai",
    name: "CrofAI",
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://crof.ai/v1/models",
        });
        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
