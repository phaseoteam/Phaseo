import { vi } from "vitest";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

import { blockedNetwork as blocked } from "./network-guard";
export { networkAttempts } from "./network-guard";
// Installed before any routing imports. Guard sockets as well as fetch so an
// accidentally introduced SDK transport cannot silently escape the simulation.
vi.stubGlobal("fetch", blocked);
vi.stubGlobal("WebSocket", blocked);
vi.spyOn(net.Socket.prototype, "connect").mockImplementation(blocked);
vi.spyOn(net, "connect").mockImplementation(blocked);
vi.spyOn(net, "createConnection").mockImplementation(blocked);
vi.spyOn(tls, "connect").mockImplementation(blocked);
vi.spyOn(http, "request").mockImplementation(blocked);
vi.spyOn(http, "get").mockImplementation(blocked);
vi.spyOn(https, "request").mockImplementation(blocked);
vi.spyOn(https, "get").mockImplementation(blocked);
vi.spyOn(dgram, "createSocket").mockImplementation(blocked);
syncBuiltinESMExports();
