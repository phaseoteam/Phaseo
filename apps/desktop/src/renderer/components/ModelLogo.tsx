import { Bot } from "lucide-react";
import { resolveLogo } from "../../../../web/src/lib/logos";
import type { ModelOption } from "../../shared/workspace";
import type { Harness } from "../../shared/workspace";
import { HarnessLogo } from "./HarnessLogo";

// Bundle the web's brand assets so logos also work offline and in packaged builds.
const assets = import.meta.glob<string>("../../../../web/public/logos/*.svg", { eager: true, query: "?url", import: "default" });
const bundled = (path?: string) => path?.startsWith("/logos/") ? assets[`../../../../web/public${path}`] : undefined;

export function ModelLogo({ model, harness }: { model: ModelOption; harness?: Harness }) {
	// Models run by a local agent show that agent (the Claude Code mascot, the Codex app icon) so they read apart from Phaseo's models.
	if (harness && harness !== "phaseo") return <HarnessLogo harness={harness} />;
	const organisation = model.organisationId ?? (model.id.includes("/") ? model.id.split("/")[0] : /^(gpt-|o[134](?:-|$)|codex)/i.test(model.id) ? "openai" : /^claude/i.test(model.id) ? "anthropic" : /^gemini/i.test(model.id) ? "google" : /^grok/i.test(model.id) ? "xai" : "");
	const light = bundled(resolveLogo(organisation, { theme: "light" }).src);
	const dark = bundled(resolveLogo(organisation, { theme: "dark" }).src);
	if (!light || !dark) return harness ? <HarnessLogo harness={harness} /> : <Bot size={18} aria-hidden="true" />;
	return <span className="harness-logo" data-model-lab={organisation} aria-hidden="true"><img className="harness-logo-light" src={light} alt="" /><img className="harness-logo-dark" src={dark} alt="" /></span>;
}
