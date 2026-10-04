import { afterEach, describe, expect, it, vi } from "vitest";
import { closeMcpClient } from "./closeMcpClient";
describe("MCP server session cleanup",()=>{
 afterEach(()=>vi.useRealTimers());
 it("terminates before closing the transport",async()=>{const order:string[]=[];await closeMcpClient({close:async()=>{order.push('close');}},async()=>{order.push('terminate');});expect(order).toEqual(['terminate','close']);});
 it("still closes after an unconfirmed termination without exposing remote errors",async()=>{const close=vi.fn().mockResolvedValue(undefined),failure=vi.fn();await closeMcpClient({close},async()=>{throw Error('private server response');},failure);expect(close).toHaveBeenCalledOnce();expect(failure).toHaveBeenCalledWith();});
 it("bounds hung termination and clears its timer",async()=>{vi.useFakeTimers();const close=vi.fn().mockResolvedValue(undefined),failure=vi.fn();const operation=closeMcpClient({close},()=>new Promise(()=>{}),failure);await vi.advanceTimersByTimeAsync(2000);await operation;expect(close).toHaveBeenCalledOnce();expect(failure).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);});
 it("closes non-HTTP clients directly",async()=>{const close=vi.fn().mockResolvedValue(undefined);await closeMcpClient({close});expect(close).toHaveBeenCalledOnce();});
});
