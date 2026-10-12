import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpCallBudget } from "./mcpCallBudget";
describe("MCP active execution budget",()=>{
 beforeEach(()=>vi.useFakeTimers({toFake:["setTimeout","clearTimeout","performance"]}));afterEach(()=>vi.useRealTimers());
 it("expires without human interaction",()=>{const budget=new McpCallBudget();vi.advanceTimersByTime(60000);expect(budget.signal.aborted).toBe(true);budget.dispose();});
 it("excludes a long human wait and preserves the remaining active budget",()=>{const budget=new McpCallBudget();vi.advanceTimersByTime(20000);budget.pause();vi.advanceTimersByTime(3600000);expect(budget.signal.aborted).toBe(false);budget.resume();vi.advanceTimersByTime(39999);expect(budget.signal.aborted).toBe(false);vi.advanceTimersByTime(1);expect(budget.signal.aborted).toBe(true);});
 it("does not replenish execution time across repeated forms",()=>{const budget=new McpCallBudget();vi.advanceTimersByTime(10000);budget.pause();budget.pause();vi.advanceTimersByTime(300000);budget.resume();budget.resume();vi.advanceTimersByTime(10000);budget.pause();vi.advanceTimersByTime(300000);budget.resume();vi.advanceTimersByTime(40000);expect(budget.signal.aborted).toBe(true);});
 it("clears the timer after completion and cannot restart expired budgets",()=>{const budget=new McpCallBudget();budget.dispose();vi.advanceTimersByTime(60000);expect(budget.signal.aborted).toBe(false);const expired=new McpCallBudget(1);vi.advanceTimersByTime(1);expired.pause();expired.resume();expect(vi.getTimerCount()).toBe(0);});
});
