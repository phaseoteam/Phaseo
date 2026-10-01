import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

export const networkAttempts: string[] = [];
export function blockedNetwork(): never {
  networkAttempts.push("Network access attempted");
  throw new Error("Routing simulator forbids network access");
}
/** Install before importing the routing bundle. This process is dedicated to simulations. */
export function blockStandaloneNetwork() {
  globalThis.fetch = blockedNetwork;
  globalThis.WebSocket = blockedNetwork as unknown as typeof WebSocket;
  net.Socket.prototype.connect = blockedNetwork;
  net.connect = blockedNetwork;
  net.createConnection = blockedNetwork;
  tls.connect = blockedNetwork;
  http.request = blockedNetwork; http.get = blockedNetwork;
  https.request = blockedNetwork; https.get = blockedNetwork;
  dgram.createSocket = blockedNetwork;
  syncBuiltinESMExports();
}
