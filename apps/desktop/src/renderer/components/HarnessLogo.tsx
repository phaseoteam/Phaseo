import { Bot } from "lucide-react";
import type { Harness } from "../../shared/workspace";
import claude from "../../../../web/public/logos/claudecode.svg";
import codex from "../../../../web/public/logos/codex.svg";
import openCodeLight from "../../../../web/public/logos/opencode_light.svg";
import openCodeDark from "../../../../web/public/logos/opencode_dark.svg";
import cursorLight from "../../../../web/public/logos/cursor_light.svg";
import cursorDark from "../../../../web/public/logos/cursor_dark.svg";
import grokLight from "../../../../web/public/logos/grok_light.svg";
import grokDark from "../../../../web/public/logos/grok_dark.svg";

export function HarnessLogo({ harness }: { harness: Harness }) {
	const pair = harness === "opencode" ? [openCodeLight, openCodeDark] : harness === "cursor" ? [cursorLight, cursorDark] : harness === "grok" ? [grokLight, grokDark] : undefined;
	if (pair) return <span className="harness-logo" aria-hidden="true"><img className="harness-logo-light" src={pair[0]} alt="" /><img className="harness-logo-dark" src={pair[1]} alt="" /></span>;
	if (harness === "claude") return <img className="harness-logo" src={claude} alt="" />;
	if (harness === "codex") return <img className="harness-logo" src={codex} alt="" />;
	if (harness === "phaseo") return <span className="brand-mark harness-logo" aria-hidden="true" />;
	if (harness === "pi") return <span className="harness-logo harness-pi" aria-hidden="true">π</span>;
	return <Bot size={18} aria-hidden="true" />;
}
