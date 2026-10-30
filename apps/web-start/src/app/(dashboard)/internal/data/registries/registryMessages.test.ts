import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { REGISTRY_MESSAGE_KEYS, REGISTRY_OPTION_MESSAGE_KEYS } from "./registryMessages";

const source = fs.readFileSync(path.resolve(process.cwd(), "../web-api/src/routes/account/catalogRegistries.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const metadataModule = { exports: {} as { catalogRegistries?: Record<string, { title: string; fields: Array<{ key: string; options?: string[] }> }> } };
// Evaluate the repository's declarative registry metadata, not a copied fixture.
new Function("module", "exports", "require", compiled)(metadataModule, metadataModule.exports, require);
const registries = metadataModule.exports.catalogRegistries!;

describe("localized registry metadata", () => {
  it("covers every backend resource, field and non-currency enum", () => {
    for (const [resource, registry] of Object.entries(registries)) {
      expect(REGISTRY_MESSAGE_KEYS[resource]?.title).toBeTruthy();
      for (const field of registry.fields) {
        expect(REGISTRY_MESSAGE_KEYS[resource]?.fields[field.key]).toBeTruthy();
        for (const option of field.options ?? []) {
          if (!/^[A-Z]{3}$/.test(option)) expect(REGISTRY_OPTION_MESSAGE_KEYS[option]).toBeTruthy();
        }
      }
    }
  });
  it.each(["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"])("resolves all mapped labels in %s", (locale) => {
    const catalogs: Record<string, unknown> = {
      Common: JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, "common.json"), "utf8")),
      Catalogue: JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, "catalogue.json"), "utf8")),
      Product: JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, "product.json"), "utf8")),
      SettingsUI: JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, "settings-ui.json"), "utf8")),
    };
    const keys = [...Object.values(REGISTRY_MESSAGE_KEYS).flatMap((resource) => [resource.title, ...Object.values(resource.fields)]), ...Object.values(REGISTRY_OPTION_MESSAGE_KEYS)];
    for (const key of keys) {
      const value = key.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined, catalogs);
      expect(typeof value).toBe("string");
      expect(value).not.toBe("");
    }
  });
});
