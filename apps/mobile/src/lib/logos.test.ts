import { builtInLogoData } from "@phaseo/app-kit/logos";
import { parseLogoData, resolverWith } from "./logos";

describe("published logo data", () => {
  test("the website's data parses as it is", () => {
    expect(parseLogoData(JSON.parse(JSON.stringify(builtInLogoData)))).toEqual(builtInLogoData);
  });

  test("a lab added after this build resolves, and the built-in ones still do", () => {
    const resolver = resolverWith({ logos: { "new-lab": { light: "/logos/new-lab_light.svg", dark: "/logos/new-lab_dark.svg" } }, labels: { "new-lab": "New Lab AI" }, aliases: { "newlab-cloud": "new-lab" } });
    expect(resolver.resolveLogo("new-lab", { theme: "dark" })).toMatchObject({ id: "new-lab", label: "New Lab AI", src: "/logos/new-lab_dark.svg" });
    expect(resolver.resolveLogo("newlab-cloud").id).toBe("new-lab");
    expect(resolver.resolveLogo("baselabs").src).toBe("/logos/baselabs.svg");
    expect(resolverWith(null).resolveLogo("new-lab").src).toBeUndefined();
  });

  test("paths must be files on phaseo.app, not other sites", () => {
    expect(() => parseLogoData({ logos: { evil: { color: "https://example.com/x.svg" } } })).toThrow();
    expect(() => parseLogoData({ logos: { evil: { color: "//example.com/x.svg" } } })).toThrow();
    expect(() => parseLogoData({ logos: { evil: { color: "/logos/../../x.svg" } } })).toThrow();
    expect(parseLogoData({ logos: { ok: { color: "/logos/ok.svg" } } })).toEqual({ logos: { ok: { color: "/logos/ok.svg" } }, labels: {}, aliases: {} });
  });
});
