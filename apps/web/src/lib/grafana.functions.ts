import { createServerFn } from "@tanstack/react-start";
import { publicGrafanaConfig } from "./grafanaConfig";

export const getGrafanaBrowserConfig = createServerFn({ method: "GET" }).handler(() => publicGrafanaConfig(process.env));
