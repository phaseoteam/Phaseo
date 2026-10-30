import { resolveModelsCatalogueVersion } from "@/lib/models/catalogueVersion";

describe("resolveModelsCatalogueVersion", () => {
    it("uses the V2 catalogue after the hard cutover", async () => {
        await expect(resolveModelsCatalogueVersion()).resolves.toBe("v2");
    });
});
