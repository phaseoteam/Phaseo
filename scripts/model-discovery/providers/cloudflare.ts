import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

const CLOUDFLARE_MODELS_PAGE_SIZE = 1000;

export default defineProvider({
    id: "cloudflare",
    name: "Cloudflare",
    requiredEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    async fetchModels() {
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

        if (!apiToken) {
            throw new Error("Missing API key: CLOUDFLARE_API_TOKEN");
        }
        if (!accountId) {
            throw new Error("Missing Cloudflare account id: CLOUDFLARE_ACCOUNT_ID");
        }

        const models: unknown[] = [];

        for (let page = 1; ; page += 1) {
            const url = new URL(
                `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`
            );
            url.searchParams.set("page", String(page));
            url.searchParams.set("per_page", String(CLOUDFLARE_MODELS_PAGE_SIZE));

            const payload = await fetchJson({
                url: url.toString(),
                init: {
                    headers: {
                        Authorization: `Bearer ${apiToken}`,
                    },
                },
            });

            const payloadRecord = asRecord(payload);
            const result = asArray(payloadRecord?.result);
            const resultData = asArray(asRecord(payloadRecord?.result)?.data);
            const pageModels = result.length ? result : resultData;
            models.push(...pageModels);

            const resultInfo = asRecord(payloadRecord?.result_info);
            const totalPages = typeof resultInfo?.total_pages === "number" ? resultInfo.total_pages : null;

            if (totalPages !== null) {
                if (page >= totalPages) {
                    break;
                }
                continue;
            }

            if (pageModels.length < CLOUDFLARE_MODELS_PAGE_SIZE) {
                break;
            }
        }

        return normalizeModelEntries(models, (item) => {
            if (typeof item.name === "string" && item.name.trim()) {
                return item.name.trim();
            }
            if (typeof item.id === "string" && item.id.trim()) {
                return item.id.trim();
            }
            return null;
        });
    },
});
