import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { privateException } from "@phaseo/app-kit/app-analytics";
import { App } from "./App";
import { DesktopFlags } from "./lib/DesktopFlags";
import { mirrorModelPreferences } from "./lib/modelPreferences";
import "./index.css";
import developmentIcon from "../../assets/icon-development.svg";
import productionIcon from "../../assets/icon-production.svg";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = import.meta.env.DEV ? developmentIcon : productionIcon;
document.head.append(favicon);

const root = document.getElementById("root");

// Install before rendering so a failed first render can be reported too. The main process enforces consent.
const captureError = (value: unknown) => {
	const error = privateException(value);
	void window.phaseoDesktop?.analytics({ type: "error", name: error.name, stack: error.stack?.slice(0, 8000) ?? "" }).catch(() => {});
};
window.addEventListener("error", event => captureError(event.error));
window.addEventListener("unhandledrejection", event => captureError(event.reason));

if (!root) throw new Error("Phaseo desktop root element was not found");

// Main keeps the remembered model in memory only, so each start tells it again (for chats started from a phone).
mirrorModelPreferences();

// The performance suite times startup from this mark (scripts/perf).
performance.mark("phaseo:render-start");
createRoot(root).render(
	<StrictMode>
		<DesktopFlags><App /></DesktopFlags>
	</StrictMode>,
);
