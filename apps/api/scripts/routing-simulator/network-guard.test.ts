import { test, expect } from "vitest";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
import { blockStandaloneNetwork, networkAttempts } from "./network-guard";

test("standalone transport guard rejects every supported outbound transport", () => {
  const slots: Array<[object,string]> = [[globalThis,"fetch"],[globalThis,"WebSocket"],[net.Socket.prototype,"connect"],[net,"connect"],[net,"createConnection"],[tls,"connect"],[http,"request"],[http,"get"],[https,"request"],[https,"get"],[dgram,"createSocket"]];
  const restore = slots.map(([target,key])=>({target,key,value:Reflect.get(target,key)}));
  const before=networkAttempts.length;
  try {
    blockStandaloneNetwork();
    const attempts = [()=>fetch("https://never-sent.invalid"),()=>new WebSocket("wss://never-sent.invalid"),()=>net.connect(443,"never-sent.invalid"),()=>tls.connect(443,"never-sent.invalid"),()=>http.get("http://never-sent.invalid"),()=>https.request("https://never-sent.invalid"),()=>dgram.createSocket("udp4")];
    for(const attempt of attempts) expect(attempt).toThrow("forbids network");
    expect(networkAttempts.length-before).toBe(attempts.length);
  } finally { for(const {target,key,value} of restore) Reflect.set(target,key,value); syncBuiltinESMExports(); }
});
