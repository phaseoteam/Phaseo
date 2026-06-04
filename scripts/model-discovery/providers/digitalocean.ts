import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "digitalocean",
    name: "DigitalOcean",
    requiredEnv: ["DIGITALOCEAN_TOKEN"],
    async fetchModels() {
        const apiToken = process.env.DIGITALOCEAN_TOKEN;
        if (!apiToken) {
            throw new Error("Missing API key: DIGITALOCEAN_TOKEN");
        }

        const payload = await fetchJson({
            url: "https://inference.do-ai.run/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    "Content-Type": "application/json",
                },
            },
        });

        const models = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(models, (item) => (typeof item.id === "string" ? item.id.trim() : null));
    },
});
