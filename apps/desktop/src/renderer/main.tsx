import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesktopFlags } from "./lib/DesktopFlags";
import "./styles.css";
import developmentIcon from "../../assets/icon-development.svg";
import productionIcon from "../../assets/icon-production.svg";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = import.meta.env.DEV ? developmentIcon : productionIcon;
document.head.append(favicon);

const root = document.getElementById("root");

if (!root) throw new Error("Phaseo desktop root element was not found");

createRoot(root).render(
	<StrictMode>
		<DesktopFlags><App /></DesktopFlags>
	</StrictMode>,
);
